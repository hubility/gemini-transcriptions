import type { DocumentType } from './types';

export const TRANSCRIPTION_MODEL = 'gemini-3.5-flash';
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export const SPEAKER_COLORS = [
  '#d97757',
  '#4f7cac',
  '#678d58',
  '#9b6b9e',
  '#b8872f',
  '#4d8f8a',
  '#aa5f73',
  '#6f7f9a',
];

export const TRANSCRIPTION_PROMPT = `
Transcribe íntegramente esta reunión profesional.

Objetivo:
- Producir una transcripción fiel, legible y completa.
- Diferenciar a todos los participantes de forma consistente durante TODO el audio.
- Mantener el idioma original de cada intervención. No traduzcas.

Diarización:
- Analiza el audio completo antes de asignar identificadores.
- Asigna speaker_id como "speaker_1", "speaker_2", etc. según el orden de primera aparición.
- Mantén el mismo speaker_id cada vez que reaparezca esa voz.
- Si el nombre de una persona se confirma explícitamente, úsalo en participants.name.
- Si no se confirma, usa "Interlocutor 1", "Interlocutor 2", etc.
- No deduzcas identidades por contexto ni inventes nombres.

Segmentación:
- Crea un segmento en cada cambio de hablante y cuando una intervención larga cambie claramente de tema.
- start_seconds y end_seconds son segundos desde el inicio del archivo.
- Usa marcas de tiempo monotónicas y lo más precisas posible.
- No solapes segmentos salvo que realmente hablen a la vez.

Texto:
- Conserva cifras, importes, fechas, nombres de producto y terminología técnica.
- Elimina únicamente muletillas vacías y tartamudeos que no aporten significado.
- No resumas, no completes frases dudosas y no mejores el contenido.
- Marca como [inaudible] solo la porción que no pueda entenderse.
- No añadas comentarios, confianza inventada ni texto fuera del JSON solicitado.
`;

export const DOCUMENT_PROMPTS: Record<DocumentType, string> = {
  minutes: `
Redacta un acta operativa a partir de la transcripción. Incluye: contexto, decisiones confirmadas,
acciones con responsable si aparece, asuntos pendientes y próximos pasos. Distingue hechos de
propuestas. No inventes responsables, fechas ni acuerdos. Marca la información ausente con
"No consta en la reunión". Escribe en español de España, con tono directo y profesional.
`,
  proposal: `
Convierte la transcripción en un borrador de propuesta comercial sobria. Incluye contexto,
necesidad detectada, alcance propuesto, dependencias, inversión solo si fue mencionada y próximos
pasos. Excluye charla casual y proyectos ajenos. No inventes datos; marca cualquier hueco crítico
como [INFORMACIÓN PENDIENTE]. Escribe en español de España.
`,
  upselling: `
Analiza la transcripción para detectar oportunidades reales de ampliación. Cada oportunidad debe
incluir evidencia de la reunión, necesidad, recomendación e impacto esperado. Descarta comentarios
casuales y necesidades no confirmadas. Si no hay evidencia suficiente, indícalo claramente. No
inventes oportunidades. Escribe en español de España.
`,
};
