import { GoogleGenerativeAI } from '@google/generative-ai';

type Language = 'japanese' | 'english';

const PROMPTS = {
  japanese: `Extract all Japanese words and their Chinese translations from this table or list.
The table may have columns like: Japanese word | part of speech | Chinese meaning | reading, or similar variations.
For each entry, extract:
- The Japanese word/phrase (not the part of speech column)
- The Chinese translation/meaning
- The hiragana reading (furigana/振り仮名) - try to infer from context if not explicitly shown
Return the result strictly as a JSON list: [{"ja": "...", "cn": "...", "reading": "..."}]
Examples:
- If table shows "日本語 | n. | にほんご" → {"ja": "日本語", "cn": "日语", "reading": "にほんご"}
- If only Chinese meaning shows "中文" → use that as the Chinese translation
Return ONLY valid JSON, no other text.`,
  
  english: `Extract all English words/phrases and their Chinese translations from this table or list.
The table may have multiple columns: English word | part of speech | Chinese meaning, or similar.
For each row, extract:
- The English word/phrase (NOT the part of speech/grammar notation)
- The Chinese translation/meaning (NOT the part of speech)
Return the result strictly as a JSON list: [{"en": "...", "cn": "..."}]
Examples:
- If row shows "check-up | n. | 检查,体检" → {"en": "check-up", "cn": "检查,体检"}
- If shows "comprehensive | adj. | 全面的,综合的" → {"en": "comprehensive", "cn": "全面的,综合的"}
Return ONLY valid JSON, no other text.`,
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
      
      // Try to extract JSON from response (handle cases where Gemini adds extra text)
      let jsonStr = text;
      
      // Look for JSON array pattern
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      // Remove markdown code blocks if present
      jsonStr = jsonStr
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const pairs = JSON.parse(jsonStr);
      
      // Validate and process pairs
      if (Array.isArray(pairs)) {
        for (const item of pairs) {
          if (language === 'japanese') {
            // Validate Japanese pair has required fields
            if (item.ja && item.cn) {
              allPairs.push({
                ja: String(item.ja || '').trim(),
                cn: String(item.cn || '').trim(),
                reading: String(item.reading || '').trim(),
                type: 'japanese',
              });
            }
          } else {
            // Validate English pair has required fields
            if (item.en && item.cn) {
              allPairs.push({
                en: String(item.en || '').trim(),
                cn: String(item.cn || '').trim(),
                type: 'english',
              });
            }
          }
        }
      }
    } catch (error) {
      // Log error but skip page — same behavior as original
      console.warn(`Error processing page ${i + 1}:`, error);
      continue;
    }
  }

  return allPairs;
}
