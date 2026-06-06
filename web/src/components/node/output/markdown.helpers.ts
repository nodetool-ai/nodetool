export const isLikelyMarkdown = (text: string): boolean => {
  if (!text) {return false;}
  if (text.length < 6) {return false;}
  const patterns = [
    /(^|\n)\s{0,3}#{1,6}\s+\S/,
    /(^|\n)```/,
    /(^|\n)\s{0,3}[-*+]\s+\S/,
    /(^|\n)\s{0,3}\d+\.\s+\S/,
    /\[[^\]]+\]\([^)]+\)/,
    /!\[[^\]]*\]\([^)]+\)/,
    /(^|\n)\s{0,3}>\s+\S/,
    /(^|\n)\|[^\n]*\|/,
    /`[^`]+`/,
    /(^|\n)\s*([-*_]\s*){3,}\s*(\n|$)/,
    /\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_/
  ];
  return patterns.some((re) => re.test(text));
};
