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
      
      // Handle multi-word searches - all words must be found
      const searchWords = lowerTerm.split(/\s+/).filter(word => word.length > 0);
      return searchWords.every(word => searchableText.includes(word));
    });
    
    return results.map((item: any, index: number) => {
      // Generate matches based on which fields matched the search term
      const matches: any[] = [];
      const keys = this.options?.keys || ['title', 'name', 'namespace', 'description', 'tags', 'searchText'];
      const searchWords = lowerTerm.split(/\s+/).filter(word => word.length > 0);
      
      keys.forEach((key: string | {name: string, weight?: number}) => {
        const keyName = typeof key === 'string' ? key : key.name;
        const value = String(item[keyName] || '');
        const lowerValue = value.toLowerCase();
        
        // Check if any search words are found in this field
        const hasMatch = searchWords.some(word => lowerValue.includes(word));
        if (hasMatch) {
          matches.push({
            indices: [[0, Math.min(value.length - 1, 10)]], // Mock indices
            value: value,
            key: keyName,
            refIndex: index
          });
        }
      });

      return {
        item: item,
        score: Math.min(0.3, index * 0.1), // Return scores less than 1 for matches
        matches: matches
      };
    });
  }
}