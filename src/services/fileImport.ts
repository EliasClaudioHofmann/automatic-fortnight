export type ImportMode = 'japanese' | 'english' | 'document';

export function isSupportedFile(mode: ImportMode, name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.pdf') || lower.endsWith('.md') ||
    (mode === 'document' && lower.endsWith('.docx'));
}

export function formatDocumentCompletion(failures: string[], usedFallback: boolean): string {
  const completed = failures.length ? `处理完成；以下文件未导入：${failures.join('；')}` : '处理完成！(Done!)';
  return usedFallback ? `${completed} 已使用备用模型，结果需核对读音、译文和例句。` : completed;
}
