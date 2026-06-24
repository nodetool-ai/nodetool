/**
 * Spanish Porter (Snowball) stemmer, ported verbatim from the `natural`
 * package (stemmers/porter_stemmer_es.js, MIT). Only `stem` is needed by the
 * sentiment analyzer; it matches natural's output exactly.
 */

function isVowel(c: string): boolean {
  const regex = /[aeiouáéíóú]/gi;
  return regex.test(c);
}

function nextVowelPosition(word: string, start = 0): number {
  const length = word.length;
  for (let position = start; position < length; position++) {
    if (isVowel(word[position])) {
      return position;
    }
  }
  return length;
}

function nextConsonantPosition(word: string, start = 0): number {
  const length = word.length;
  for (let position = start; position < length; position++) {
    if (!isVowel(word[position])) {
      return position;
    }
  }
  return length;
}

function endsIn(word: string, suffix: string): boolean {
  if (word.length < suffix.length) {
    return false;
  }
  return word.slice(-suffix.length) === suffix;
}

function endsInArr(word: string, suffixes: string[]): string {
  const matches: string[] = [];
  for (const suffix of suffixes) {
    if (endsIn(word, suffix)) {
      matches.push(suffix);
    }
  }
  const longest = matches.sort((a, b) => b.length - a.length)[0];
  return longest || "";
}

function removeAccent(word: string): string {
  const accentedVowels = ["á", "é", "í", "ó", "ú"];
  const vowels = ["a", "e", "i", "o", "u"];
  for (let i = 0; i < accentedVowels.length; i++) {
    word = word.replace(accentedVowels[i], vowels[i]);
  }
  return word;
}

