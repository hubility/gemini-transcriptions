import { useRef, useState } from 'react';
import type { AudioFileInfo, SpeakerProfile, TranscriptionStatus } from '../types';
import { formatDuration, formatFileSize } from '../utils/audioUtils';
import { Icon } from './Icon';

interface ProcessingSidebarProps {
  audio: AudioFileInfo | null;
  status: TranscriptionStatus;
  statusMessage: string;
  error: string;
  speakers: SpeakerProfile[];
  onFileSelect: (file: File) => void;
  onStart: () => void;
  onCancel: () => void;
  onRenameSpeaker: (speakerId: string, name: string) => void;
}

const steps = [
  { id: 'uploading', label: 'Subida' },
  { id: 'preparing', label: 'Preparación' },
  { id: 'transcribing', label: 'Transcripción' },
] as const;

export function ProcessingSidebar({
  audio,
  status,
  statusMessage,
  error,
  speakers,
  onFileSelect,
  onStart,
  onCancel,
  onRenameSpeaker,
}: ProcessingSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isBusy = status === 'uploading' || status === 'preparing' || status === 'transcribing';
  const currentStep = steps.findIndex((step) => step.id === status);

  const receiveFile = (file?: File) => {
    if (!file || isBusy) return;
    onFileSelect(file);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section sidebar-source">
        <div className="section-kicker">01 / Fuente</div>
        <input
          ref={inputRef}
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.aiff,.webm"
          className="visually-hidden"
          type="file"
          onChange={(event) => {
            receiveFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />

        {!audio ? (
          <button
            className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              receiveFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="drop-icon"><Icon name="upload" size={22} /></span>
            <strong>Selecciona una grabación</strong>
            <span>o arrástrala hasta aquí</span>
            <small>MP3, WAV, M4A, AAC, OGG, FLAC</small>
          </button>
        ) : (
          <div className="file-card">
            <span className="file-card-icon"><Icon name="audio" size={22} /></span>
            <div className="file-card-copy">
              <strong title={audio.name}>{audio.name}</strong>
              <span>{formatDuration(audio.duration, audio.duration >= 3600)} · {formatFileSize(audio.sizeBytes)}</span>
            </div>
            <button
              aria-label="Cambiar archivo"
              className="icon-button"
              disabled={isBusy}
              title="Cambiar archivo"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              <Icon name="edit" size={16} />
            </button>
          </div>
        )}

        {audio && !isBusy && status !== 'completed' && (
          <button className="primary-action" type="button" onClick={onStart}>
            <Icon name="audio" size={18} />
            {status === 'error' || status === 'cancelled' ? 'Volver a intentar' : 'Transcribir reunión'}
          </button>
        )}

        {isBusy && (
          <button className="secondary-action danger-action" type="button" onClick={onCancel}>
            <Icon name="stop" size={16} />
            Cancelar procesamiento
          </button>
        )}

        {error && <div className="error-note" role="alert">{error}</div>}
      </div>

      {(status !== 'idle' || audio) && (
        <div className="sidebar-section">
          <div className="section-kicker">02 / Proceso</div>
          <div className="process-list">
            {steps.map((step, index) => {
              const isDone = status === 'completed' || currentStep > index;
              const isCurrent = currentStep === index;
              return (
                <div className={`process-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`} key={step.id}>
                  <span className="step-marker">{isDone ? <Icon name="check" size={13} /> : String(index + 1).padStart(2, '0')}</span>
                  <span>{step.label}</span>
                  {isCurrent && <span className="activity-dot" aria-label="En curso" />}
                </div>
              );
            })}
          </div>
          {statusMessage && <p className="process-message">{statusMessage}</p>}
        </div>
      )}

      {speakers.length > 0 && (
        <div className="sidebar-section speaker-section">
          <div className="section-kicker">03 / Interlocutores</div>
          <p className="section-help">Corrige un nombre una vez y se aplicará a toda la reunión.</p>
          <div className="speaker-editor-list">
            {speakers.map((speaker) => (
              <label className="speaker-editor" key={speaker.id}>
                <span className="speaker-dot" style={{ background: speaker.color }} />
                <input
                  aria-label={`Nombre de ${speaker.id}`}
                  value={speaker.name}
                  onChange={(event) => onRenameSpeaker(speaker.id, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="privacy-dot" />
        El audio se elimina de Gemini al terminar.
      </div>
    </aside>
  );
}
