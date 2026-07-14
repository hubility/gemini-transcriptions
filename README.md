# Registro

Aplicación web para transcribir y diarizar reuniones mediante Gemini. Está diseñada para ejecutarse
desde Google AI Studio o en local con Vite.

## Qué cambia respecto al prototipo original

- El audio se sube una sola vez mediante Gemini Files API; no se decodifica ni se convierte a WAV en el navegador.
- La transcripción se solicita como JSON estructurado y se valida antes de mostrarla.
- La diarización mantiene identificadores de interlocutor para toda la reunión.
- El procesamiento admite cancelación, reintentos temporales y mensajes de error útiles.
- El texto, los nombres y el título pueden corregirse antes de exportar o generar documentos.
- El archivo remoto se elimina al terminar el procesamiento.

## Desarrollo local

1. Instala las dependencias: `npm install`
2. Define `GEMINI_API_KEY` en `.env.local`.
3. Ejecuta `npm run dev`.

Comprobaciones: `npm run typecheck` y `npm run build`.

En AI Studio se conserva el mecanismo existente que inyecta la clave como `process.env.API_KEY`.