function stem(word: string): string {
  const length = word.length;

  // Note: natural calls `word.toLowerCase()` without assignment here too; we
  // preserve that exact (no-op) behaviour for parity.
  word.toLowerCase();

  if (length < 2) {
    return removeAccent(word);
  }

  let r1 = length;
  let r2 = length;
  let rv = length;

  for (let i = 0; i < length - 1 && r1 === length; i++) {
    if (isVowel(word[i]) && !isVowel(word[i + 1])) {
      r1 = i + 2;
    }
  }

  for (let i = r1; i < length - 1 && r2 === length; i++) {
    if (isVowel(word[i]) && !isVowel(word[i + 1])) {
      r2 = i + 2;
    }
  }

  if (length > 3) {
    if (!isVowel(word[1])) {
      rv = nextVowelPosition(word, 2) + 1;
    } else if (isVowel(word[0]) && isVowel(word[1])) {
      rv = nextConsonantPosition(word, 2) + 1;
    } else {
      rv = 3;
    }
  }

  let r1Text = word.slice(r1);
  let r2Text = word.slice(r2);
  let rvText = word.slice(rv);
  const originalWord = word;

  // Step 0: Attached pronoun
  const pronounSuffix = [
    "me",
    "se",
    "sela",
    "selo",
    "selas",
    "selos",
    "la",
    "le",
    "lo",
    "las",
    "les",
    "los",
    "nos"
  ];
  const pronounSuffixPre1 = ["iéndo", "ándo", "ár", "ér", "ír"];
  const pronounSuffixPre2 = ["iendo", "ando", "ar", "er", "ir"];

  const suffix = endsInArr(word, pronounSuffix);

  if (suffix !== "") {
    let preSuffix = endsInArr(
      rvText.slice(0, -suffix.length),
      pronounSuffixPre1
    );

    if (preSuffix !== "") {
      word = removeAccent(word.slice(0, -suffix.length));
    } else {
      preSuffix = endsInArr(rvText.slice(0, -suffix.length), pronounSuffixPre2);

      if (preSuffix !== "" || endsIn(word.slice(0, -suffix.length), "uyendo")) {
        word = word.slice(0, -suffix.length);
      }
    }
  }

  if (word !== originalWord) {
    r1Text = word.slice(r1);
    r2Text = word.slice(r2);
    rvText = word.slice(rv);
  }

  const wordAfter0 = word;
  let suf: string | null = null;

  if (
    (suf = endsInArr(r2Text, [
      "anza",
      "anzas",
      "ico",
      "ica",
      "icos",
      "icas",
      "ismo",
      "ismos",
      "able",
      "ables",
      "ible",
      "ibles",
      "ista",
      "istas",
      "oso",
      "osa",
      "osos",
      "osas",
      "amiento",
      "amientos",
      "imiento",
      "imientos"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  } else if (
    (suf = endsInArr(r2Text, [
      "icadora",
      "icador",
      "icación",
      "icadoras",
      "icadores",
      "icaciones",
      "icante",
      "icantes",
      "icancia",
      "icancias",
      "adora",
      "ador",
      "ación",
      "adoras",
      "adores",
      "aciones",
      "ante",
      "antes",
      "ancia",
      "ancias"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  } else if ((suf = endsInArr(r2Text, ["logía", "logías"])) !== "") {
    word = word.slice(0, -suf.length) + "log";
  } else if ((suf = endsInArr(r2Text, ["ución", "uciones"])) !== "") {
    word = word.slice(0, -suf.length) + "u";
  } else if ((suf = endsInArr(r2Text, ["encia", "encias"])) !== "") {
    word = word.slice(0, -suf.length) + "ente";
  } else if (
    (suf = endsInArr(r2Text, [
      "ativamente",
      "ivamente",
      "osamente",
      "icamente",
      "adamente"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  } else if ((suf = endsInArr(r1Text, ["amente"])) !== "") {
    word = word.slice(0, -suf.length);
  } else if (
    (suf = endsInArr(r2Text, [
      "antemente",
      "ablemente",
      "iblemente",
      "mente"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  } else if (
    (suf = endsInArr(r2Text, [
      "abilidad",
      "abilidades",
      "icidad",
      "icidades",
      "ividad",
      "ividades",
      "idad",
      "idades"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  } else if (
    (suf = endsInArr(r2Text, [
      "ativa",
      "ativo",
      "ativas",
      "ativos",
      "iva",
      "ivo",
      "ivas",
      "ivos"
    ])) !== ""
  ) {
    word = word.slice(0, -suf.length);
  }

  if (word !== wordAfter0) {
    r1Text = word.slice(r1);
    r2Text = word.slice(r2);
    rvText = word.slice(rv);
  }
  const wordAfter1 = word;

  if (wordAfter0 === wordAfter1) {
    // Step 2a if no ending was removed by step 1.
    suf = endsInArr(rvText, [
      "ya",
      "ye",
      "yan",
      "yen",
      "yeron",
      "yendo",
      "yo",
      "yó",
      "yas",
      "yes",
      "yais",
      "yamos"
    ]);

    if (suf !== "" && word.slice(-suf.length - 1, -suf.length) === "u") {
      word = word.slice(0, -suf.length);
    }

    if (word !== wordAfter1) {
      r1Text = word.slice(r1);
      r2Text = word.slice(r2);
      rvText = word.slice(rv);
    }

    const wordAfter2a = word;
    if (wordAfter2a === wordAfter1) {
      if (
        (suf = endsInArr(rvText, [
          "arían",
          "arías",
          "arán",
          "arás",
          "aríais",
          "aría",
          "aréis",
          "aríamos",
          "aremos",
          "ará",
          "aré",
          "erían",
          "erías",
          "erán",
          "erás",
          "eríais",
          "ería",
          "eréis",
          "eríamos",
          "eremos",
          "erá",
          "eré",
          "irían",
          "irías",
          "irán",
          "irás",
          "iríais",
          "iría",
          "iréis",
          "iríamos",
          "iremos",
          "irá",
          "iré",
          "aba",
          "ada",
          "ida",
          "ía",
          "ara",
          "iera",
          "ad",
          "ed",
          "id",
          "ase",
          "iese",
          "aste",
          "iste",
          "an",
          "aban",
          "ían",
          "aran",
          "ieran",
          "asen",
          "iesen",
          "aron",
          "ieron",
          "ado",
          "ido",
          "ando",
          "iendo",
          "ió",
          "ar",
          "er",
          "ir",
          "as",
          "abas",
          "adas",
          "idas",
          "ías",
          "aras",
          "ieras",
          "ases",
          "ieses",
          "ís",
          "áis",
          "abais",
          "íais",
          "arais",
          "ierais",
          "  aseis",
          "ieseis",
          "asteis",
          "isteis",
          "ados",
          "idos",
          "amos",
          "ábamos",
          "íamos",
          "imos",
          "áramos",
          "iéramos",
          "iésemos",
          "ásemos"
        ])) !== ""
      ) {
        word = word.slice(0, -suf.length);
      } else if (
        (suf = endsInArr(rvText, ["en", "es", "éis", "emos"])) !== ""
      ) {
        word = word.slice(0, -suf.length);
        if (endsIn(word, "gu")) {
          word = word.slice(0, -1);
        }
      }
    }
  }

  r1Text = word.slice(r1);
  r2Text = word.slice(r2);
  rvText = word.slice(rv);

  if ((suf = endsInArr(rvText, ["os", "a", "o", "á", "í", "ó"])) !== "") {
    word = word.slice(0, -suf.length);
  } else if (endsInArr(rvText, ["e", "é"]) !== "") {
    word = word.slice(0, -1);
    rvText = word.slice(rv);
    if (endsIn(rvText, "u") && endsIn(word, "gu")) {
      word = word.slice(0, -1);
    }
  }

  return removeAccent(word);
}

export const PorterStemmerEs = { stem };
