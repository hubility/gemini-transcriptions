import { GoogleGenAI, Type } from '@google/genai';
import {
  DOCUMENT_PROMPTS,
  SPEAKER_COLORS,
  TRANSCRIPTION_MODEL,
  TRANSCRIPTION_PROMPT,
} from '../constants';
import type {
  DocumentType,
  ProgressCallback,
  SpeakerProfile,
  TranscriptSegment,
  TranscriptionResult,
} from '../types';
import { getSafeMimeType } from '../utils/audioUtils';

interface RawParticipant {
  id?: string;
  name?: string;
}

interface RawSegment {
  start_seconds?: number;
  end_seconds?: number;
  speaker_id?: string;
  text?: string;
}

interface RawTranscription {
  title?: string;
  language?: string;
  participants?: RawParticipant[];
  segments?: RawSegment[];
}

const transcriptionSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título breve y descriptivo. No inventar cliente ni proyecto.',
    },
    language: {
      type: Type.STRING,
      description: 'Idioma principal de la reunión.',
    },
    participants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'speaker_1, speaker_2, etc.' },
          name: { type: Type.STRING, description: 'Nombre confirmado o Interlocutor N.' },
        },
        required: ['id', 'name'],
      },
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          start_seconds: { type: Type.NUMBER },
          end_seconds: { type: Type.NUMBER },
          speaker_id: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ['start_seconds', 'end_seconds', 'speaker_id', 'text'],
      },
    },
  },
  required: ['title', 'language', 'participants', 'segments'],
};

function createClient(): GoogleGenAI {
  // AI Studio sustituye process.env.API_KEY al construir la aplicación.
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
}

function abortError(): DOMException {
  return new DOMException('Operación cancelada', 'AbortError');
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|500|502|503|504|rate|quota|temporar|timeout|network|fetch/i.test(message);
}

async function withRetry<T>(
  operation: () => Promise<T>,
  signal: AbortSignal | undefined,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw abortError();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      await wait(1200 * 2 ** attempt, signal);
    }
  }

  throw lastError;
}

async function waitUntilReady(
  ai: GoogleGenAI,
  fileName: string,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + 2 * 60 * 1000;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError();
    const file = await ai.files.get({ name: fileName });
    const state = String(file.state ?? 'ACTIVE').toUpperCase();

    if (state === 'ACTIVE') return;
    if (state === 'FAILED') throw new Error('Gemini no pudo preparar el archivo de audio.');
    await wait(1500, signal);
  }

  throw new Error('Gemini tardó demasiado en preparar el archivo.');
}

function parseJson(text: string): RawTranscription {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(cleaned) as RawTranscription;
  } catch {
    throw new Error('Gemini devolvió una transcripción incompleta. Puedes volver a intentarlo.');
  }
}

function normalizeResult(raw: RawTranscription): TranscriptionResult {
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const participantMap = new Map<string, string>();

  for (const participant of raw.participants ?? []) {
    const id = participant.id?.trim();
    if (id) participantMap.set(id, participant.name?.trim() || id);
  }

  const segments: TranscriptSegment[] = rawSegments
    .map((segment, index) => {
      const speakerId = segment.speaker_id?.trim() || 'speaker_1';
      if (!participantMap.has(speakerId)) {
        participantMap.set(speakerId, `Interlocutor ${participantMap.size + 1}`);
      }

      const startTime = Math.max(0, Number(segment.start_seconds) || 0);
      const proposedEnd = Number(segment.end_seconds);
      const endTime = Number.isFinite(proposedEnd) ? Math.max(startTime, proposedEnd) : startTime;

      return {
        id: `${speakerId}-${Math.round(startTime * 10)}-${index}`,
        startTime,
        endTime,
        speakerId,
        text: segment.text?.trim() || '',
      };
    })
    .filter((segment) => segment.text.length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  if (segments.length === 0) {
    throw new Error('No se detectó voz transcribible en el archivo.');
  }

  const speakers: SpeakerProfile[] = Array.from(participantMap.entries()).map(([id, name], index) => ({
    id,
    name,
    color: SPEAKER_COLORS[index % SPEAKER_COLORS.length],
  }));

  return {
    title: raw.title?.trim() || 'Reunión sin título',
    language: raw.language?.trim() || 'No identificado',
    speakers,
    segments,
  };
}

export async function transcribeMeeting(
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: ProgressCallback;
  } = {},
): Promise<TranscriptionResult> {
  const { signal, onProgress } = options;
  const ai = createClient();
  let uploadedFileName: string | undefined;

  try {
    onProgress?.('uploading', 'Subiendo el audio de forma segura a Gemini');
    const uploaded = await ai.files.upload({
      file,
      config: {
        displayName: file.name,
        mimeType: getSafeMimeType(file),
        abortSignal: signal,
      },
    });

    if (!uploaded.name || !uploaded.uri) {
      throw new Error('Gemini no devolvió una referencia válida para el archivo.');
    }

    uploadedFileName = uploaded.name;
    onProgress?.('preparing', 'Preparando el audio para su análisis');
    await waitUntilReady(ai, uploaded.name, signal);

    onProgress?.('transcribing', 'Transcribiendo e identificando interlocutores');
    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: TRANSCRIPTION_MODEL,
          contents: [
            { text: TRANSCRIPTION_PROMPT },
            {
              fileData: {
                fileUri: uploaded.uri,
                mimeType: uploaded.mimeType || getSafeMimeType(file),
              },
            },
          ],
          config: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: transcriptionSchema,
          },
        }),
      signal,
    );

    if (signal?.aborted) throw abortError();
    return normalizeResult(parseJson(response.text || ''));
  } finally {
    if (uploadedFileName) {
      await ai.files.delete({ name: uploadedFileName }).catch(() => undefined);
    }
  }
}

export async function generateBusinessDocument(
  transcriptText: string,
  type: DocumentType,
  signal?: AbortSignal,
): Promise<string> {
  const ai = createClient();
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: TRANSCRIPTION_MODEL,
        contents: [
          { text: DOCUMENT_PROMPTS[type] },
          { text: `\n\n--- TRANSCRIPCIÓN DE LA REUNIÓN ---\n${transcriptText}` },
        ],
        config: {
          temperature: 0.2,
          abortSignal: signal,
        },
      }),
    signal,
  );

  const text = response.text?.trim();
  if (!text) throw new Error('Gemini no devolvió contenido para el documento.');
  return text;
}

export function getReadableGeminiError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Operación cancelada.';
  const message = error instanceof Error ? error.message : String(error);

  if (/api.?key|401|403/i.test(message)) return 'No se pudo validar la clave de Gemini en AI Studio.';
  if (/429|quota|rate/i.test(message)) return 'Gemini ha alcanzado temporalmente su límite. Espera un momento y vuelve a intentarlo.';
  if (/network|fetch/i.test(message)) return 'Se perdió la conexión durante el procesamiento.';
  return message || 'No se pudo completar la transcripción.';
}
