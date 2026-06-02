import { GoogleGenerativeAI } from '@google/generative-ai';

type Language = 'japanese' | 'english';

const PROMPTS = {
  japanese: `You are extracting words from a Japanese-Chinese vocabulary table.

CRITICAL: Your output MUST be valid JSON array with EXACTLY these field names:
- "ja" → the JAPANESE word/phrase only
- "cn" → the CHINESE translation only  
- "reading" → the hiragana reading of the Japanese word

The table may have multiple columns like: Japanese | POS | Chinese | reading, or similar.
Extract ONLY the Japanese word and its Chinese translation. SKIP the POS (part-of-speech) column.

Example table row: "日本語 | n. | にほんご | 日语"
Correct output: {"ja": "日本語", "cn": "日语", "reading": "にほんご"}

WRONG outputs (do NOT do this):
- {"ja": "n.", "cn": "日本語"} ← wrong field values
- {"cn": "日本語", "ja": "日语"} ← swapped values

Return ONLY a JSON array. No markdown, no explanation. Example:
[{"ja": "漢字", "cn": "汉字", "reading": "かんじ"}]`,
  
  english: `You are extracting words from an English-Chinese vocabulary table.

CRITICAL: Your output MUST be valid JSON array with EXACTLY these field names:
- "en" → the ENGLISH word/phrase only
- "cn" → the CHINESE translation only

The table may have columns like: English | POS | Chinese, or similar.
Extract ONLY the English word and its Chinese meaning. SKIP the POS (part-of-speech) column.

Example table row: "check-up | n. | 检查,体检"
Correct output: {"en": "check-up", "cn": "检查,体检"}

WRONG outputs (do NOT do this):
- {"en": "n.", "cn": "check-up"} ← wrong field values
- {"cn": "check-up", "en": "检查,体检"} ← swapped values

Return ONLY a JSON array. No markdown, no explanation. Example:
[{"en": "comprehensive", "cn": "全面的,综合的"}]`,
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
