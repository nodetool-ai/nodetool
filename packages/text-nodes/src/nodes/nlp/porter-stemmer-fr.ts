/**
 * French Porter (Snowball) stemmer, ported verbatim from the `natural` package
 * (stemmers/porter_stemmer_fr.js, MIT). Only `stem` is needed by the sentiment
 * analyzer; it matches natural's output exactly.
 *
 * Spec: http://snowball.tartarus.org/algorithms/french/stemmer.html
 */

function isVowel(letter: string): boolean {
  return (
    letter === "a" ||
    letter === "e" ||
    letter === "i" ||
    letter === "o" ||
    letter === "u" ||
    letter === "y" ||
    letter === "â" ||
    letter === "à" ||
    letter === "ë" ||
    letter === "é" ||
    letter === "ê" ||
    letter === "è" ||
    letter === "ï" ||
    letter === "î" ||
    letter === "ô" ||
    letter === "û" ||
    letter === "ù"
  );
}

function endsin(token: string, suffix: string): boolean {
  if (token.length < suffix.length) {
    return false;
  }
  return token.slice(-suffix.length) === suffix;
}

/**
 * Returns the longest matching suffix, or "". `natural` sometimes passes a
 * bare string instead of an array; iterating a string yields its characters,
 * which we preserve for byte-for-byte parity.
 */
function endsinArr(token: string, suffixes: string[] | string): string {
  let longest = "";
  for (let i = 0; i < suffixes.length; i++) {
    if (endsin(token, suffixes[i]) && suffixes[i].length > longest.length) {
      longest = suffixes[i];
    }
  }
  return longest;
}

function prelude(token: string): string {
  token = token.toLowerCase();

  let result = "";
  let i = 0;

  if (token[i] === "y" && isVowel(token[i + 1])) {
    result += token[i].toUpperCase();
  } else {
    result += token[i];
  }

  for (i = 1; i < token.length; i++) {
    if (
      (token[i] === "u" || token[i] === "i") &&
      isVowel(token[i - 1]) &&
      isVowel(token[i + 1])
    ) {
      result += token[i].toUpperCase();
    } else if (
      token[i] === "y" &&
      (isVowel(token[i - 1]) || isVowel(token[i + 1]))
    ) {
      result += token[i].toUpperCase();
    } else if (token[i] === "u" && token[i - 1] === "q") {
      result += token[i].toUpperCase();
    } else {
      result += token[i];
    }
  }

  return result;
}

function regions(token: string): { r1: number; r2: number; rv: number } {
  const len = token.length;
  let r1 = len;
  let r2 = len;
  let rv = len;

  for (let i = 0; i < len - 1 && r1 === len; i++) {
    if (isVowel(token[i]) && !isVowel(token[i + 1])) {
      r1 = i + 2;
    }
  }

  for (let i = r1; i < len - 1 && r2 === len; i++) {
    if (isVowel(token[i]) && !isVowel(token[i + 1])) {
      r2 = i + 2;
    }
  }

  const three = token.slice(0, 3);
  if (isVowel(token[0]) && isVowel(token[1])) {
    rv = 3;
  }
  if (three === "par" || three === "col" || three === "tap") {
    rv = 3;
  } else {
    for (let i = 1; i < len - 1 && rv === len; i++) {
      if (isVowel(token[i])) {
        rv = i + 1;
      }
    }
  }

  return { r1, r2, rv };
}

