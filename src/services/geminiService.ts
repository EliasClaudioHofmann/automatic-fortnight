import { GoogleGenerativeAI } from '@google/generative-ai';

type Language = 'japanese' | 'english';

const PROMPTS = {
  japanese: `Extract all Japanese words and their Chinese translations from this table.
Also include the hiragana reading (furigana/振り仮名) for the Japanese word.
Return the result strictly as a JSON list of objects: [{"ja": "...", "cn": "...", "reading": "..."}].
The "reading" field should be the hiragana pronunciation of the Japanese word.
Do not include any other text or explanation.`,
  
  english: `Extract all English words and their Chinese translations from this table.
Return the result strictly as a JSON list of objects: [{"en": "...", "cn": "..."}].
Do not include any other text or explanation.`,
};

export interface WordPairJapanese {
  ja: string;
  cn: string;
  reading: string;
  type: 'japanese';
}

export interface WordPairEnglish {
  en: string;
  cn: string;
  type: 'english';
}

export type WordPair = WordPairJapanese | WordPairEnglish;

/**
 * Extract language-specific word pairs from PDF page images using Gemini.
 * Calls onProgress(currentPage, totalPages) after each page is processed.
 */
export async function extractWords(
  apiKey: string,
  images: string[],
  language: Language,
  onProgress: (current: number, total: number) => void
): Promise<WordPair[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

  const allPairs: WordPair[] = [];
  const prompt = PROMPTS[language];

  for (let i = 0; i < images.length; i++) {
    onProgress(i + 1, images.length);

    try {
      const result = await model.generateContent([
        { inlineData: { data: images[i], mimeType: 'image/jpeg' } },
        prompt,
      ]);

      const text = result.response.text();
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const pairs = JSON.parse(jsonStr);

      for (const item of pairs) {
        if (language === 'japanese') {
          allPairs.push({
            ja: item.ja || '',
            cn: item.cn || '',
            reading: item.reading || '',
            type: 'japanese',
          });
        } else {
          allPairs.push({
            en: item.en || '',
            cn: item.cn || '',
            type: 'english',
          });
        }
      }
    } catch {
      // Skip pages that fail to parse — same behavior as original
      continue;
    }
  }

  return allPairs;
}
