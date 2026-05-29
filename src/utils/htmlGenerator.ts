import type { WordPair } from '../services/geminiService';

/**
 * Generate the same HTML table as the original Python script.
 * Styles and structure are preserved exactly from PdfToWordList.py lines 107-145.
 */
export function generateHtml(wordPairs: WordPair[]): string {
  const rows = wordPairs
    .map(
      ({ ja, cn }) => `
                    <tr>
                        <td>${escapeHtml(ja)}</td>
                        <td>${escapeHtml(cn)}</td>
                        <td class="blank">__________________</td>
                    </tr>`
    )
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
    </style>
</head>
<body>
    <table>
        <thead>
            <tr>
                <th>外语 (Foreign)</th>
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
