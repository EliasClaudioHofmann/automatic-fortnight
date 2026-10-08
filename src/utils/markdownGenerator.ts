import type { WordPair, WordPairDocument } from '../services/geminiService';

type Language = 'japanese' | 'english' | 'document';

function cell(value: string): string {
  return value.replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|').replace(/\r\n?|\n/g, '<br>');
}

function row(values: string[]): string {
  return `| ${values.map(cell).join(' | ')} |`;
}

/** Export the same vocabulary fields and practice columns shown in the preview. */
export function generateMarkdown(wordPairs: WordPair[], language: Language): string {
  const headers = language === 'document'
    ? ['日文假名', '日文默写', '日汉字', '默写', '英文翻译', '例句', '中文意思']
    : [language === 'japanese' ? '日语' : '英语', '中文', '默写/挖空'];
  const rows = wordPairs.map((item): string => {
    if (language === 'document') {
      const document = item as WordPairDocument;
      return row([document.kana, '', document.kanji || '—', '', document.en || '', document.example || '', document.cn]);
    }
    if ('ja' in item) {
      const word = item.reading && item.reading !== item.ja ? `${item.ja}（${item.reading}）` : item.ja;
      return row([word, item.cn, '']);
    }
    if (item.type === 'english') return row([item.en, item.cn, '']);
    throw new Error('词汇类型与导出模式不符。');
  });
  return [row(headers), row(headers.map(() => '---')), ...rows].join('\n') + '\n';
}
