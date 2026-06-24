/**
 * Phonetic encoders ported verbatim from the `natural` package
 * (phonetics/soundex.js, metaphone.js, double_metaphone.js, MIT).
 *
 * Public reference algorithms; the ports mirror natural's exact transforms so
 * codes match character-for-character.
 */

/** Soundex encoder. Matches natural's `SoundEx`. */
export class SoundEx {
  process(token: string, maxLength?: number): string {
    token = token.toLowerCase();
    let transformed = this.condense(
      this.transform(token.substr(1, token.length - 1))
    );
    transformed = transformed.replace(
      new RegExp("^" + this.transform(token.charAt(0))),
      ""
    );
    return (
      token.charAt(0).toUpperCase() +
      this.padRight0(transformed.replace(/\D/g, "")).substr(
        0,
        (maxLength && maxLength - 1) || 3
      )
    );
  }

  private transformLipps(token: string): string {
    return token.replace(/[bfpv]/g, "1");
  }

  private transformThroats(token: string): string {
    return token.replace(/[cgjkqsxz]/g, "2");
  }

  private transformToungue(token: string): string {
    return token.replace(/[dt]/g, "3");
  }

  private transformL(token: string): string {
    return token.replace(/l/g, "4");
  }

  private transformHum(token: string): string {
    return token.replace(/[mn]/g, "5");
  }

  private transformR(token: string): string {
    return token.replace(/r/g, "6");
  }

  private condense(token: string): string {
    return token.replace(/(\d)?\1+/g, "$1");
  }

  private padRight0(token: string): string {
    if (token.length < 4) {
      return token + Array(4 - token.length).join("0");
    }
    return token;
  }

  private transform(token: string): string {
    return this.transformLipps(
      this.transformThroats(
        this.transformToungue(
          this.transformL(this.transformHum(this.transformR(token)))
        )
      )
    );
  }
}

/** Metaphone encoder. Matches natural's `Metaphone`. */
export class Metaphone {
  private dedup(token: string): string {
    return token.replace(/([^c])\1/g, "$1");
  }

  private dropInitialLetters(token: string): string {
    if (token.match(/^(kn|gn|pn|ae|wr)/)) {
      return token.substr(1, token.length - 1);
    }
    return token;
  }

  private dropBafterMAtEnd(token: string): string {
    return token.replace(/mb$/, "m");
  }

  private cTransform(token: string): string {
    token = token.replace(/([^s]|^)(c)(h)/g, "$1x$3").trim();
    token = token.replace(/cia/g, "xia");
    token = token.replace(/c(i|e|y)/g, "s$1");
    token = token.replace(/c/g, "k");
    return token;
  }

  private dTransform(token: string): string {
    token = token.replace(/d(ge|gy|gi)/g, "j$1");
    token = token.replace(/d/g, "t");
    return token;
  }

  private dropG(token: string): string {
    token = token.replace(/gh(^$|[^aeiou])/g, "h$1");
    token = token.replace(/g(n|ned)$/g, "$1");
    return token;
  }

  private transformG(token: string): string {
    token = token.replace(/gh/g, "f");
    token = token.replace(/([^g]|^)(g)(i|e|y)/g, "$1j$3");
    token = token.replace(/gg/g, "g");
    token = token.replace(/g/g, "k");
    return token;
  }

  private dropH(token: string): string {
    return token.replace(/([aeiou])h([^aeiou]|$)/g, "$1$2");
  }

  private transformCK(token: string): string {
    return token.replace(/ck/g, "k");
  }

  private transformPH(token: string): string {
    return token.replace(/ph/g, "f");
  }

  private transformQ(token: string): string {
    return token.replace(/q/g, "k");
  }

  private transformS(token: string): string {
    return token.replace(/s(h|io|ia)/g, "x$1");
  }

  private transformT(token: string): string {
    token = token.replace(/t(ia|io)/g, "x$1");
    token = token.replace(/th/, "0");
    return token;
  }

  private dropT(token: string): string {
    return token.replace(/tch/g, "ch");
  }

  private transformV(token: string): string {
    return token.replace(/v/g, "f");
  }

  private transformWH(token: string): string {
    return token.replace(/^wh/, "w");
  }

  private dropW(token: string): string {
    return token.replace(/w([^aeiou]|$)/g, "$1");
  }

