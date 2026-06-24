/**
 * Lancaster (Paice/Husk) stemmer, ported verbatim from the `natural` package
 * (stemmers/lancaster_stemmer.js, MIT). The rule table lives in
 * ./data/lancaster-rules.ts (also vendored from natural).
 */

import { LANCASTER_RULES, type LancasterRule } from "./data/lancaster-rules.js";

function acceptable(candidate: string): boolean {
  if (candidate.match(/^[aeiou]/)) {
    return candidate.length > 1;
  }
  return candidate.length > 2 && /[aeiouy]/.test(candidate);
}

function applyRuleSection(token: string, intact: boolean): string {
  const section = token.substr(-1);
  const rules: LancasterRule[] | undefined = LANCASTER_RULES[section];

  if (rules) {
    for (let i = 0; i < rules.length; i++) {
      if (
        (intact || !rules[i].intact) &&
        token.substr(0 - rules[i].pattern.length) === rules[i].pattern
      ) {
        // `size` is stored as a string in natural's rule table; `Number()`
        // mirrors its implicit numeric coercion in `token.length - rule.size`.
        let result = token.substr(0, token.length - Number(rules[i].size));

        if (rules[i].appendage) {
          result += rules[i].appendage;
        }

        if (acceptable(result)) {
          token = result;

          if (rules[i].continuation) {
            return applyRuleSection(result, false);
          }
          return result;
        }
      }
    }
  }

  return token;
}

export const LancasterStemmer = {
  stem(token: string): string {
    return applyRuleSection(token.toLowerCase(), true);
  }
};
