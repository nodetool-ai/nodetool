/**
 * AFINN/pattern-based sentiment analyzer, ported verbatim from the `natural`
 * package (sentiment/SentimentAnalyzer.js, MIT).
 *
 * Supports the vocabulary types text-nodes uses:
 *  - "afinn" for English (afinn-165) and Spanish (afinn short).
 *  - "pattern" for French (pattern-sentiment-fr).
 *
 * The vocabulary is stemmed at construction (exactly as natural does), and
 * `getSentiment` reproduces natural's negation handling and mean-valence
 * scoring so the `comparative` output matches.
 */

import { AFINN_165 } from "./data/afinn-165.js";
import { AFINN_ES } from "./data/afinn-es.js";
import { PATTERN_FR } from "./data/pattern-fr.js";

export interface Stemmer {
  stem(token: string): string;
}

export type VocabularyType = "afinn" | "pattern";
export type SentimentLanguage = "English" | "Spanish" | "French";

// Negation word lists, vendored from natural's sentiment/*/negations_*.json.
const englishNegations = ["not", "no", "never", "neither"];
const spanishNegations = ["no", "nunca", "jamás", "ni"];

// type -> language -> [vocabulary, negations]
// Vocabulary values may be numbers (afinn) or strings (pattern polarity); we
// keep them as-is so `score += negator * value` coerces exactly like natural.
const languageFiles: Record<
  string,
  Partial<
    Record<
      string,
      [Record<string, number | string>, string[] | null]
    >
  >
> = {
  afinn: {
    English: [AFINN_165, englishNegations],
    Spanish: [AFINN_ES, spanishNegations]
  },
  pattern: {
    French: [PATTERN_FR, null]
  }
};

export class SentimentAnalyzer {
  readonly language: string;
  readonly stemmer: Stemmer | undefined;
  vocabulary: Record<string, number | string>;
  negations: string[];

  constructor(language: string, stemmer: Stemmer | undefined, type: string) {
    this.language = language;
    this.stemmer = stemmer;

    const byLanguage = languageFiles[type];
    if (!byLanguage) {
      throw new Error("Type Language " + type + " not supported");
    }
    const entry = byLanguage[language];
    if (!entry) {
      throw new Error(
        "Type " + type + " for Language " + language + " not supported"
      );
    }

    // Copy so repeated runs do not mutate the shared lexicon.
    this.vocabulary = Object.assign({}, entry[0]) as Record<
      string,
      number | string
    >;
    Object.setPrototypeOf(this.vocabulary, null);

    // For "pattern", natural reduces each entry object to its polarity. Our
    // vendored PATTERN_FR already stores the polarity string directly, so no
    // reduction step is needed.

    this.negations = [];
    if (entry[1] != null) {
      this.negations = entry[1];
    }

    if (stemmer) {
      const vocaStemmed: Record<string, number | string> = Object.create(null);
      for (const token in this.vocabulary) {
        vocaStemmed[stemmer.stem(token)] = this.vocabulary[token];
      }
      this.vocabulary = vocaStemmed;
    }
  }

  /** Mean-valence sentiment over the given tokens. Matches natural exactly. */
  getSentiment(words: string[]): number {
    let score = 0;
    let negator = 1;

    words.forEach((token) => {
      const lowerCased = token.toLowerCase();
      if (this.negations.indexOf(lowerCased) > -1) {
        negator = -1;
      } else if (this.vocabulary[lowerCased] !== undefined) {
        score += negator * (this.vocabulary[lowerCased] as number);
      } else if (this.stemmer) {
        const stemmedWord = this.stemmer.stem(lowerCased);
        if (this.vocabulary[stemmedWord] !== undefined) {
          score += negator * (this.vocabulary[stemmedWord] as number);
        }
      }
    });

    score = score / words.length;
    return score;
  }
}
