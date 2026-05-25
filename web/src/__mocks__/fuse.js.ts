interface FuseOptions {
  keys?: (string | { name: string; weight?: number })[];
  threshold?: number;
  distance?: number;
  includeMatches?: boolean;
  includeScore?: boolean;
  minMatchCharLength?: number;
  shouldSort?: boolean;
}

interface FuseMatch {
  indices: [number, number][];
  value: string;
  key: string;
  refIndex: number;
}

interface FuseResult<T> {
  item: T;
  score: number;
  matches: FuseMatch[];
}

export default class Fuse<T extends Record<string, unknown> = Record<string, unknown>> {
  private list: T[];
  private options: FuseOptions | undefined;

  constructor(list: T[], options?: FuseOptions) {
    this.list = list;
    this.options = options;
  }

  search(term: string): FuseResult<T>[] {
    const lowerTerm = term.toLowerCase();
    const results = this.list.filter((item) => {
      const keys = this.options?.keys || ['title', 'namespace', 'description', 'tags', 'searchText'];

      const searchableText = keys.map((key: string | {name: string}) => {
        const keyName = typeof key === 'string' ? key : key.name;
        const value = item[keyName];
        if (Array.isArray(value)) {
          return value.join(" ");
        }
        return String(value || '');
      }).join(" ").toLowerCase();

      const searchWords = lowerTerm.split(/\s+/).filter(word => word.length > 0);
      return searchWords.every(word => searchableText.includes(word));
    });

    return results.map((item, index) => {
      const matches: FuseMatch[] = [];
      const keys = this.options?.keys || ['title', 'name', 'namespace', 'description', 'tags', 'searchText'];
      const searchWords = lowerTerm.split(/\s+/).filter(word => word.length > 0);

      keys.forEach((key: string | {name: string, weight?: number}) => {
        const keyName = typeof key === 'string' ? key : key.name;
        const value = String(item[keyName] || '');
        const lowerValue = value.toLowerCase();

        const hasMatch = searchWords.some(word => lowerValue.includes(word));
        if (hasMatch) {
          matches.push({
            indices: [[0, Math.min(value.length - 1, 10)]],
            value: value,
            key: keyName,
            refIndex: index
          });
        }
      });

      return {
        item: item,
        score: Math.min(0.3, index * 0.1),
        matches: matches
      };
    });
  }
}