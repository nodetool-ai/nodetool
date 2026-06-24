/**
 * Porter stemmer for English, ported verbatim from the `natural` package
 * (stemmers/porter_stemmer.js, MIT). The canonical Porter algorithm.
 *
 * `stem` matches natural exactly; `tokenizeAndStem` reproduces natural's base
 * `Stemmer.tokenizeAndStem` (AggressiveTokenizer + lowercase + stopword
 * filtering) which the Bayes classifier relies on.
 */

import { AggressiveTokenizer } from "./tokenizers.js";
import { STOPWORDS } from "./data/stopwords.js";

// Denote groups of consecutive consonants with a C and vowels with a V.
function categorizeGroups(token: string): string {
  return token
    .replace(/[^aeiouy]+y/g, "CV")
    .replace(/[aeiou]+/g, "V")
    .replace(/[^V]+/g, "C");
}

// Denote single consonants with a C and single vowels with a V.
function categorizeChars(token: string): string {
  return token
    .replace(/[^aeiouy]y/g, "CV")
    .replace(/[aeiou]/g, "V")
    .replace(/[^V]/g, "C");
}

// Calculate the "measure" M of a word.
function measure(token: string | null): number {
  if (!token) {
    return -1;
  }
  return (
    categorizeGroups(token).replace(/^C/, "").replace(/V$/, "").length / 2
  );
}

function endsWithDoublCons(token: string): RegExpMatchArray | null {
  return token.match(/([^aeiou])\1$/);
}

type ReplaceCallback = (token: string) => string | null;

function attemptReplace(
  token: string,
  pattern: string | RegExp,
  replacement: string,
  callback?: ReplaceCallback
): string | null {
  let result: string | null = null;

  if (
    typeof pattern === "string" &&
    token.substr(0 - pattern.length) === pattern
  ) {
    result = token.replace(new RegExp(pattern + "$"), replacement);
  } else if (pattern instanceof RegExp && token.match(pattern)) {
    result = token.replace(pattern, replacement);
  }

  if (result && callback) {
    return callback(result);
  }
  return result;
}

type ReplacementTriple = [string | RegExp, string, string];

function attemptReplacePatterns(
  token: string,
  replacements: ReplacementTriple[],
  measureThreshold?: number | null
): string {
  let replacement = token;

  for (let i = 0; i < replacements.length; i++) {
    if (
      measureThreshold == null ||
      measure(
        attemptReplace(token, replacements[i][0], replacements[i][1])
      ) > measureThreshold
    ) {
      replacement =
        attemptReplace(replacement, replacements[i][0], replacements[i][2]) ||
        replacement;
    }
  }

  return replacement;
}

function replacePatterns(
  token: string,
  replacements: ReplacementTriple[],
  measureThreshold?: number | null
): string {
  return attemptReplacePatterns(token, replacements, measureThreshold) || token;
}

function replaceRegex(
  token: string,
  regex: RegExp,
  includeParts: number[],
  minimumMeasure: number
): string | null {
  let parts: RegExpExecArray | null;
  let result = "";

  if (regex.test(token)) {
    parts = regex.exec(token);
    if (parts) {
      includeParts.forEach((i) => {
        result += parts![i];
      });
    }
  }

  if (measure(result) > minimumMeasure) {
    return result;
  }
  return null;
}

function step1a(token: string): string {
  if (token.match(/(ss|i)es$/)) {
    return token.replace(/(ss|i)es$/, "$1");
  }
  if (
    token.substr(-1) === "s" &&
    token.substr(-2, 1) !== "s" &&
    token.length > 2
  ) {
    return token.replace(/s?$/, "");
  }
  return token;
}

