export default class Fuse {
  private list: any[];
  private options: any;

  constructor(list: any[], options?: any) {
    this.list = list;
    this.options = options;
  }

  search(term: string) {
    // Simple mock search - returns items that contain the search term
    const results = this.list.filter((item: any) => {
      const searchableText = [
        item.title,
        item.namespace,
        item.description,
        item.tags,
        ...(item.use_cases || [])
      ].join(" ").toLowerCase();
      return searchableText.includes(term.toLowerCase());
    });
    
    return results.map((item: any, index: number) => ({
      item: item,
      score: index * 0.1,
      matches: []
    }));
  }
}