  private transformX(token: string): string {
    token = token.replace(/^x/, "s");
    token = token.replace(/x/g, "ks");
    return token;
  }

  private dropY(token: string): string {
    return token.replace(/y([^aeiou]|$)/g, "$1");
  }

  private transformZ(token: string): string {
    return token.replace(/z/, "s");
  }

  private dropVowels(token: string): string {
    return (
      token.charAt(0) +
      token.substr(1, token.length).replace(/[aeiou]/g, "")
    );
  }

  process(token: string, maxLength?: number): string {
    const maxLengthNew = maxLength || 32;
    token = token.toLowerCase();
    token = this.dedup(token);
    token = this.dropInitialLetters(token);
    token = this.dropBafterMAtEnd(token);
    token = this.transformCK(token);
    token = this.cTransform(token);
    token = this.dTransform(token);
    token = this.dropG(token);
    token = this.transformG(token);
    token = this.dropH(token);
    token = this.transformPH(token);
    token = this.transformQ(token);
    token = this.transformS(token);
    token = this.transformX(token);
    token = this.transformT(token);
    token = this.dropT(token);
    token = this.transformV(token);
    token = this.transformWH(token);
    token = this.dropW(token);
    token = this.dropY(token);
    token = this.transformZ(token);
    token = this.dropVowels(token);

    if (token.length >= maxLengthNew) {
      token = token.substring(0, maxLengthNew);
    }

    return token.toUpperCase();
  }
}

function isDoubleMetaphoneVowel(
  c: string | undefined
): RegExpMatchArray | null {
  return (c && c.match(/[aeiouy]/i)) || null;
}

