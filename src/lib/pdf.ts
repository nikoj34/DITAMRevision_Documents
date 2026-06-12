// Build « legacy » de pdf.js : compatibilité maximale avec les navigateurs
// d'entreprise (les builds modernes exigent des API JavaScript très récentes).
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDocument = pdfjs.PDFDocumentProxy;

export function loadPdf(url: string): Promise<PdfDocument> {
  return pdfjs.getDocument({ url }).promise;
}
