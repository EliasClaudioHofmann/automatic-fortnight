import { confirmedCards, type Candidate } from './candidate.ts';

export interface DeckCardContent {
  candidateId: string;
  template: 'A' | 'B' | 'C';
  frontHtml: string;
  backHtml: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

function text(value: string): string {
  return escapeHtml(value.trim()).replace(/\r\n?|\n/g, '<br>');
}

function detail(label: string, value: string): string {
  const content = text(value);
  return content ? `<div style="margin-top:0.45em"><span style="color:#666">${label}：</span>${content}</div>` : '';
}

function block(value: string, size = '1.5em'): string {
  const content = text(value);
  return content ? `<div style="font-size:${size};line-height:1.5">${content}</div>` : '';
}

function exampleFront(candidate: Candidate): string {
  return `${detail('例句', candidate.example)}${detail('例句读音', candidate.exampleReading ?? '')}`;
}

function exampleBack(candidate: Candidate): string {
  return `${detail('例句', candidate.example)}${detail('例句读音', candidate.exampleReading ?? '')}${detail('例句译文', candidate.exampleMeaning ?? '')}`;
}

export function buildDeckCards(candidates: Candidate[]): DeckCardContent[] {
  const result: DeckCardContent[] = [];
  for (const candidate of confirmedCards(candidates)) {
    const word = block(candidate.expression, '1.8em');
    const reading = candidate.reading.trim();
    const wordReading = reading && reading !== candidate.expression.trim() ? detail('假名标音', reading) : '';
    const wordReadingAnswer = reading ? detail('假名标音', reading) : '';
    const meaning = block(candidate.meaning);
    const hasExample = Boolean(candidate.example.trim());

    if (hasExample) {
      const frontA = `${word}${wordReading}${exampleFront(candidate)}`;
      result.push({
        candidateId: candidate.id, template: 'A',
        frontHtml: frontA,
        backHtml: `${frontA}<hr id="answer">${meaning}${detail('例句译文', candidate.exampleMeaning ?? '')}`,
      });
      const frontB = `${word}${exampleFront(candidate)}`;
      result.push({
        candidateId: candidate.id, template: 'B',
        frontHtml: frontB,
        backHtml: `${frontB}<hr id="answer">${meaning}${wordReadingAnswer}${detail('例句译文', candidate.exampleMeaning ?? '')}`,
      });
    }
    const frontC = word;
    result.push({
      candidateId: candidate.id, template: 'C',
      frontHtml: frontC,
      backHtml: `${frontC}<hr id="answer">${meaning}${wordReadingAnswer}${exampleBack(candidate)}`,
    });
  }
  return result;
}

export function buildNoteFields(candidate: Candidate): string[] {
  const reading = candidate.reading.trim();
  return [
    text(candidate.expression),
    text(reading),
    reading && reading !== candidate.expression.trim() ? text(reading) : '',
    text(candidate.meaning),
    text(candidate.example),
    text(candidate.exampleReading ?? ''),
    text(candidate.exampleMeaning ?? ''),
    text(candidate.exampleRaw ?? candidate.example),
  ];
}

export const NOTE_FIELD_NAMES = [
  'Word', 'WordReading', 'WordReadingFront', 'Meaning',
  'ExampleJapanese', 'ExampleReading', 'ExampleMeaning', 'ExampleRaw',
] as const;

export const CARD_TEMPLATE_SPECS = [
  {
    name: 'A 例句+词条读音→中文',
    question: '<div>{{Word}}</div>{{#WordReadingFront}}<div class="reading">{{WordReadingFront}}</div>{{/WordReadingFront}}<div class="example">{{ExampleJapanese}}<br>{{ExampleReading}}</div>',
    answer: '{{FrontSide}}<hr id="answer"><div class="meaning">{{Meaning}}</div><div class="example-meaning">{{ExampleMeaning}}</div>',
  },
  {
    name: 'B 汉字+例句→中文+读音',
    question: '<div>{{Word}}</div><div class="example">{{ExampleJapanese}}<br>{{ExampleReading}}</div>',
    answer: '{{FrontSide}}<hr id="answer"><div class="meaning">{{Meaning}}</div><div class="reading">{{WordReading}}</div><div class="example-meaning">{{ExampleMeaning}}</div>',
  },
  {
    name: 'C 单词→中文+例句+读音',
    question: '<div>{{Word}}</div>',
    answer: '{{FrontSide}}<hr id="answer"><div class="meaning">{{Meaning}}</div><div class="reading">{{WordReading}}</div><div class="example">{{ExampleJapanese}}<br>{{ExampleReading}}</div><div class="example-meaning">{{ExampleMeaning}}</div>',
  },
] as const;

export const NOTE_FIELD_REQUIREMENTS: Array<[number, 'all' | 'any' | 'none', number[]]> = [
  [0, 'all', [4]],
  [1, 'all', [4]],
  [2, 'all', [0]],
];
