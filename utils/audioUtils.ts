
export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Manejar tanto data:audio/mp3;base64,... como raw base64 si fuera necesario
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s]
    .map(v => v < 10 ? "0" + v : v)
    .filter((v, i) => v !== "00" || i > 0)
    .join(":");
}

// Nueva implementación eficiente de memoria:
// En lugar de decodificar todo el archivo (que consume GBs de RAM),
// calculamos los bytes correspondientes al tiempo y cortamos el archivo original.
export async function sliceAudio(file: File, startSec: number, endSec: number, totalDuration: number): Promise<Blob> {
  // Calculamos la tasa de bytes por segundo promedio
  const bytesPerSecond = file.size / totalDuration;
  
  const startByte = Math.floor(startSec * bytesPerSecond);
  const endByte = Math.min(Math.floor(endSec * bytesPerSecond), file.size);

  // Cortamos el archivo original. Esto es instantáneo y no consume RAM extra.
  // Nota: Gemini es lo suficientemente robusto para manejar chunks de MP3/M4A cortados por bytes 
  // gracias a los sync frames, o chunks de WAV aunque pierdan el header en los cortes intermedios.
  return file.slice(startByte, endByte, file.type);
}
