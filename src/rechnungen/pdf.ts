/**
 * Text eines PDFs – nur im Arbeitsspeicher, nie auf die Platte, nie ins Protokoll.
 * Leer, wenn das PDF keinen Text trägt (Scan, Foto) oder sich nicht lesen lässt.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    // verbosity 0: pdf.js meldet Auffälligkeiten sonst auf der Konsole
    // Kopie: pdf.js übernimmt den Puffer, der Aufrufer braucht ihn danach noch (Upload, Hash)
    pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  } catch {
    return '';
  } finally {
    try {
      await pdf?.loadingTask.destroy();
    } catch {
      // das Ergebnis steht schon fest
    }
  }
}

/** PDF an Inhalt oder Angabe erkennen – Endung und Typ können lügen, die ersten Bytes selten */
export function istPdf(anhang: { name?: string; contentType?: string }, bytes?: Uint8Array): boolean {
  if (bytes) return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  return (anhang.contentType ?? '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(anhang.name ?? '');
}
