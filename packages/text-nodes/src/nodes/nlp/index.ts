/**
 * Self-contained NLP primitives ported from the `natural` package (MIT),
 * letting text-nodes drop the heavyweight `natural` runtime dependency (which
 * pulls in mongoose/pg/redis transitively) for the small slice it actually
 * uses.
 *
 * Each export is a byte-for-byte-compatible reimplementation of the matching
 * `natural` API, verified by tests/nlp-parity.test.ts.
 */

export { WordTokenizer, SentenceTokenizer, AggressiveTokenizer } from "./tokenizers.js";
export { PorterStemmer } from "./porter-stemmer.js";
export { PorterStemmerEs } from "./porter-stemmer-es.js";
export { PorterStemmerFr } from "./porter-stemmer-fr.js";
export { LancasterStemmer } from "./lancaster-stemmer.js";
export { SoundEx, Metaphone, DoubleMetaphone } from "./phonetics.js";
export {
  SentimentAnalyzer,
  type Stemmer,
  type VocabularyType,
  type SentimentLanguage
} from "./sentiment.js";
export { TfIdf, type TfIdfCallback } from "./tfidf.js";
export { BayesClassifier, type Classification } from "./bayes.js";
