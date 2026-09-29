import * as mammoth from 'mammoth';

export type ReadSourceResult =
  | { kind: 'txt'; text: string }
  | { kind: 'docx'; html: string };

export async function readSource(file: File): Promise<ReadSourceResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt')) return { kind: 'txt', text: await file.text() };
  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    // Mammoth's browser entry reads arrayBuffer; its Node entry reads buffer.
    const input = { arrayBuffer, buffer: new Uint8Array(arrayBuffer) } as unknown as Parameters<typeof mammoth.convertToHtml>[0];
    const result = await mammoth.convertToHtml(input);
    return { kind: 'docx', html: result.value };
  }
  throw new Error('仅支持从 Google Docs 导出的 DOCX 或 TXT 文件');
}
