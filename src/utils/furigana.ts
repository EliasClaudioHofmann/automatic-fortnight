/**
 * Segment a Japanese word into kanji/kana runs and align the reading (furigana)
 * to only the kanji portions. Kana segments carry no reading.
 *
 * Example:
 *   segment("違います", "ちがいます") => [
 *     { text: "違", reading: "ちが" },
 *     { text: "います" }
 *   ]
 *   segment("食べ物", "たべもの") => [
 *     { text: "食", reading: "た" },
 *     { text: "べ" },
 *     { text: "物", reading: "もの" }
 *   ]
 */

export interface Segment {
  text: string;
  reading?: string; // only set for kanji segments
}

/** CJK Unified Ideographs + Extension A range (covers virtually all kanji). */
const KANJI_RE = /[一-龯㐀-䶿]/;

/** True when the character is a kanji (CJK ideograph). */
function isKanji(ch: string): boolean {
  return KANJI_RE.test(ch);
}

/**
 * Split `word` into alternating kanji / kana segments and assign each kanji
 * segment its portion of `reading`.
 */
export function segmentFurigana(word: string, reading: string): Segment[] {
  if (!reading || !hasKanji(word)) {
    return [{ text: word }];
  }

  const segments: Segment[] = [];
  let readIdx = 0;

  for (let i = 0; i < word.length; ) {
    if (isKanji(word[i])) {
      // Collect consecutive kanji
      let kanji = '';
      while (i < word.length && isKanji(word[i])) {
        kanji += word[i];
        i++;
      }

      // Collect trailing kana (to locate the split point in the reading)
      let kanaAfter = '';
      let j = i;
      while (j < word.length && !isKanji(word[j])) {
        kanaAfter += word[j];
        j++;
      }

      let kanjiReading: string;
      if (kanaAfter) {
        // The reading for this kanji group ends where the trailing kana begins
        const remaining = reading.slice(readIdx);
        const pos = remaining.indexOf(kanaAfter);
        kanjiReading = pos >= 0 ? remaining.slice(0, pos) : remaining;
        segments.push({ text: kanji, reading: kanjiReading });
        readIdx += kanjiReading.length;
        segments.push({ text: kanaAfter });
        readIdx += kanaAfter.length;
        i = j;
      } else {
        // No kana after — everything remaining in the reading belongs to this kanji
        kanjiReading = reading.slice(readIdx);
        segments.push({ text: kanji, reading: kanjiReading });
        readIdx += kanjiReading.length;
      }
    } else {
      // Pure kana segment: matches the reading directly, no ruby needed
      let kana = '';
      while (i < word.length && !isKanji(word[i])) {
        kana += word[i];
        i++;
      }
      segments.push({ text: kana });
      readIdx += kana.length;
    }
  }

  return segments;
}

/**
 * Generate an HTML string for a word with furigana annotations on kanji only.
 */
export function renderFuriganaHtml(word: string, reading: string): string {
  if (!reading || !hasKanji(word)) return escapeHtml(word);

  return segmentFurigana(word, reading)
    .map((seg) => {
      if (seg.reading) {
        return `<ruby>${escapeHtml(seg.text)}<rt>${escapeHtml(seg.reading)}</rt></ruby>`;
      }
      return escapeHtml(seg.text);
    })
    .join('');
}

/** True when the text contains at least one kanji character. */
function hasKanji(text: string): boolean {
  return KANJI_RE.test(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
