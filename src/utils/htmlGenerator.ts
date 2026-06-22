import type { WordPair, WordPairDocument, WordPairEnglish } from '../services/geminiService';
import { renderFuriganaHtml } from './furigana';

/**
 * Generate the same HTML table as the original Python script.
 * Styles preserved from PdfToWordList.py lines 107-145; furigana added.
 * Document mode: 4-column table (kana | kanji | chinese | practice).
 */
export function generateHtml(wordPairs: WordPair[]): string {
  // Determine the mode from the first word pair
  const first = wordPairs.length > 0 ? wordPairs[0] : null;

  // Document mode: 4 columns
  if (first && 'type' in first && first.type === 'document') {
    return generateDocumentHtml(wordPairs as WordPairDocument[]);
  }

  // Japanese / English mode: 3 columns
  const isJapanese = first && 'ja' in first;
  const headerLeft = isJapanese ? 'Japanese' : 'English';

  const rows = wordPairs
    .map((item) => {
      let foreignWord: string;
      let furiganaHtml: string;

      if ('ja' in item) {
        // Japanese
        foreignWord = item.ja;
        furiganaHtml = renderFuriganaHtml(item.ja, item.reading);
      } else {
        // English
        foreignWord = (item as WordPairEnglish).en;
        furiganaHtml = escapeHtml((item as WordPairEnglish).en);
      }

      return `
                    <tr>
                        <td>${furiganaHtml}</td>
                        <td>${escapeHtml(item.cn)}</td>
                        <td class="blank">__________________</td>
                    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>单词表</title>
    <style>
        table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; line-height: 1.25; }
        th { border: 1px solid #dddddd; padding: 10px; font-weight: bold; background-color: #f2f2f2; text-align: left; }
        td { border: 1px solid #dddddd; padding: 10px; }
        .blank { color: #ccc; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        rt { font-size: 0.65em; color: #555; }
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
                <th>${headerLeft} (${headerLeft === 'Japanese' ? '日语' : '英语'})</th>
                <th>中文 (Chinese)</th>
                <th>默写/挖空 (Practice)</th>
            </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
    </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  };
  return text.replace(/[&<>"]/g, (c) => map[c]);
}

/** Generate 4-column HTML table for document mode (kana | kanji | chinese | practice). */
function generateDocumentHtml(wordPairs: WordPairDocument[]): string {
  const rows = wordPairs
    .map((item) => {
      const kanjiDisplay = item.kanji || '<span style="color:#999">—</span>';
      return `
                    <tr>
                        <td>${escapeHtml(item.kana)}</td>
                        <td>${kanjiDisplay}</td>
                        <td>${escapeHtml(item.cn)}</td>
                        <td class="blank">__________________</td>
                    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>日语单词表（文档）</title>
    <style>
        table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; line-height: 1.25; }
        th { border: 1px solid #dddddd; padding: 10px; font-weight: bold; background-color: #f2f2f2; text-align: left; }
        td { border: 1px solid #dddddd; padding: 10px; }
        .blank { color: #ccc; }
        tr:nth-child(even) { background-color: #f9f9f9; }
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
                <th>日文假名 (Kana)</th>
                <th>日汉字 (Kanji)</th>
                <th>中文意思 (Chinese)</th>
                <th>默写/挖空 (Practice)</th>
            </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
    </table>
</body>
</html>`;
}
