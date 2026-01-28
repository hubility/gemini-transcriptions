
export interface TranscriptSegment {
  id: string;
  timestamp: string;
  speaker: string;
  text: string;
  confidence?: number;
  isProcessing?: boolean;
}

export interface AudioFile {
  file: File;
  name: string;
  duration: number;
  size: string;
}

export interface ChunkProgress {
  chunkIndex: number;
  totalChunks: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}
