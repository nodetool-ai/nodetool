import { BaseNode, prop } from "@nodetool/node-sdk";

export class SentimentAnalysisLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.SentimentAnalysis";
  static readonly title = "Sentiment Analysis";
  static readonly description =
    "Analyzes sentiment of text using natural's SentimentAnalyzer.\n    sentiment, opinion, polarity, text analysis, NLP\n\n    Use cases:\n    - Determine positive or negative tone of text\n    - Analyze customer feedback sentiment\n    - Score product reviews\n    - Monitor social media sentiment";
  static readonly metadataOutputTypes = {
    score: "float",
    comparative: "float",
    positive_words: "list",
    negative_words: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to analyze for sentiment"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "English",
    title: "Language",
    description: "Language of the input text",
    values: ["English", "Spanish", "French"]
  })
  declare language: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const text = String(this.text ?? "");
    const language = String(this.language ?? "English");

    if (!text) {
      return { score: 0, comparative: 0, positive_words: [], negative_words: [] };
    }

    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text) ?? [];
    const stemmer = natural.PorterStemmer;
    const analyzer = new natural.SentimentAnalyzer(language, stemmer, "afinn");

    const comparative = analyzer.getSentiment(tokens);
    const vocabulary = (analyzer as unknown as { vocabulary: Record<string, number> }).vocabulary;

    const positiveWords: string[] = [];
    const negativeWords: string[] = [];
    let totalScore = 0;

    for (const token of tokens) {
      const stemmed = stemmer.stem(token);
      const wordScore = vocabulary[stemmed];
      if (wordScore !== undefined) {
        totalScore += wordScore;
        if (wordScore > 0) {
          positiveWords.push(token);
        } else if (wordScore < 0) {
          negativeWords.push(token);
        }
      }
    }

    return {
      score: totalScore,
      comparative,
      positive_words: positiveWords,
      negative_words: negativeWords
    };
  }
}

export class TokenizeLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.Tokenize";
  static readonly title = "Tokenize";
  static readonly description =
    "Tokenizes text into words or sentences.\n    tokenize, split, words, sentences, NLP\n\n    Use cases:\n    - Break text into individual words for analysis\n    - Split text into sentences for processing\n    - Prepare text for further NLP operations\n    - Count words or sentences in text";
  static readonly metadataOutputTypes = {
    output: "list",
    count: "int"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to tokenize"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "word",
    title: "Mode",
    description: "Tokenization mode: split into words or sentences",
    values: ["word", "sentence"]
  })
  declare mode: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const text = String(this.text ?? "");
    const mode = String(this.mode ?? "word");

    if (!text) {
      return { output: [], count: 0 };
    }

    let tokens: string[];
    if (mode === "sentence") {
      const tokenizer = new natural.SentenceTokenizer([]);
      tokens = tokenizer.tokenize(text) ?? [];
    } else {
      const tokenizer = new natural.WordTokenizer();
      tokens = tokenizer.tokenize(text) ?? [];
    }

    return { output: tokens, count: tokens.length };
  }
}

export class StemLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.Stem";
  static readonly title = "Stem";
  static readonly description =
    "Stems words to their root form.\n    stem, root, morphology, NLP, text processing\n\n    Use cases:\n    - Reduce words to their base form for matching\n    - Normalize text for search indexing\n    - Prepare text for comparison and deduplication\n    - Improve text similarity matching";
  static readonly metadataOutputTypes = {
    output: "str",
    tokens: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text containing words to stem"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "porter",
    title: "Algorithm",
    description: "Stemming algorithm to use",
    values: ["porter", "lancaster"]
  })
  declare algorithm: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const text = String(this.text ?? "");
    const algorithm = String(this.algorithm ?? "porter");

    if (!text) {
      return { output: "", tokens: [] };
    }

    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text) ?? [];

    const stemmer =
      algorithm === "lancaster"
        ? natural.LancasterStemmer
        : natural.PorterStemmer;

    const stemmedTokens = tokens.map((token: string) => stemmer.stem(token));
    const output = stemmedTokens.join(" ");

    return { output, tokens: stemmedTokens };
  }
}

export class TfIdfLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.TfIdf";
  static readonly title = "TF-IDF";
  static readonly description =
    "Computes TF-IDF scores for terms across multiple documents.\n    tf-idf, term frequency, document frequency, text analysis, NLP\n\n    Use cases:\n    - Rank document relevance for a search query\n    - Identify important terms in a collection of documents\n    - Build keyword extraction pipelines\n    - Compare document similarity by term importance";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "list",
    default: [],
    title: "Documents",
    description: "List of text strings to compute TF-IDF across"
  })
  declare documents: any;

  @prop({
    type: "str",
    default: "",
    title: "Query Term",
    description: "Term to compute TF-IDF for"
  })
  declare query: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const documents = Array.isArray(this.documents) ? this.documents : [];
    const query = String(this.query ?? "");

    if (documents.length === 0 || !query) {
      return { output: [] };
    }

    const tfidf = new natural.TfIdf();
    for (const doc of documents) {
      tfidf.addDocument(String(doc));
    }

    const results: Array<{ document_index: number; score: number }> = [];
    tfidf.tfidfs(query, (i: number, measure: number) => {
      results.push({ document_index: i, score: measure });
    });

    return { output: results };
  }
}