function stem(token: string): string {
  token = prelude(token.toLowerCase());

  if (token.length === 1) {
    return token;
  }

  const regs = regions(token);

  let r1txt = token.substring(regs.r1);
  let r2txt = token.substring(regs.r2);
  let rvtxt = token.substring(regs.rv);

  // Step 1
  const beforeStep1 = token;
  let suf: string;
  let letterBefore: string;
  let letter2Before: string;
  let i: number;
  let doStep2a = false;

  if (
    (suf = endsinArr(r2txt, [
      "ance",
      "iqUe",
      "isme",
      "able",
      "iste",
      "eux",
      "ances",
      "iqUes",
      "ismes",
      "ables",
      "istes"
    ])) !== ""
  ) {
    token = token.slice(0, -suf.length);
  } else if (
    (suf = endsinArr(token, [
      "icatrice",
      "icateur",
      "ication",
      "icatrices",
      "icateurs",
      "ications"
    ])) !== ""
  ) {
    if (
      endsinArr(r2txt, [
        "icatrice",
        "icateur",
        "ication",
        "icatrices",
        "icateurs",
        "ications"
      ]) !== ""
    ) {
      token = token.slice(0, -suf.length);
    } else {
      token = token.slice(0, -suf.length) + "iqU";
    }
  } else if (
    (suf = endsinArr(r2txt, [
      "atrice",
      "ateur",
      "ation",
      "atrices",
      "ateurs",
      "ations"
    ])) !== ""
  ) {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(r2txt, ["logie", "logies"])) !== "") {
    token = token.slice(0, -suf.length) + "log";
  } else if (
    (suf = endsinArr(r2txt, ["usion", "ution", "usions", "utions"])) !== ""
  ) {
    token = token.slice(0, -suf.length) + "u";
  } else if ((suf = endsinArr(r2txt, ["ence", "ences"])) !== "") {
    token = token.slice(0, -suf.length) + "ent";
  } else if (
    (suf = endsinArr(r1txt, ["issement", "issements"])) !== ""
  ) {
    if (!isVowel(token[token.length - suf.length - 1])) {
      token = token.slice(0, -suf.length);
      r1txt = token.substring(regs.r1);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
  } else if (
    (suf = endsinArr(r2txt, ["ativement", "ativements"])) !== ""
  ) {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(r2txt, ["ivement", "ivements"])) !== "") {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(token, ["eusement", "eusements"])) !== "") {
    if ((suf = endsinArr(r2txt, ["eusement", "eusements"])) !== "") {
      token = token.slice(0, -suf.length);
    } else if ((suf = endsinArr(r1txt, ["eusement", "eusements"])) !== "") {
      token = token.slice(0, -suf.length) + "eux";
    } else if ((suf = endsinArr(rvtxt, ["ement", "ements"])) !== "") {
      token = token.slice(0, -suf.length);
    }
  } else if (
    (suf = endsinArr(r2txt, [
      "ablement",
      "ablements",
      "iqUement",
      "iqUements"
    ])) !== ""
  ) {
    token = token.slice(0, -suf.length);
  } else if (
    (suf = endsinArr(rvtxt, [
      "ièrement",
      "ièrements",
      "Ièrement",
      "Ièrements"
    ])) !== ""
  ) {
    token = token.slice(0, -suf.length) + "i";
  } else if ((suf = endsinArr(rvtxt, ["ement", "ements"])) !== "") {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(token, ["icité", "icités"])) !== "") {
    if (endsinArr(r2txt, ["icité", "icités"]) !== "") {
      token = token.slice(0, -suf.length);
    } else {
      token = token.slice(0, -suf.length) + "iqU";
    }
  } else if ((suf = endsinArr(token, ["abilité", "abilités"])) !== "") {
    if (endsinArr(r2txt, ["abilité", "abilités"]) !== "") {
      token = token.slice(0, -suf.length);
    } else {
      token = token.slice(0, -suf.length) + "abl";
    }
  } else if ((suf = endsinArr(r2txt, ["ité", "ités"])) !== "") {
    token = token.slice(0, -suf.length);
  } else if (
    (suf = endsinArr(token, [
      "icatif",
      "icative",
      "icatifs",
      "icatives"
    ])) !== ""
  ) {
    if (
      (suf = endsinArr(r2txt, [
        "icatif",
        "icative",
        "icatifs",
        "icatives"
      ])) !== ""
    ) {
      token = token.slice(0, -suf.length);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
    if (
      (suf = endsinArr(r2txt, ["atif", "ative", "atifs", "atives"])) !== ""
    ) {
      token = token.slice(0, -suf.length - 2) + "iqU";
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
  } else if (
    (suf = endsinArr(r2txt, ["atif", "ative", "atifs", "atives"])) !== ""
  ) {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(r2txt, ["if", "ive", "ifs", "ives"])) !== "") {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(token, ["eaux"])) !== "") {
    token = token.slice(0, -suf.length) + "eau";
  } else if ((suf = endsinArr(r1txt, ["aux"])) !== "") {
    token = token.slice(0, -suf.length) + "al";
  } else if ((suf = endsinArr(r2txt, ["euse", "euses"])) !== "") {
    token = token.slice(0, -suf.length);
  } else if ((suf = endsinArr(r1txt, ["euse", "euses"])) !== "") {
    token = token.slice(0, -suf.length) + "eux";
  } else if ((suf = endsinArr(rvtxt, ["amment"])) !== "") {
    token = token.slice(0, -suf.length) + "ant";
    doStep2a = true;
  } else if ((suf = endsinArr(rvtxt, ["emment"])) !== "") {
    token = token.slice(0, -suf.length) + "ent";
    doStep2a = true;
  } else if ((suf = endsinArr(rvtxt, ["ment", "ments"])) !== "") {
    letterBefore = token[token.length - suf.length - 1];
    if (isVowel(letterBefore) && endsin(rvtxt, letterBefore + suf)) {
      token = token.slice(0, -suf.length);
      doStep2a = true;
    }
  }

  // re-compute regions
  r1txt = token.substring(regs.r1);
  r2txt = token.substring(regs.r2);
  rvtxt = token.substring(regs.rv);

  // Step 2a
  const beforeStep2a = token;
  let step2aDone = false;
  if (beforeStep1 === token || doStep2a) {
    step2aDone = true;
    if (
      (suf = endsinArr(rvtxt, [
        "îmes",
        "ît",
        "îtes",
        "i",
        "ie",
        "Ie",
        "ies",
        "ir",
        "ira",
        "irai",
        "iraIent",
        "irais",
        "irait",
        "iras",
        "irent",
        "irez",
        "iriez",
        "irions",
        "irons",
        "iront",
        "is",
        "issaIent",
        "issais",
        "issait",
        "issant",
        "issante",
        "issantes",
        "issants",
        "isse",
        "issent",
        "isses",
        "issez",
        "issiez",
        "issions",
        "issons",
        "it"
      ])) !== ""
    ) {
      letterBefore = token[token.length - suf.length - 1];
      if (!isVowel(letterBefore) && endsin(rvtxt, letterBefore + suf)) {
        token = token.slice(0, -suf.length);
      }
    }
  }

  // Step 2b
  if (step2aDone && token === beforeStep2a) {
    if (
      (suf = endsinArr(rvtxt, [
        "é",
        "ée",
        "ées",
        "és",
        "èrent",
        "er",
        "era",
        "erai",
        "eraIent",
        "erais",
        "erait",
        "eras",
        "erez",
        "eriez",
        "erions",
        "erons",
        "eront",
        "ez",
        "iez",
        "Iez"
      ])) !== ""
    ) {
      token = token.slice(0, -suf.length);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    } else if (
      (suf = endsinArr(rvtxt, ["ions"])) !== "" &&
      endsinArr(r2txt, ["ions"])
    ) {
      token = token.slice(0, -suf.length);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    } else if (
      (suf = endsinArr(rvtxt, [
        "âmes",
        "ât",
        "âtes",
        "a",
        "ai",
        "aIent",
        "ais",
        "ait",
        "ant",
        "ante",
        "antes",
        "ants",
        "as",
        "asse",
        "assent",
        "asses",
        "assiez",
        "assions"
      ])) !== ""
    ) {
      token = token.slice(0, -suf.length);

      letterBefore = token[token.length - 1];
      if (letterBefore === "e" && endsin(rvtxt, "e" + suf)) {
        token = token.slice(0, -1);
      }

      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
  }

  // Step 3
  if (!(token === beforeStep1)) {
    if (token[token.length - 1] === "Y") {
      token = token.slice(0, -1) + "i";
    }
    if (token[token.length - 1] === "ç") {
      token = token.slice(0, -1) + "c";
    }
  } else {
    // Step 4
    letterBefore = token[token.length - 1];
    letter2Before = token[token.length - 2];

    if (
      letterBefore === "s" &&
      ["a", "i", "o", "u", "è", "s"].indexOf(letter2Before) === -1
    ) {
      token = token.slice(0, -1);
      r1txt = token.substring(regs.r1);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }

    if ((suf = endsinArr(r2txt, ["ion"])) !== "") {
      letterBefore = token[token.length - suf.length - 1];
      if (letterBefore === "s" || letterBefore === "t") {
        token = token.slice(0, -suf.length);
        r1txt = token.substring(regs.r1);
        r2txt = token.substring(regs.r2);
        rvtxt = token.substring(regs.rv);
      }
    }

    if ((suf = endsinArr(rvtxt, ["ier", "ière", "Ier", "Ière"])) !== "") {
      token = token.slice(0, -suf.length) + "i";
      r1txt = token.substring(regs.r1);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
    if ((suf = endsinArr(rvtxt, "e")) !== "") {
      token = token.slice(0, -suf.length);
      r1txt = token.substring(regs.r1);
      r2txt = token.substring(regs.r2);
      rvtxt = token.substring(regs.rv);
    }
    if ((suf = endsinArr(rvtxt, "ë")) !== "") {
      if (token.slice(token.length - 3, -1) === "gu") {
        token = token.slice(0, -suf.length);
      }
    }
  }

  // Step 5
  if ((suf = endsinArr(token, ["enn", "onn", "ett", "ell", "eill"])) !== "") {
    token = token.slice(0, -1);
  }

  // Step 6
  i = token.length - 1;
  while (i > 0) {
    if (!isVowel(token[i])) {
      i--;
    } else if (
      i !== token.length - 1 &&
      (token[i] === "é" || token[i] === "è")
    ) {
      token =
        token.substring(0, i) + "e" + token.substring(i + 1, token.length);
      break;
    } else {
      break;
    }
  }

  return token.toLowerCase();
}

export const PorterStemmerFr = { stem };
