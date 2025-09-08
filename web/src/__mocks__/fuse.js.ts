export default class Fuse {
  private list: any[];
  private options: any;

  constructor(list: any[], options?: any) {
    this.list = list;
    this.options = options;
  }

  search(term: string) {
    const lowerTerm = term.toLowerCase();
    // Simple mock search - returns items that contain the search term
    const results = this.list.filter((item: any) => {
      // Get the search keys from options or default keys
      const keys = this.options?.keys || ['title', 'namespace', 'description', 'tags', 'searchText'];
      
      // Build searchable text from all specified keys
      const searchableText = keys.map((key: string | {name: string}) => {
        const keyName = typeof key === 'string' ? key : key.name;
        const value = item[keyName];
        if (Array.isArray(value)) {
          return value.join(" ");
        }
        return String(value || '');
      }).join(" ").toLowerCase();
      
      return searchableText.includes(lowerTerm);
    });
    
    return results.map((item: any, index: number) => ({
      item: item,
      score: Math.min(0.3, index * 0.1), // Return scores less than 1 for matches
      matches: []
    }));
  }
}