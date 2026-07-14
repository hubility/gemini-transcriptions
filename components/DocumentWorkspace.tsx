import type { DocumentType, TranscriptionResult } from '../types';
import { Icon } from './Icon';

interface DocumentWorkspaceProps {
  result: TranscriptionResult | null;
  documentType: DocumentType;
  generatedDocument: string;
  isGenerating: boolean;
  error: string;
  onDocumentTypeChange: (type: DocumentType) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onDocumentChange: (content: string) => void;
  onExport: () => void;
}

const documentOptions: Array<{ type: DocumentType; label: string; description: string }> = [
  { type: 'minutes', label: 'Acta operativa', description: 'Decisiones, acciones y asuntos pendientes.' },
  { type: 'proposal', label: 'Propuesta', description: 'Contexto, alcance y próximos pasos.' },
  { type: 'upselling', label: 'Ampliación', description: 'Oportunidades respaldadas por evidencias.' },
];

export function DocumentWorkspace({
  result,
  documentType,
  generatedDocument,
  isGenerating,
  error,
  onDocumentTypeChange,
  onGenerate,
  onCancel,
  onDocumentChange,
  onExport,
}: DocumentWorkspaceProps) {
  if (!result) {
    return (
      <main className="empty-workspace">
        <div className="working-state document-empty">
          <span className="working-mark"><Icon name="document" size={27} /></span>
          <div className="eyebrow">Documentos</div>
          <h1>Primero necesitas una transcripción.</h1>
          <p>Los documentos se generan únicamente con el contenido revisado de la reunión.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="document-workspace">
      <section className="document-config">
        <div>
          <div className="eyebrow">Documento derivado</div>
          <h1>Convierte el registro en una salida de trabajo.</h1>
          <p>Gemini usará la transcripción corregida, incluidos los nombres editados.</p>
        </div>

        <div className="document-options">
          {documentOptions.map((option) => (
            <button
              className={documentType === option.type ? 'is-selected' : ''}
              key={option.type}
              type="button"
              onClick={() => onDocumentTypeChange(option.type)}
            >
              <span className="option-marker">{documentType === option.type ? <Icon name="check" size={14} /> : ''}</span>
              <span><strong>{option.label}</strong><small>{option.description}</small></span>
            </button>
          ))}
        </div>

        {error && <div className="error-note" role="alert">{error}</div>}

        {isGenerating ? (
          <button className="secondary-action danger-action" type="button" onClick={onCancel}>
            <Icon name="stop" size={16} />
            Cancelar generación
          </button>
        ) : (
          <button className="primary-action" type="button" onClick={onGenerate}>
            <Icon name="document" size={17} />
            {generatedDocument ? 'Generar de nuevo' : 'Generar documento'}
          </button>
        )}
      </section>

      <section className="document-output">
        <header>
          <div>
            <div className="section-kicker">Salida editable</div>
            <strong>{result.title}</strong>
          </div>
          <button className="quiet-button" disabled={!generatedDocument} type="button" onClick={onExport}>
            <Icon name="download" size={16} />
            Exportar MD
          </button>
        </header>

        {isGenerating ? (
          <div className="document-generating">
            <span className="activity-dot" />
            Analizando decisiones y evidencias de la reunión…
          </div>
        ) : generatedDocument ? (
          <textarea
            aria-label="Documento generado"
            value={generatedDocument}
            onChange={(event) => onDocumentChange(event.target.value)}
          />
        ) : (
          <div className="document-placeholder">
            <span><Icon name="document" size={28} /></span>
            <p>Selecciona un formato y genera el primer borrador.</p>
          </div>
        )}
      </section>
    </main>
  );
}