/** Double Metaphone encoder. Matches natural's `DoubleMetaphone`. */
export class DoubleMetaphone {
  process(token: string, maxLength?: number): [string, string] {
    token = token.toUpperCase();
    let primary = "";
    let secondary = "";
    let pos = 0;
    maxLength = maxLength || 32;

    const san = token.substring(0, 3) === "SAN";
    const startsWithVowel = isDoubleMetaphoneVowel(token[0]);
    const slavoGermanic = token.match(/(W|K|CZ|WITZ)/);

    if (subMatch(0, 2, ["GN", "KN", "PN", "WR", "PS"])) {
      pos++;
    }

    while (pos < token.length) {
      switch (token[pos]) {
        case "A":
        case "E":
        case "I":
        case "O":
        case "U":
        case "Y":
        case "Ê":
        case "É":
        case "À":
          if (pos === 0) {
            add("A");
          }
          break;
        case "B":
          addCompressedDouble("B", "P");
          break;
        case "C":
          handleC();
          break;
        case "Ç":
          add("S");
          break;
        case "D":
          handleD();
          break;
        case "F":
        case "K":
        case "N":
          addCompressedDouble(token[pos]);
          break;
        case "G":
          handleG();
          break;
        case "H":
          handleH();
          break;
        case "J":
          handleJ();
          break;
        case "L":
          handleL();
          break;
        case "M":
          handleM();
          break;
        case "Ñ":
          add("N");
          break;
        case "P":
          handleP();
          break;
        case "Q":
          addCompressedDouble("Q", "K");
          break;
        case "R":
          handleR();
          break;
        case "S":
          handleS();
          break;
        case "T":
          handleT();
          break;
        case "V":
          addCompressedDouble("V", "F");
          break;
        case "W":
          handleW();
          break;
        case "X":
          handleX();
          break;
        case "Z":
          handleZ();
          break;
      }

      if (primary.length >= maxLength && secondary.length >= maxLength) {
        break;
      }

      pos++;
    }

    return [truncate(primary, maxLength), truncate(secondary, maxLength)];

    function subMatch(
      startOffset: number,
      stopOffset: number,
      terms: string[]
    ): boolean {
      return subMatchAbsolute(pos + startOffset, pos + stopOffset, terms);
    }

    function subMatchAbsolute(
      startOffset: number,
      stopOffset: number,
      terms: string[]
    ): boolean {
      return terms.indexOf(token.substring(startOffset, stopOffset)) > -1;
    }

    function truncate(value: string, length: number): string {
      if (value.length >= length) {
        value = value.substring(0, length);
      }
      return value;
    }

    function addSecondary(
      primaryAppendage: string,
      secondaryAppendage: string
    ): void {
      primary += primaryAppendage;
      secondary += secondaryAppendage;
    }

    function add(primaryAppendage: string): void {
      addSecondary(primaryAppendage, primaryAppendage);
    }

    function addCompressedDouble(c: string, encoded?: string): void {
      if (token[pos + 1] === c) {
        pos++;
      }
      add(encoded || c);
    }

    function handleC(): void {
      if (
        (pos >= 1 &&
          !isDoubleMetaphoneVowel(token[pos - 2]) &&
          token[pos - 1] === "A" &&
          token[pos + 1] === "H" &&
          token[pos + 2] !== "I") ||
        subMatch(-2, 4, ["BACHER", "MACHER"])
      ) {
        add("K");
        pos++;
      } else if (pos === 0 && token.substring(1, 6) === "EASAR") {
        add("S");
        add("S");
        add("R");
        pos += 6;
      } else if (token.substring(pos + 1, pos + 4) === "HIA") {
        add("K");
        pos++;
      } else if (token[pos + 1] === "H") {
        if (pos > 0 && token.substring(pos + 2, pos + 4) === "AE") {
          addSecondary("K", "X");
          pos++;
        } else if (
          pos === 0 &&
          (subMatch(1, 6, ["HARAC", "HARIS"]) ||
            subMatch(1, 4, ["HOR", "HUM", "HIA", "HEM"])) &&
          token.substring(pos + 1, pos + 5) !== "HORE"
        ) {
          add("K");
          pos++;
        } else {
          if (
            subMatchAbsolute(0, 3, ["VAN", "VON"]) ||
            token.substring(0, 3) === "SCH" ||
            subMatch(-2, 4, ["ORCHES", "ARCHIT", "ORCHID"]) ||
            subMatch(2, 3, ["T", "S"]) ||
            ((subMatch(-1, 0, ["A", "O", "U", "E"]) || pos === 0) &&
              subMatch(2, 3, [
                "B",
                "F",
                "H",
                "L",
                "M",
                "N",
                "R",
                "V",
                "W"
              ]))
          ) {
            add("K");
          } else if (pos > 0) {
            if (token.substring(0, 2) === "MC") {
              add("K");
            } else {
              addSecondary("X", "K");
            }
          } else {
            add("X");
          }
          pos++;
        }
      } else if (
        token.substring(pos, pos + 2) === "CZ" &&
        token.substring(pos - 2, pos + 1) !== "WICZ"
      ) {
        addSecondary("S", "X");
        pos++;
      } else if (token.substring(pos, pos + 3) === "CIA") {
        add("X");
        pos += 2;
      } else if (token[pos + 1] === "C" && pos !== 1 && token[0] !== "M") {
        if (
          ["I", "E", "H"].indexOf(token[pos + 2]) > -1 &&
          token.substring(pos + 2, pos + 4) !== "HU"
        ) {
          if (
            (pos === 1 && token[pos - 1] === "A") ||
            subMatch(-1, 4, ["UCCEE", "UCCES"])
          ) {
            add("KS");
          } else {
            add("X");
          }
          pos += 2;
        } else {
          add("K");
          pos++;
        }
      } else if (["K", "G", "Q"].indexOf(token[pos + 1]) > -1) {
        add("K");
        pos++;
      } else if (["E", "I", "Y"].indexOf(token[pos + 1]) > -1) {
        if (subMatch(1, 3, ["IA", "IE", "IO"])) {
          addSecondary("S", "X");
        } else {
          add("S");
        }
        pos++;
      } else {
        add("K");
        if (
          token[pos + 1] === " " &&
          // Preserve natural's truthy index check (intentional quirk).
          (["C", "Q", "G"].indexOf(token[pos + 2]) as unknown as boolean)
        ) {
          pos += 2;
        } else if (
          ["C", "K", "Q"].indexOf(token[pos + 1]) > -1 &&
          !subMatch(1, 3, ["CE", "CI"])
        ) {
          pos++;
        }
      }
    }

    function handleD(): void {
      if (token[pos + 1] === "G") {
        if (["I", "E", "Y"].indexOf(token[pos + 2]) > -1) {
          add("J");
          pos += 2;
        } else {
          add("TK");
          pos++;
        }
      } else if (token[pos + 1] === "T") {
        add("T");
        pos++;
      } else {
        addCompressedDouble("D", "T");
      }
    }

    function handleG(): void {
      if (token[pos + 1] === "H") {
        if (pos > 0 && !isDoubleMetaphoneVowel(token[pos - 1])) {
          add("K");
          pos++;
        } else if (pos === 0) {
          if (token[pos + 2] === "I") {
            add("J");
          } else {
            add("K");
          }
          pos++;
        } else if (
          pos > 1 &&
          (["B", "H", "D"].indexOf(token[pos - 2]) > -1 ||
            ["B", "H", "D"].indexOf(token[pos - 3]) > -1 ||
            ["B", "H"].indexOf(token[pos - 4]) > -1)
        ) {
          pos++;
        } else {
          if (
            pos > 2 &&
            token[pos - 1] === "U" &&
            ["C", "G", "L", "R", "T"].indexOf(token[pos - 3]) > -1
          ) {
            add("F");
          } else if (token[pos - 1] !== "I") {
            add("K");
          }

          pos++;
        }
      } else if (token[pos + 1] === "N") {
        if (pos === 1 && startsWithVowel && !slavoGermanic) {
          addSecondary("KN", "N");
        } else {
          if (
            token.substring(pos + 2, pos + 4) !== "EY" &&
            token[pos + 1] !== "Y" &&
            !slavoGermanic
          ) {
            addSecondary("N", "KN");
          } else {
            add("KN");
          }
        }
        pos++;
      } else if (
        token.substring(pos + 1, pos + 3) === "LI" &&
        !slavoGermanic
      ) {
        addSecondary("KL", "L");
        pos++;
      } else if (
        pos === 0 &&
        (token[pos + 1] === "Y" ||
          subMatch(1, 3, [
            "ES",
            "EP",
            "EB",
            "EL",
            "EY",
            "IB",
            "IL",
            "IN",
            "IE",
            "EI",
            "ER"
          ]))
      ) {
        addSecondary("K", "J");
      } else {
        addCompressedDouble("G", "K");
      }
    }

    function handleH(): void {
      if (
        (pos === 0 || isDoubleMetaphoneVowel(token[pos - 1])) &&
        isDoubleMetaphoneVowel(token[pos + 1])
      ) {
        add("H");
        pos++;
      }
    }

    function handleJ(): void {
      const jose = token.substring(pos + 1, pos + 4) === "OSE";

      if (san || jose) {
        if ((pos === 0 && token[pos + 4] === " ") || san) {
          add("H");
        } else {
          // natural calls `add('J', 'H')`; `add` ignores the 2nd argument.
          add("J");
        }
      } else {
        if (pos === 0) {
          addSecondary("J", "A");
        } else if (
          isDoubleMetaphoneVowel(token[pos - 1]) &&
          !slavoGermanic &&
          (token[pos + 1] === "A" || token[pos + 1] === "O")
        ) {
          addSecondary("J", "H");
        } else if (pos === token.length - 1) {
          addSecondary("J", " ");
        } else {
          addCompressedDouble("J");
        }
      }
    }

    function handleL(): void {
      if (token[pos + 1] === "L") {
        if (
          pos === token.length - 3 &&
          (subMatch(-1, 3, ["ILLO", "ILLA", "ALLE"]) ||
            (token.substring(pos - 1, pos + 3) === "ALLE" &&
              // Preserve natural's `> -1` on a boolean (intentional quirk).
              ((subMatch(-2, -1, ["AS", "OS"]) as unknown as number) > -1 ||
                ["A", "O"].indexOf(token[token.length - 1]) > -1)))
        ) {
          addSecondary("L", "");
          pos++;
          return;
        }
        pos++;
      }
      add("L");
    }

    function handleM(): void {
      addCompressedDouble("M");
      if (
        token[pos - 1] === "U" &&
        token[pos + 1] === "B" &&
        (pos === token.length - 2 ||
          token.substring(pos + 2, pos + 4) === "ER")
      ) {
        pos++;
      }
    }

    function handleP(): void {
      if (token[pos + 1] === "H") {
        add("F");
        pos++;
      } else {
        addCompressedDouble("P");
        if (token[pos + 1] === "B") {
          pos++;
        }
      }
    }

    function handleR(): void {
      if (
        pos === token.length - 1 &&
        !slavoGermanic &&
        token.substring(pos - 2, pos) === "IE" &&
        !subMatch(-4, -3, ["ME", "MA"])
      ) {
        addSecondary("", "R");
      } else {
        addCompressedDouble("R");
      }
    }

    function handleS(): void {
      if (pos === 0 && token.substring(0, 5) === "SUGAR") {
        addSecondary("X", "S");
      } else if (token[pos + 1] === "H") {
        if (subMatch(2, 5, ["EIM", "OEK", "OLM", "OLZ"])) {
          add("S");
        } else {
          add("X");
        }
        pos++;
      } else if (subMatch(1, 3, ["IO", "IA"])) {
        if (slavoGermanic) {
          add("S");
        } else {
          addSecondary("S", "X");
        }
        pos++;
      } else if (
        (pos === 0 && ["M", "N", "L", "W"].indexOf(token[pos + 1]) > -1) ||
        token[pos + 1] === "Z"
      ) {
        addSecondary("S", "X");
        if (token[pos + 1] === "Z") {
          pos++;
        }
      } else if (token.substring(pos, pos + 2) === "SC") {
        if (token[pos + 2] === "H") {
          if (subMatch(3, 5, ["ER", "EN"])) {
            addSecondary("X", "SK");
          } else if (subMatch(3, 5, ["OO", "UY", "ED", "EM"])) {
            add("SK");
          } else if (
            pos === 0 &&
            !isDoubleMetaphoneVowel(token[3]) &&
            token[3] !== "W"
          ) {
            addSecondary("X", "S");
          } else {
            add("X");
          }
        } else if (["I", "E", "Y"].indexOf(token[pos + 2]) > -1) {
          add("S");
        } else {
          add("SK");
        }

        pos += 2;
      } else if (
        pos === token.length - 1 &&
        subMatch(-2, 0, ["AI", "OI"])
      ) {
        addSecondary("", "S");
      } else if (
        token[pos + 1] !== "L" &&
        token[pos - 1] !== "A" &&
        token[pos - 1] !== "I"
      ) {
        addCompressedDouble("S");
        if (token[pos + 1] === "Z") {
          pos++;
        }
      }
    }

    function handleT(): void {
      if (token.substring(pos + 1, pos + 4) === "ION") {
        add("XN");
        pos += 3;
      } else if (subMatch(1, 3, ["IA", "CH"])) {
        add("X");
        pos += 2;
      } else if (
        token[pos + 1] === "H" ||
        token.substring(1, 2) === "TH"
      ) {
        if (
          subMatch(2, 4, ["OM", "AM"]) ||
          ["VAN ", "VON "].indexOf(token.substring(0, 4)) > -1 ||
          token.substring(0, 3) === "SCH"
        ) {
          add("T");
        } else {
          addSecondary("0", "T");
        }
        pos++;
      } else {
        addCompressedDouble("T");
        if (token[pos + 1] === "D") {
          pos++;
        }
      }
    }

    function handleX(): void {
      if (pos === 0) {
        add("S");
      } else if (
        !(
          pos === token.length - 1 &&
          (["IAU", "EAU", "IEU"].indexOf(token.substring(pos - 3, pos)) > -1 ||
            ["AU", "OU"].indexOf(token.substring(pos - 2, pos)) > -1)
        )
      ) {
        add("KS");
      }
    }

    function handleW(): void {
      if (pos === 0) {
        if (token[1] === "H") {
          add("A");
        } else if (isDoubleMetaphoneVowel(token[1])) {
          addSecondary("A", "F");
        }
      } else if (
        subMatch(-1, 4, ["EWSKI", "EWSKY", "OWSKI", "OWSKY"]) ||
        token.substring(0, 3) === "SCH" ||
        (pos === token.length - 1 && isDoubleMetaphoneVowel(token[pos - 1]))
      ) {
        addSecondary("", "F");
        pos++;
      } else if (
        ["ICZ", "ITZ"].indexOf(token.substring(pos + 1, pos + 4)) > -1
      ) {
        addSecondary("TS", "FX");
        pos += 3;
      }
    }

    function handleZ(): void {
      if (token[pos + 1] === "H") {
        add("J");
        pos++;
      } else if (
        subMatch(1, 3, ["ZO", "ZI", "ZA"]) ||
        (slavoGermanic && pos > 0 && token[pos - 1] !== "T")
      ) {
        addSecondary("S", "TS");
        pos++;
      } else {
        addCompressedDouble("Z", "S");
      }
    }
  }
}
