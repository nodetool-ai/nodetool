/**
 * Word-form tolerant text search for short catalogs such as the example
 * galleries. Every word of the query must appear in the text. A word's common
 * English endings are dropped first, so "compare" finds "comparison" and
 * "photos" finds "photo". UX research study 12: three of three participants
 * searched the workflow examples for "compare" and missed the one tagged
 * "comparison".
 */

const ENDINGS = ["ing", "ed", "es", "e", "s"] as const;
const MIN_STEM_LENGTH = 4;

/** The query word with one common ending removed, when enough remains. */
export const searchStem = (word: string): string => {
  for (const ending of ENDINGS) {
    if (
      word.endsWith(ending) &&
      word.length - ending.length >= MIN_STEM_LENGTH
    ) {
      return word.slice(0, -ending.length);
    }
  }
  return word;
};

/** Whether every word of `query` appears in `text`, ignoring case. */
export const matchesSearch = (text: string, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = text.toLowerCase();
  return words.every((word) => haystack.includes(searchStem(word)));
};
