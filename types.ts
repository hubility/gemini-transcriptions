export type TranscriptionStatus =
  | 'idle'
  | 'uploading'
  | 'preparing'
  | 'transcribing'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface AudioFileInfo {
  file: File;
  name: string;
  duration: number;
  sizeBytes: number;
  mimeType: string;
}

export interface SpeakerProfile {
  id: string;
  name: string;
  color: string;
}

export interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speakerId: string;
  text: string;
}

export interface TranscriptionResult {
  title: string;
  language: string;
  speakers: SpeakerProfile[];
  segments: TranscriptSegment[];
}

export type ProgressCallback = (
  status: Exclude<TranscriptionStatus, 'idle' | 'completed' | 'error' | 'cancelled'>,
  message: string,
) => void;

export type DocumentType = 'proposal' | 'upselling' | 'minutes';
