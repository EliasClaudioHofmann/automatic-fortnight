import { GoogleGenerativeAI } from '@google/generative-ai';

const PROMPT = `Extract all Japanese words and their Chinese translations from this table.
Return the result strictly as a JSON list of objects: [{"ja": "...", "cn": "..."}].
Do not include any other text or explanation.`;

export interface WordPair {
  ja: string;
  cn: string;
}

/**
 * Extract Japanese-Chinese word pairs from PDF page images using Gemini.
 * Calls onProgress(currentPage, totalPages) after each page is processed.
 */
export async function extractWords(
  apiKey: string,
  images: string[],
  onProgress: (current: number, total: number) => void
): Promise<WordPair[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

  const allPairs: WordPair[] = [];

  for (let i = 0; i < images.length; i++) {
    onProgress(i + 1, images.length);

    try {
      const result = await model.generateContent([
        { inlineData: { data: images[i], mimeType: 'image/jpeg' } },
        PROMPT,
      ]);

      const text = result.response.text();
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const pairs = JSON.parse(jsonStr);

      for (const item of pairs) {
        allPairs.push({
          ja: item.ja || '',
          cn: item.cn || '',
        });
      }
    } catch {
      // Skip pages that fail to parse — same behavior as original
      continue;
    }
  }

  return allPairs;
}
