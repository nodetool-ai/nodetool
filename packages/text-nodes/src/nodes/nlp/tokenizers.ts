/**
 * Tokenizers ported from the `natural` package (MIT) so that text-nodes no
 * longer depends on `natural` at runtime.
 *
 * Parity targets:
 *  - WordTokenizer: `natural`'s {@link RegexpTokenizer}-based word splitter.
 *  - SentenceTokenizer: `natural`'s placeholder-based sentence splitter.
 *  - AggressiveTokenizer: the splitter used internally by stemmers/phonetics.
 *
 * The implementations mirror natural's source exactly (regexes, trimming
 * rules, placeholder phases) so outputs match token-for-token.
 */

/** Drop leading/trailing empty strings, matching natural's `Tokenizer.trim`. */
function trim(array: string[]): string[] {
  while (array[array.length - 1] === "") {
    array.pop();
  }
  while (array[0] === "") {
    array.shift();
  }
  return array;
}

/**
 * Splits text into words. Mirrors natural's `WordTokenizer`, which is a
 * gaps-mode `RegexpTokenizer` with pattern `/[^A-Za-zА-Яа-я0-9_]+/` that
 * discards empty and single-space results.
 */
export class WordTokenizer {
  private readonly pattern = /[^A-Za-zА-Яа-я0-9_]+/;

  tokenize(text: string): string[] {
    // natural: `_.without(s.split(pattern), '', ' ')`
    return text.split(this.pattern).filter((t) => t !== "" && t !== " ");
  }
}

/**
 * Splits text into words by anything outside `[a-zA-Z0-9'\-/]`. Mirrors
 * natural's English `AggressiveTokenizer`, used by the Porter/Lancaster
 * stemmers' `tokenizeAndStem` and by the phonetic encoders.
 */
export class AggressiveTokenizer {
  tokenize(text: string): string[] {
    return trim(text.split(/[^a-zA-Z0-9'\-/]+/));
  }
}

const NUM = "NUMBER";
const DELIM = "DELIM";
const URI = "URI";
const ABBREV = "ABBREV";

function generateUniqueCode(base: string, index: number): string {
  return `{{${base}_${index}}}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sentence tokenizer ported from natural's 2024 `SentenceTokenizer`.
 *
 * The algorithm replaces abbreviations, URIs, numbers and sentence delimiters
 * with placeholders, splits on the delimiter placeholders, then reverts the
 * placeholders. This faithful port preserves natural's exact behaviour,
 * including the delimiter/number regexes and trimming.
 */
export class SentenceTokenizer {
  private readonly abbreviations: string[];
  private readonly trimSentences: boolean;
  private replacementCounter = 0;
  private replacementMap: Map<string, string> = new Map();
  private delimiterMap: Map<string, string> = new Map();

  constructor(abbreviations?: string[], trimSentences?: boolean) {
    this.abbreviations = abbreviations ?? [];
    this.trimSentences = trimSentences === undefined ? true : trimSentences;
  }

  private replaceUrisWithPlaceholders(text: string): string {
    const urlPattern =
      /(https?:\/\/\S+|www\.\S+|ftp:\/\/\S+|(mailto:)?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|file:\/\/\S+)/gi;
    return text.replace(urlPattern, (match) => {
      const placeholder = generateUniqueCode(URI, this.replacementCounter++);
      this.replacementMap.set(placeholder, match);
      return placeholder;
    });
  }

  private replaceAbbreviations(text: string): string {
    if (this.abbreviations.length === 0) {
      return text;
    }
    const pattern = new RegExp(
      `(${this.abbreviations.map((a) => escapeRegExp(a)).join("|")})`,
      "gi"
    );
    return text.replace(pattern, (match) => {
      const code = generateUniqueCode(ABBREV, this.replacementCounter++);
      this.replacementMap.set(code, match);
      return code;
    });
  }

  private replaceDelimitersWithPlaceholders(text: string): string {
    const delimiterPattern = /([.?!… ]*)([.?!…])(["'”’)}\]]?)/g;
    return text.replace(delimiterPattern, (_match, p1: string, p2: string, p3: string) => {
      const placeholder = generateUniqueCode(DELIM, this.replacementCounter++);
      this.delimiterMap.set(placeholder, p1 + p2 + p3);
      return placeholder;
    });
  }

  private splitOnPlaceholders(text: string): string[] {
    if (this.delimiterMap.size === 0) {
      return [text];
    }
    const keys = Array.from(this.delimiterMap.keys());
    const pattern = new RegExp(`(${keys.map(escapeRegExp).join("|")})`);
    const parts = text.split(pattern);

    const sentences: string[] = [];
    for (let i = 0; i < parts.length; i += 2) {
      const sentence = parts[i];
      const placeholder = parts[i + 1] || "";
      sentences.push(sentence + placeholder);
    }
    return sentences;
  }

  private replaceNumbersWithCode(text: string): string {
    const numberPattern = /\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g;
    return text.replace(numberPattern, (match) => {
      const code = generateUniqueCode(NUM, this.replacementCounter++);
      this.replacementMap.set(code, match);
      return code;
    });
  }

  private revertReplacements(text: string): string {
    let originalText = text;
    for (const [placeholder, replacement] of this.replacementMap.entries()) {
      const pattern = new RegExp(escapeRegExp(placeholder), "g");
      originalText = originalText.replace(pattern, replacement);
    }
    return originalText;
  }

  private revertDelimiters(text: string): string {
    let originalText = text;
    for (const [placeholder, replacement] of this.delimiterMap.entries()) {
      const pattern = new RegExp(escapeRegExp(placeholder), "g");
      originalText = originalText.replace(pattern, replacement);
    }
    return originalText;
  }

  tokenize(text: string): string[] {
    this.replacementCounter = 0;
    this.replacementMap = new Map();
    this.delimiterMap = new Map();

    const result1 = this.replaceAbbreviations(text);
    const result2 = this.replaceUrisWithPlaceholders(result1);
    const result3 = this.replaceNumbersWithCode(result2);
    const result4 = this.replaceDelimitersWithPlaceholders(result3);
    const sentences = this.splitOnPlaceholders(result4);

    const newSentences = sentences.map((s) => {
      const s1 = this.revertReplacements(s);
      return this.revertDelimiters(s1);
    });

    const trimmedSentences = trim(newSentences);
    return trimmedSentences.map((sent) =>
      this.trimSentences ? sent.trim() : sent
    );
  }
}
