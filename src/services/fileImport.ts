export type ImportMode = 'japanese' | 'english' | 'document';

export function isSupportedFile(mode: ImportMode, name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.md') ||
    (mode === 'document' && lower.endsWith('.docx'));
}
