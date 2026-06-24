/**
 * TF-IDF, ported verbatim from the `natural` package (tfidf/tfidf.js, MIT).
 *
 * Documents are tokenized with the WordTokenizer (lowercased) and stopwords
 * are filtered, exactly as natural does. The idf formula
 * `1 + log(N / (1 + docsWithTerm))` and raw term-frequency match natural.
 */

import { WordTokenizer } from "./tokenizers.js";
import { STOPWORDS } from "./data/stopwords.js";

const tokenizer = new WordTokenizer();

interface TfIdfDocument {
  __key?: string | number;
  [term: string]: number | string | undefined;
}

function buildDocument(
  text: string | string[],
  key?: string | number
): TfIdfDocument {
  let tokens: string[];
  let stopOut: boolean;

  if (typeof text === "string") {
    tokens = tokenizer.tokenize(text.toLowerCase());
    stopOut = true;
  } else if (Array.isArray(text)) {
    tokens = text;
    stopOut = false;
  } else {
    return text as TfIdfDocument;
  }

  return tokens.reduce<TfIdfDocument>(
    (document, term) => {
      if (!stopOut || STOPWORDS.indexOf(term) < 0) {
        const current = document[term];
        document[term] = typeof current === "number" ? current + 1 : 1;
      }
      return document;
    },
    { __key: key }
  );
}

function documentHasTerm(term: string, document: TfIdfDocument): boolean {
  const value = document[term];
  return typeof value === "number" && value > 0;
}

export type TfIdfCallback = (
  index: number,
  measure: number,
  key?: string | number
) => void;

export class TfIdf {
  documents: TfIdfDocument[] = [];
  private idfCache: Record<string, number> = Object.create(null);

  static tf(term: string, document: TfIdfDocument): number {
    const value = document[term];
    return typeof value === "number" ? value : 0;
  }

  idf(term: string, force?: boolean): number {
    if (this.idfCache[term] && force !== true) {
      return this.idfCache[term];
    }

    const docsWithTerm = this.documents.reduce(
      (count, document) => count + (documentHasTerm(term, document) ? 1 : 0),
      0
    );

    const idf = 1 + Math.log(this.documents.length / (1 + docsWithTerm));
    this.idfCache[term] = idf;
    return idf;
  }

  addDocument(
    document: string | string[],
    key?: string | number,
    restoreCache?: boolean
  ): void {
    this.documents.push(buildDocument(document, key));

    if (restoreCache === true) {
      for (const term in this.idfCache) {
        this.idf(term, true);
      }
    } else {
      this.idfCache = Object.create(null);
    }
  }

  tfidf(terms: string | string[], d: number): number {
    let termList: string[];
    if (!Array.isArray(terms)) {
      termList = tokenizer.tokenize(terms.toString().toLowerCase());
    } else {
      termList = terms;
    }

    return termList.reduce((value, term) => {
      let idf = this.idf(term);
      idf = idf === Infinity ? 0 : idf;
      return value + TfIdf.tf(term, this.documents[d]) * idf;
    }, 0.0);
  }

  listTerms(
    d: number
  ): Array<{ term: string; tf: number; idf: number; tfidf: number }> {
    const terms: Array<{
      term: string;
      tf: number;
      idf: number;
      tfidf: number;
    }> = [];
    for (const term in this.documents[d]) {
      if (term !== "__key") {
        terms.push({
          term,
          tf: TfIdf.tf(term, this.documents[d]),
          idf: this.idf(term),
          tfidf: this.tfidf([term], d)
        });
      }
    }
    return terms.sort((x, y) => y.tfidf - x.tfidf);
  }

  tfidfs(terms: string | string[], callback?: TfIdfCallback): number[] {
    const tfidfs = new Array<number>(this.documents.length);

    for (let i = 0; i < this.documents.length; i++) {
      tfidfs[i] = this.tfidf(terms, i);
      if (callback) {
        callback(i, tfidfs[i], this.documents[i].__key);
      }
    }

    return tfidfs;
  }
}
