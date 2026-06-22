import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';

// Use CDN worker — same as pdfService.ts
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';

/**
 * Extract text from a PDF file page by page, returning concatenated text
 * with page separators so Gemini can understand the structure.
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => {
        // pdfjs text items have 'str' and optional 'hasEOL'
        return item.str + (item.hasEOL ? '\n' : '');
      })
      .join('');
    pages.push(pageText.trim());
  }

  return pages.filter((p) => p.length > 0).join('\n\n');
}

/**
 * Extract raw text from a .docx file using mammoth.
 */
async function extractTextFromDocx(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

/**
 * Extract text from a file — dispatches to the right extractor based on extension.
 * Supports: .pdf, .docx
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    return extractTextFromPDF(file);
  }
  if (name.endsWith('.docx')) {
    return extractTextFromDocx(file);
  }
  // .doc (old format) — mammoth doesn't support it; return empty
  throw new Error(`不支持的文件格式: ${file.name}。请上传 .pdf 或 .docx 文件。`);
}
