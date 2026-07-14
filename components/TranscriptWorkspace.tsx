import { useMemo } from 'react';
import type { TranscriptSegment, TranscriptionResult, TranscriptionStatus } from '../types';
import { formatDuration } from '../utils/audioUtils';
import { Icon } from './Icon';

interface TranscriptWorkspaceProps {
  hasAudio: boolean;
  result: TranscriptionResult | null;
  status: TranscriptionStatus;
  statusMessage: string;
  currentTime: number;
  speakerFilter: string;
  search: string;
  copied: boolean;
  onTitleChange: (title: string) => void;
  onSegmentChange: (segmentId: string, text: string) => void;
  onSeek: (time: number) => void;
  onSpeakerFilterChange: (speakerId: string) => void;
  onSearchChange: (search: string) => void;
  onCopy: () => void;
  onExport: () => void;
}

export function TranscriptWorkspace({
  hasAudio,
  result,
  status,
  statusMessage,
  currentTime,
  speakerFilter,
  search,
  copied,
  onTitleChange,
  onSegmentChange,
  onSeek,
  onSpeakerFilterChange,
  onSearchChange,
  onCopy,
  onExport,
}: TranscriptWorkspaceProps) {
  const speakerMap = useMemo(
    () => new Map(result?.speakers.map((speaker) => [speaker.id, speaker]) ?? []),
    [result?.speakers],
  );

  if (!result) {
    const isBusy = status === 'uploading' || status === 'preparing' || status === 'transcribing';
    return (
      <main className="empty-workspace">
        {isBusy ? (
          <div className="working-state">
            <span className="working-mark"><Icon name="audio" size={28} /></span>
            <div className="eyebrow">Procesamiento en curso</div>
            <h1>{statusMessage}</h1>
            <p>Puedes cancelar el proceso desde el panel lateral. No cierres esta pestaña.</p>
          </div>
        ) : (
          <div className="intro-block">
            <div className="eyebrow">Transcripción de reuniones</div>
            <h1>Una conversación.<br />Un registro utilizable.</h1>
            <p className="intro-copy">
              Transcripción completa, interlocutores consistentes y marcas de tiempo navegables.
              Sin métricas inventadas ni paneles que oculten el contenido.
            </p>
            <div className="intro-flow" aria-label="Flujo de trabajo">
              <div><span>01</span><strong>Sube</strong><small>la grabación original</small></div>
              <Icon name="chevron" size={17} />
              <div><span>02</span><strong>Revisa</strong><small>texto e interlocutores</small></div>
              <Icon name="chevron" size={17} />
              <div><span>03</span><strong>Exporta</strong><small>un registro limpio</small></div>
            </div>
            {!hasAudio && <div className="intro-hint">Empieza seleccionando un archivo en el panel lateral.</div>}
            {hasAudio && <div className="intro-hint">El audio está listo. Inicia la transcripción desde el panel lateral.</div>}
          </div>
        )}
      </main>
    );
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredSegments = result.segments.filter((segment) => {
    const speaker = speakerMap.get(segment.speakerId)?.name ?? '';
    const matchesSpeaker = speakerFilter === 'all' || segment.speakerId === speakerFilter;
    const matchesSearch = !normalizedSearch
      || segment.text.toLocaleLowerCase().includes(normalizedSearch)
      || speaker.toLocaleLowerCase().includes(normalizedSearch);
    return matchesSpeaker && matchesSearch;
  });

  const wordCount = result.segments.reduce(
    (total, segment) => total + segment.text.split(/\s+/).filter(Boolean).length,
    0,
  );

  return (
    <main className="transcript-workspace">
      <header className="transcript-header">
        <div className="title-stack">
          <div className="eyebrow">Transcripción completa</div>
          <input
            aria-label="Título de la reunión"
            className="meeting-title"
            value={result.title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <div className="meeting-meta">
            <span>{result.language}</span>
            <span>{result.speakers.length} interlocutores</span>
            <span>{wordCount.toLocaleString('es-ES')} palabras</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="quiet-button" type="button" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'copy'} size={16} />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button className="quiet-button" type="button" onClick={onExport}>
            <Icon name="download" size={16} />
            Exportar TXT
          </button>
        </div>
      </header>

      <div className="transcript-tools">
        <label className="search-field">
          <Icon name="search" size={16} />
          <input
            placeholder="Buscar en la conversación"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="speaker-filters" aria-label="Filtrar por interlocutor">
          <button
            className={speakerFilter === 'all' ? 'is-active' : ''}
            type="button"
            onClick={() => onSpeakerFilterChange('all')}
          >
            Todos
          </button>
          {result.speakers.map((speaker) => (
            <button
              className={speakerFilter === speaker.id ? 'is-active' : ''}
              key={speaker.id}
              type="button"
              onClick={() => onSpeakerFilterChange(speaker.id)}
            >
              <span className="speaker-dot" style={{ background: speaker.color }} />
              {speaker.name}
            </button>
          ))}
        </div>
      </div>

      <div className="transcript-scroll">
        <div className="transcript-list">
          {filteredSegments.map((segment) => (
            <SegmentRow
              currentTime={currentTime}
              key={segment.id}
              segment={segment}
              speaker={speakerMap.get(segment.speakerId)}
              onChange={onSegmentChange}
              onSeek={onSeek}
            />
          ))}
          {filteredSegments.length === 0 && (
            <div className="no-results">No hay intervenciones que coincidan con el filtro.</div>
          )}
        </div>
      </div>
    </main>
  );
}

interface SegmentRowProps {
  segment: TranscriptSegment;
  speaker?: TranscriptionResult['speakers'][number];
  currentTime: number;
  onChange: (segmentId: string, text: string) => void;
  onSeek: (time: number) => void;
}

function SegmentRow({ segment, speaker, currentTime, onChange, onSeek }: SegmentRowProps) {
  const isCurrent = currentTime >= segment.startTime && currentTime <= Math.max(segment.endTime, segment.startTime + 1);
  const rows = Math.max(2, Math.min(8, Math.ceil(segment.text.length / 105)));

  return (
    <article className={`segment-row ${isCurrent ? 'is-current' : ''}`}>
      <div className="segment-identity">
        <span className="speaker-bar" style={{ background: speaker?.color ?? '#777' }} />
        <strong>{speaker?.name ?? segment.speakerId}</strong>
        <button type="button" onClick={() => onSeek(segment.startTime)}>
          {formatDuration(segment.startTime, segment.startTime >= 3600)}
        </button>
      </div>
      <textarea
        aria-label={`Intervención de ${speaker?.name ?? segment.speakerId}`}
        rows={rows}
        value={segment.text}
        onChange={(event) => onChange(segment.id, event.target.value)}
      />
    </article>
  );
}