export class ClassifyTextLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.ClassifyText";
  static readonly title = "Classify Text";
  static readonly description =
    "Trains a Naive Bayes classifier and classifies text.\n    classify, categorize, naive bayes, machine learning, NLP\n\n    Use cases:\n    - Categorize text into predefined labels\n    - Build simple spam detection\n    - Classify customer support tickets\n    - Sort documents by topic";
  static readonly metadataOutputTypes = {
    output: "str",
    classifications: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to classify"
  })
  declare text: any;

  @prop({
    type: "list",
    default: [],
    title: "Training Data",
    description: "Array of {text, label} objects for training the classifier"
  })
  declare training_data: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const text = String(this.text ?? "");
    const trainingData = Array.isArray(this.training_data)
      ? this.training_data
      : [];

    if (!text || trainingData.length === 0) {
      return { output: "", classifications: [] };
    }

    const classifier = new natural.BayesClassifier();

    for (const item of trainingData) {
      const itemText = String(
        (item as Record<string, unknown>).text ?? ""
      );
      const itemLabel = String(
        (item as Record<string, unknown>).label ?? ""
      );
      if (itemText && itemLabel) {
        classifier.addDocument(itemText, itemLabel);
      }
    }

    classifier.train();

    const predicted = classifier.classify(text) as string;
    const classifications = classifier.getClassifications(text) as Array<{
      label: string;
      value: number;
    }>;

    return { output: predicted, classifications };
  }
}

export class ExtractEntitiesLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.ExtractEntities";
  static readonly title = "Extract Entities";
  static readonly description =
    "Extracts named entities and parts of speech using compromise.\n    NER, named entities, parts of speech, NLP, text analysis\n\n    Use cases:\n    - Extract people, places, and organizations from text\n    - Identify nouns and verbs in sentences\n    - Build knowledge graphs from unstructured text\n    - Analyze text structure and content";
  static readonly metadataOutputTypes = {
    people: "list",
    places: "list",
    organizations: "list",
    numbers: "list",
    nouns: "list",
    verbs: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to extract entities from"
  })
  declare text: any;

  async process(): Promise<Record<string, unknown>> {
    const nlp = (await import("compromise")).default;
    const text = String(this.text ?? "");

    if (!text) {
      return {
        people: [],
        places: [],
        organizations: [],
        numbers: [],
        nouns: [],
        verbs: []
      };
    }

    const doc = nlp(text);

    const people = doc.people().out("array") as string[];
    const places = doc.places().out("array") as string[];
    const organizations = doc.organizations().out("array") as string[];
    const numbers = doc.numbers().out("array") as string[];
    const nouns = doc.nouns().out("array") as string[];
    const verbs = doc.verbs().out("array") as string[];

    return {
      people,
      places,
      organizations,
      numbers,
      nouns,
      verbs
    };
  }
}

export class PhoneticMatchLibNode extends BaseNode {
  static readonly nodeType = "lib.nlp.PhoneticMatch";
  static readonly title = "Phonetic Match";
  static readonly description =
    "Computes phonetic codes for words using Soundex, Metaphone, or Double Metaphone.\n    phonetics, soundex, metaphone, fuzzy matching, NLP\n\n    Use cases:\n    - Find words that sound alike\n    - Build fuzzy name matching systems\n    - Implement spell correction suggestions\n    - Match names with different spellings";
  static readonly metadataOutputTypes = {
    output: "str",
    tokens: "list"
  };
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text containing words to compute phonetic codes for"
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "metaphone",
    title: "Algorithm",
    description: "Phonetic algorithm to use",
    values: ["soundex", "metaphone", "double_metaphone"]
  })
  declare algorithm: any;

  async process(): Promise<Record<string, unknown>> {
    const natural = (await import("natural")).default;
    const text = String(this.text ?? "");
    const algorithm = String(this.algorithm ?? "metaphone");

    if (!text) {
      return { output: "", tokens: [] };
    }

    const tokenizer = new natural.WordTokenizer();
    const words = tokenizer.tokenize(text) ?? [];

    const phoneticTokens: Array<{ word: string; code: string | string[] }> = [];

    if (algorithm === "soundex") {
      const encoder = new natural.SoundEx();
      for (const word of words) {
        phoneticTokens.push({ word, code: encoder.process(word) as string });
      }
    } else if (algorithm === "double_metaphone") {
      const encoder = new natural.DoubleMetaphone();
      for (const word of words) {
        phoneticTokens.push({
          word,
          code: encoder.process(word) as string[]
        });
      }
    } else {
      const encoder = new natural.Metaphone();
      for (const word of words) {
        phoneticTokens.push({ word, code: encoder.process(word) as string });
      }
    }

    const output = phoneticTokens
      .map((t) => (Array.isArray(t.code) ? t.code.join(",") : t.code))
      .join(" ");

    return { output, tokens: phoneticTokens };
  }
}

export const LIB_NLP_NODES = [
  SentimentAnalysisLibNode,
  TokenizeLibNode,
  StemLibNode,
  TfIdfLibNode,
  ClassifyTextLibNode,
  ExtractEntitiesLibNode,
  PhoneticMatchLibNode
] as const;
