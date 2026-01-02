/**
 * Browser tool: Bookmarks management.
 * Create, search, and manage browser bookmarks.
 */
import { BrowserToolRegistry } from "../browserTools";

interface SearchBookmarksArgs {
  query?: string;
  url?: string;
  title?: string;
}

interface CreateBookmarkArgs {
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
}

interface RemoveBookmarkArgs {
  id: string;
}

BrowserToolRegistry.register({
  name: "browser_search_bookmarks",
  description: "Search bookmarks by query, URL, or title.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to match against bookmark titles and URLs"
      },
      url: {
        type: "string",
        description: "Exact URL to match"
      },
      title: {
        type: "string",
        description: "Exact title to match"
      }
    },
    required: []
  },
  async execute(args: SearchBookmarksArgs) {
    // Build search query
    const searchQuery: string | chrome.bookmarks.BookmarkSearchQuery = {};
    
    if (args.query !== undefined) {
      // Simple string query
      const results = await chrome.bookmarks.search(args.query);
      return {
        count: results.length,
        bookmarks: results.map(b => ({
          id: b.id,
          title: b.title,
          url: b.url,
          parentId: b.parentId,
          dateAdded: b.dateAdded,
          index: b.index
        }))
      };
    }
    
    if (args.url !== undefined) {searchQuery.url = args.url;}
    if (args.title !== undefined) {searchQuery.title = args.title;}
    
    const results = await chrome.bookmarks.search(searchQuery);
    
    return {
      count: results.length,
      bookmarks: results.map(b => ({
        id: b.id,
        title: b.title,
        url: b.url,
        parentId: b.parentId,
        dateAdded: b.dateAdded,
        index: b.index
      }))
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_create_bookmark",
  description: "Create a new bookmark.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title of the bookmark"
      },
      url: {
        type: "string",
        description: "URL to bookmark (omit to create a folder)"
      },
      parentId: {
        type: "string",
        description: "ID of the parent folder (defaults to 'Other Bookmarks')"
      },
      index: {
        type: "number",
        description: "Position within the parent folder"
      }
    },
    required: ["title"]
  },
  async execute(args: CreateBookmarkArgs) {
    const createDetails: chrome.bookmarks.BookmarkCreateArg = {
      title: args.title
    };
    
    if (args.url !== undefined) {createDetails.url = args.url;}
    if (args.parentId !== undefined) {createDetails.parentId = args.parentId;}
    if (args.index !== undefined) {createDetails.index = args.index;}
    
    const bookmark = await chrome.bookmarks.create(createDetails);
    
    return {
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      parentId: bookmark.parentId,
      dateAdded: bookmark.dateAdded,
      index: bookmark.index
    };
  }
});

BrowserToolRegistry.register({
  name: "browser_remove_bookmark",
  description: "Remove a bookmark by its ID.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "ID of the bookmark to remove"
      }
    },
    required: ["id"]
  },
  async execute(args: RemoveBookmarkArgs) {
    await chrome.bookmarks.remove(args.id);
    
    return {
      removed: true,
      id: args.id
    };
  }
});
