import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer } from './components/AudioPlayer';
import { DocumentWorkspace } from './components/DocumentWorkspace';
import { Icon } from './components/Icon';
import { ProcessingSidebar } from './components/ProcessingSidebar';
import { TranscriptWorkspace } from './components/TranscriptWorkspace';
import { MAX_FILE_SIZE_BYTES } from './constants';
import {
  generateBusinessDocument,
  getReadableGeminiError,
  transcribeMeeting,
} from './services/geminiService';
import type {
  AudioFileInfo,
  DocumentType,
  TranscriptionResult,
  TranscriptionStatus,
} from './types';
import {
  formatDuration,
  getAudioDuration,
  getSafeMimeType,
  sanitizeFileName,
} from './utils/audioUtils';

type View = 'transcript' | 'documents';

function App() {
  const [view, setView] = useState<View>('transcript');
  const [audio, setAudio] = useState<AudioFileInfo | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speakerFilter, setSpeakerFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>('minutes');
  const [generatedDocument, setGeneratedDocument] = useState('');
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);
  const [documentError, setDocumentError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const documentAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      transcriptionAbortRef.current?.abort();
      documentAbortRef.current?.abort();
    };
  }, []);

  const transcriptText = useMemo(() => {
    if (!result) return '';
    const speakerMap = new Map(result.speakers.map((speaker) => [speaker.id, speaker.name]));
    return result.segments
      .map((segment) => `[${formatDuration(segment.startTime, segment.startTime >= 3600)}] ${speakerMap.get(segment.speakerId) ?? segment.speakerId}: ${segment.text}`)
      .join('\n\n');
  }, [result]);

  const selectFile = async (file: File) => {
    setError('');
    setStatusMessage('');

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus('error');
      setError('El archivo supera el límite de 2 GB admitido por Gemini.');
      return;
    }

    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac|aiff?|webm)$/i.test(file.name)) {
      setStatus('error');
      setError('Selecciona un archivo de audio compatible.');
      return;
    }

    try {
      const duration = await getAudioDuration(file);
      const url = URL.createObjectURL(file);
      setAudio({
        file,
        name: file.name,
        duration,
        sizeBytes: file.size,
        mimeType: getSafeMimeType(file),
      });
      setAudioUrl(url);
      setResult(null);
      setGeneratedDocument('');
      setCurrentTime(0);
      setIsPlaying(false);
      setSpeakerFilter('all');
      setSearch('');
      setStatus('idle');
      setStatusMessage('Audio listo para transcribir');
      setView('transcript');
    } catch (selectionError) {
      setStatus('error');
      setError(selectionError instanceof Error ? selectionError.message : 'No se pudo abrir el archivo.');
    }
  };

  const startTranscription = async () => {
    if (!audio) return;
    const controller = new AbortController();
    transcriptionAbortRef.current = controller;
    setError('');
    setResult(null);
    setStatus('uploading');
    setView('transcript');

    try {
      const transcription = await transcribeMeeting(audio.file, {
        signal: controller.signal,
        onProgress: (nextStatus, message) => {
          setStatus(nextStatus);
          setStatusMessage(message);
        },
      });
      setResult(transcription);
      setStatus('completed');
      setStatusMessage('Transcripción lista para revisar');
    } catch (transcriptionError) {
      if (controller.signal.aborted) {
        setStatus('cancelled');
        setStatusMessage('Procesamiento cancelado');
      } else {
        setStatus('error');
        setStatusMessage('No se completó la transcripción');
        setError(getReadableGeminiError(transcriptionError));
      }
    } finally {
      if (transcriptionAbortRef.current === controller) transcriptionAbortRef.current = null;
    }
  };

  const cancelTranscription = () => transcriptionAbortRef.current?.abort();

  const renameSpeaker = (speakerId: string, name: string) => {
    setResult((current) => current ? {
      ...current,
      speakers: current.speakers.map((speaker) => speaker.id === speakerId ? { ...speaker, name } : speaker),
    } : current);
  };

  const updateSegment = (segmentId: string, text: string) => {
    setResult((current) => current ? {
      ...current,
      segments: current.segments.map((segment) => segment.id === segmentId ? { ...segment, text } : segment),
    } : current);
  };

  const updateTitle = (title: string) => {
    setResult((current) => current ? { ...current, title } : current);
  };

  const seekTo = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(transcriptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = (content: string, fileName: string, type = 'text/plain;charset=utf-8') => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportTranscript = () => {
    const baseName = sanitizeFileName(result?.title || audio?.name || 'transcripcion');
    download(transcriptText, `${baseName}.txt`);
  };

  const generateDocument = async () => {
    if (!result || !transcriptText) return;
    const controller = new AbortController();
    documentAbortRef.current = controller;
    setIsGeneratingDocument(true);
    setDocumentError('');

    try {
      const document = await generateBusinessDocument(transcriptText, documentType, controller.signal);
      setGeneratedDocument(document);
    } catch (generationError) {
      if (!controller.signal.aborted) setDocumentError(getReadableGeminiError(generationError));
    } finally {
      setIsGeneratingDocument(false);
      if (documentAbortRef.current === controller) documentAbortRef.current = null;
    }
  };

  const exportDocument = () => {
    const baseName = sanitizeFileName(result?.title || 'reunion');
    download(generatedDocument, `${baseName}-${documentType}.md`, 'text/markdown;charset=utf-8');
  };

  const isBusy = status === 'uploading' || status === 'preparing' || status === 'transcribing';

  return (
    <div className={`app-shell ${audioUrl ? 'has-player' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Icon name="audio" size={20} /></span>
          <span><strong>Registro</strong><small>Reuniones · Gemini</small></span>
        </div>

        <nav className="view-tabs" aria-label="Vista principal">
          <button className={view === 'transcript' ? 'is-active' : ''} type="button" onClick={() => setView('transcript')}>
            Transcripción
          </button>
          <button className={view === 'documents' ? 'is-active' : ''} type="button" onClick={() => setView('documents')}>
            Documentos
            {result && <span className="tab-ready-dot" />}
          </button>
        </nav>

        <div className="topbar-status">
          <span className={`status-dot ${isBusy ? 'is-busy' : ''}`} />
          {isBusy ? 'Procesando' : result ? 'Lista para revisar' : 'Sin procesamiento'}
        </div>
      </header>

      <div className="workspace-shell">
        <ProcessingSidebar
          audio={audio}
          error={error}
          speakers={result?.speakers ?? []}
          status={status}
          statusMessage={statusMessage}
          onCancel={cancelTranscription}
          onFileSelect={selectFile}
          onRenameSpeaker={renameSpeaker}
          onStart={startTranscription}
        />

        {view === 'transcript' ? (
          <TranscriptWorkspace
            copied={copied}
            currentTime={currentTime}
            hasAudio={Boolean(audio)}
            result={result}
            search={search}
            speakerFilter={speakerFilter}
            status={status}
            statusMessage={statusMessage}
            onCopy={copyTranscript}
            onExport={exportTranscript}
            onSearchChange={setSearch}
            onSeek={seekTo}
            onSegmentChange={updateSegment}
            onSpeakerFilterChange={setSpeakerFilter}
            onTitleChange={updateTitle}
          />
        ) : (
          <DocumentWorkspace
            documentType={documentType}
            error={documentError}
            generatedDocument={generatedDocument}
            isGenerating={isGeneratingDocument}
            result={result}
            onCancel={() => documentAbortRef.current?.abort()}
            onDocumentChange={setGeneratedDocument}
            onDocumentTypeChange={setDocumentType}
            onExport={exportDocument}
            onGenerate={generateDocument}
          />
        )}
      </div>

      {audioUrl && audio && (
        <AudioPlayer
          audioRef={audioRef}
          audioUrl={audioUrl}
          currentTime={currentTime}
          duration={audio.duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          onCurrentTimeChange={setCurrentTime}
          onPlaybackRateChange={setPlaybackRate}
          onPlayingChange={setIsPlaying}
        />
      )}
    </div>
  );
}

export default App;
