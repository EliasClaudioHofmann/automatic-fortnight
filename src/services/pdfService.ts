import * as pdfjsLib from 'pdfjs-dist';

// Use CDN worker — reliable across all bundlers
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

/**
 * Render all pages of a PDF file to base64-encoded JPEG images.
 * 150 DPI equivalent: scale = 1.5 (assuming 96 DPI screen baseline).
 */
export async function pdfToImages(file: File): Promise<string[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // JPEG at 80% quality — small enough for API, clear enough for OCR
    const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    images.push(base64);
  }

  return images;
}
