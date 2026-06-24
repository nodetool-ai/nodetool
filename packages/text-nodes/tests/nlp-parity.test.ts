/**
 * Parity gate for the self-written NLP primitives that replaced `natural`.
 *
 * Each `expect` compares our `src/nodes/nlp` implementation against the matching
 * `natural` API for a representative set of inputs (plus bulk-stemming the AFINN
 * lexicon). As long as `natural` is installed these assertions prove that
 * dropping it as a runtime dependency of the NLP nodes is safe; if a future
 * `natural` release diverges, this test catches it.
 *
 * `natural` is loaded lazily; if it is not installed (e.g. a slimmed CI image)
 * the suite skips rather than failing, since the production code no longer needs
 * it.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  WordTokenizer,
  SentenceTokenizer,
  PorterStemmer,
  PorterStemmerEs,
  PorterStemmerFr,
  LancasterStemmer,
  SentimentAnalyzer,
  TfIdf,
  BayesClassifier,
  SoundEx,
  Metaphone,
  DoubleMetaphone
} from "../src/nodes/nlp/index.js";

// `natural`'s types are stale (DefinitelyTyped 5.x while we run 8.x), so we use
// a loose handle. This test is the only place natural is referenced.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Natural = any;

let natural: Natural | null = null;

beforeAll(async () => {
  try {
    // The runtime nodes import natural the same way (default export).
    natural = (await import("natural")).default;
  } catch {
    natural = null;
  }
});

const describeIfNatural = process.env.SKIP_NATURAL ? describe.skip : describe;

describeIfNatural("NLP parity with natural", () => {
  const wordInputs = [
    "She said 'hello', world! 123_foo",
    "The quick brown fox. Don't stop—keep going!",
    "Привет мир test 42",
    "a.b.c d_e f-g",
    "café résumé naïve",
    "   ",
    "Multiple    spaces\tand\nnewlines here"
  ];
  it.each(wordInputs)("WordTokenizer matches for %j", (text: string) => {
    if (!natural) return;
    expect(new WordTokenizer().tokenize(text)).toEqual(
      new natural.WordTokenizer().tokenize(text)
    );
  });

  const sentenceInputs = [
    "Hello world. How are you? I am fine!",
    "Dr. Smith went to Washington. He arrived at 3.14 p.m.",
    "Visit https://example.com/page now. Then email a@b.com please.",
    "Wait... what?! Really.",
    'He said "stop!" and left. Then (quietly) he returned.',
    "One sentence only"
  ];
  it.each(sentenceInputs)("SentenceTokenizer matches for %j", (text: string) => {
    if (!natural) return;
    expect(new SentenceTokenizer([]).tokenize(text)).toEqual(
      new natural.SentenceTokenizer([]).tokenize(text)
    );
  });

  const porterWords = [
    "running", "caresses", "ponies", "ties", "caress", "cats", "feed",
    "agreed", "plastered", "bled", "motoring", "sing", "conflated",
    "troubled", "sized", "hopping", "relational", "conditional", "rational",
    "digitizer", "conformably", "radically", "differently", "vietnamization",
    "predication", "operator", "feudalism", "decisiveness", "hopefulness",
    "formality", "sensitivity", "sensibility", "triplicate", "formative",
    "electricity", "electrical", "hopeful", "goodness", "revival",
    "allowance", "inference", "airliner", "gyroscopic", "adjustable",
    "defensible", "irritant", "replacement", "adjustment", "homologous",
    "communism", "activate", "angularity", "effective", "bowdlerize"
  ];
  it.each(porterWords)("PorterStemmer stems %s", (word: string) => {
    if (!natural) return;
    expect(PorterStemmer.stem(word)).toBe(natural.PorterStemmer.stem(word));
  });

  it("PorterStemmer bulk-matches every AFINN-165 English word", async () => {
    if (!natural) return;
    const afinn = (await import("afinn-165")).afinn165 as Record<
      string,
      number
    >;
    for (const word of Object.keys(afinn)) {
      expect(PorterStemmer.stem(word)).toBe(natural.PorterStemmer.stem(word));
    }
  });

  it("PorterStemmer.tokenizeAndStem matches (the Bayes path)", () => {
    if (!natural) return;
    const text = "The cats are running quickly through the gardens";
    expect(PorterStemmer.tokenizeAndStem(text)).toEqual(
      natural.PorterStemmer.tokenizeAndStem(text)
    );
    expect(PorterStemmer.tokenizeAndStem(text, true)).toEqual(
      natural.PorterStemmer.tokenizeAndStem(text, true)
    );
  });

  const lancasterWords = [
    "maximum", "presumably", "multiply", "provision", "owed", "ear",
    "saying", "crying", "string", "meant", "cement", "running", "happily"
  ];
  it.each(lancasterWords)("LancasterStemmer stems %s", (word: string) => {
    if (!natural) return;
    expect(LancasterStemmer.stem(word)).toBe(
      natural.LancasterStemmer.stem(word)
    );
  });

  const spanishWords = [
    "corriendo", "bibliotecas", "gracias", "amarillo", "perros", "casas",
    "comiendo", "hablamos", "nacional", "revolución", "análisis"
  ];
  it.each(spanishWords)("PorterStemmerEs stems %s", (word: string) => {
    if (!natural) return;
    expect(PorterStemmerEs.stem(word)).toBe(
      natural.PorterStemmerEs.stem(word)
    );
  });

  const frenchWords = [
    "continuellement", "bibliothèque", "chiens", "manger", "nationaux",
    "journaux", "finalement", "rapidement", "abandonné", "magnifique",
    "excellente", "horribles", "travailler"
  ];
  it.each(frenchWords)("PorterStemmerFr stems %s", (word: string) => {
    if (!natural) return;
    expect(PorterStemmerFr.stem(word)).toBe(
      natural.PorterStemmerFr.stem(word)
    );
  });

  const phoneticWords = [
    "Robert", "Rupert", "Ashcraft", "Tymczak", "Pfister", "Honeyman",
    "Smith", "Schmidt", "Thompson", "Wikipedia", "Catherine", "Knight",
    "Pneumonia", "Wright", "Xavier", "Czerny", "Jackson", "Philip",
    "Caesar", "psychology", "mnemonic", "through", "laugh"
  ];
  it.each(phoneticWords)("SoundEx encodes %s", (word: string) => {
    if (!natural) return;
    expect(new SoundEx().process(word)).toBe(
      new natural.SoundEx().process(word)
    );
  });
  it.each(phoneticWords)("Metaphone encodes %s", (word: string) => {
    if (!natural) return;
    expect(new Metaphone().process(word)).toBe(
      new natural.Metaphone().process(word)
    );
  });
  it.each(phoneticWords)("DoubleMetaphone encodes %s", (word: string) => {
    if (!natural) return;
    expect(new DoubleMetaphone().process(word)).toEqual(
      new natural.DoubleMetaphone().process(word)
    );
  });

  const tfidfDocs = [
    "this document is about node",
    "this document is about ruby",
    "this document is about ruby and node",
    "no nodes here"
  ];
  const tfidfQueries = ["node", "ruby document", "missing"];
  it.each(tfidfQueries)("TfIdf tfidfs for query %j", (query: string) => {
    if (!natural) return;
    const mine: Array<[number, number]> = [];
    const ref: Array<[number, number]> = [];
    const tM = new TfIdf();
    const tN = new natural.TfIdf();
    tfidfDocs.forEach((d) => {
      tM.addDocument(d);
      tN.addDocument(d);
    });
    tM.tfidfs(query, (i, m) => mine.push([i, m]));
    tN.tfidfs(query, (i: number, m: number) => ref.push([i, m]));
    expect(mine).toEqual(ref);
  });

  const englishSentiment = [
    "I love this great wonderful thing",
    "I hate this terrible awful bad evil thing",
    "not good",
    "this is not bad at all",
    "neutral words without any polarity here",
    "the food was good but the service was horrible"
  ];
  it.each(englishSentiment)(
    "SentimentAnalyzer English afinn score for %j",
    (text: string) => {
      if (!natural) return;
      const tokens = new WordTokenizer().tokenize(text);
      const mine = new SentimentAnalyzer(
        "English",
        PorterStemmer,
        "afinn"
      ).getSentiment(tokens);
      const ref = new natural.SentimentAnalyzer(
        "English",
        natural.PorterStemmer,
        "afinn"
      ).getSentiment(tokens);
      expect(mine).toBe(ref);
    }
  );

  const spanishSentiment = ["me encanta esto", "odio esto terrible", "no bueno"];
  it.each(spanishSentiment)(
    "SentimentAnalyzer Spanish afinn score for %j",
    (text: string) => {
      if (!natural) return;
      const tokens = new WordTokenizer().tokenize(text);
      const mine = new SentimentAnalyzer(
        "Spanish",
        PorterStemmerEs,
        "afinn"
      ).getSentiment(tokens);
      const ref = new natural.SentimentAnalyzer(
        "Spanish",
        natural.PorterStemmerEs,
        "afinn"
      ).getSentiment(tokens);
      expect(mine).toBe(ref);
    }
  );

  const frenchSentiment = [
    "excellent magnifique",
    "horrible mauvais terrible",
    "formidable génial"
  ];
  it.each(frenchSentiment)(
    "SentimentAnalyzer French pattern score for %j",
    (text: string) => {
      if (!natural) return;
      const tokens = new WordTokenizer().tokenize(text);
      const mine = new SentimentAnalyzer(
        "French",
        PorterStemmerFr,
        "pattern"
      ).getSentiment(tokens);
      const ref = new natural.SentimentAnalyzer(
        "French",
        natural.PorterStemmerFr,
        "pattern"
      ).getSentiment(tokens);
      expect(mine).toBe(ref);
    }
  );

  describe("BayesClassifier", () => {
    const training = [
      { text: "i love this sandwich", label: "pos" },
      { text: "this is an amazing place", label: "pos" },
      { text: "i feel very good about these beers", label: "pos" },
      { text: "this is my best work", label: "pos" },
      { text: "what an awesome view", label: "pos" },
      { text: "i do not like this restaurant", label: "neg" },
      { text: "i am tired of this stuff", label: "neg" },
      { text: "i cannot deal with this", label: "neg" },
      { text: "he is my sworn enemy", label: "neg" },
      { text: "my boss is horrible", label: "neg" }
    ];
    const queries = [
      "i love this place",
      "the food is amazing",
      "i hate this",
      "tired horrible boss"
    ];

    const buildMine = (): BayesClassifier => {
      const c = new BayesClassifier();
      training.forEach((d) => c.addDocument(d.text, d.label));
      c.train();
      return c;
    };
    const buildRef = (): Natural => {
      const c = new natural.BayesClassifier();
      training.forEach((d: { text: string; label: string }) =>
        c.addDocument(d.text, d.label)
      );
      c.train();
      return c;
    };

    it.each(queries)("classify %j", (text: string) => {
      if (!natural) return;
      expect(buildMine().classify(text)).toBe(buildRef().classify(text));
    });

    it.each(queries)("getClassifications %j", (text: string) => {
      if (!natural) return;
      expect(buildMine().getClassifications(text)).toEqual(
        buildRef().getClassifications(text)
      );
    });
  });
});