function step1b(token: string): string {
  let result: string | null;
  if (token.substr(-3) === "eed") {
    if (measure(token.substr(0, token.length - 3)) > 0) {
      return token.replace(/eed$/, "ee");
    }
  } else {
    result = attemptReplace(token, /(ed|ing)$/, "", function (innerToken) {
      if (categorizeGroups(innerToken).indexOf("V") >= 0) {
        const replaced = attemptReplacePatterns(innerToken, [
          ["at", "", "ate"],
          ["bl", "", "ble"],
          ["iz", "", "ize"]
        ]);

        if (replaced !== innerToken) {
          return replaced;
        }
        if (endsWithDoublCons(innerToken) && innerToken.match(/[^lsz]$/)) {
          return innerToken.replace(/([^aeiou])\1$/, "$1");
        }
        if (
          measure(innerToken) === 1 &&
          categorizeChars(innerToken).substr(-3) === "CVC" &&
          innerToken.match(/[^wxy]$/)
        ) {
          return innerToken + "e";
        }
        return innerToken;
      }
      return null;
    });

    if (result) {
      return result;
    }
  }
  return token;
}

function step1c(token: string): string {
  const categorizedGroups = categorizeGroups(token);
  if (
    token.substr(-1) === "y" &&
    categorizedGroups
      .substr(0, categorizedGroups.length - 1)
      .indexOf("V") > -1
  ) {
    return token.replace(/y$/, "i");
  }
  return token;
}

function step2(token: string): string {
  return replacePatterns(
    token,
    [
      ["ational", "", "ate"],
      ["tional", "", "tion"],
      ["enci", "", "ence"],
      ["anci", "", "ance"],
      ["izer", "", "ize"],
      ["abli", "", "able"],
      ["bli", "", "ble"],
      ["alli", "", "al"],
      ["entli", "", "ent"],
      ["eli", "", "e"],
      ["ousli", "", "ous"],
      ["ization", "", "ize"],
      ["ation", "", "ate"],
      ["ator", "", "ate"],
      ["alism", "", "al"],
      ["iveness", "", "ive"],
      ["fulness", "", "ful"],
      ["ousness", "", "ous"],
      ["aliti", "", "al"],
      ["iviti", "", "ive"],
      ["biliti", "", "ble"],
      ["logi", "", "log"]
    ],
    0
  );
}

function step3(token: string): string {
  return replacePatterns(
    token,
    [
      ["icate", "", "ic"],
      ["ative", "", ""],
      ["alize", "", "al"],
      ["iciti", "", "ic"],
      ["ical", "", "ic"],
      ["ful", "", ""],
      ["ness", "", ""]
    ],
    0
  );
}

function step4(token: string): string {
  return (
    replaceRegex(
      token,
      /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/,
      [1],
      1
    ) ||
    replaceRegex(token, /^(.+?)(s|t)(ion)$/, [1, 2], 1) ||
    token
  );
}

function step5a(token: string): string {
  const m = measure(token.replace(/e$/, ""));
  if (
    m > 1 ||
    (m === 1 &&
      !(
        categorizeChars(token).substr(-4, 3) === "CVC" &&
        token.match(/[^wxy].$/)
      ))
  ) {
    token = token.replace(/e$/, "");
  }
  return token;
}

function step5b(token: string): string {
  if (measure(token) > 1) {
    return token.replace(/ll$/, "l");
  }
  return token;
}

const tokenizer = new AggressiveTokenizer();

export const PorterStemmer = {
  stem(token: string): string {
    if (token.length < 3) {
      return token.toString();
    }
    return step5b(
      step5a(
        step4(step3(step2(step1c(step1b(step1a(token.toLowerCase()))))))
      )
    ).toString();
  },

  /** Mirrors natural's base `Stemmer.tokenizeAndStem`. */
  tokenizeAndStem(text: string, keepStops?: boolean): string[] {
    const stemmedTokens: string[] = [];
    const lowercaseText = text.toLowerCase();
    const tokens = tokenizer.tokenize(lowercaseText);

    if (keepStops) {
      tokens.forEach((token) => {
        stemmedTokens.push(PorterStemmer.stem(token));
      });
    } else {
      tokens.forEach((token) => {
        if (STOPWORDS.indexOf(token) === -1) {
          stemmedTokens.push(PorterStemmer.stem(token));
        }
      });
    }

    return stemmedTokens;
  }
};
