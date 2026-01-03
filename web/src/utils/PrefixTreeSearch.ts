/**
 * PrefixTreeSearch - Optimized search using Trie data structure
 * 
 * This module provides a fast prefix-based search implementation using a Trie (prefix tree).
 * It dramatically reduces search time from O(n*m) to O(m) where m is the search term length.
 * 
 * Key features:
 * - O(m) search complexity for prefix matches
 * - Case-insensitive search
 * - Multi-field indexing (title, namespace, description)
 * - Scoring system for result ranking
 * - Memory-efficient storage
 */

import { NodeMetadata } from "../stores/ApiTypes";

/**
 * A single node in the Trie data structure
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  // Store node references and their search scores at this position
  nodeRefs: Map<string, { node: NodeMetadata; score: number }> = new Map();
  isEndOfWord: boolean = false;
}

/**
 * Search field configuration
 */
export interface SearchField {
  field: "title" | "namespace" | "description" | "tags";
  weight: number; // Higher weight = better score
}

/**
 * Search options
 */
export interface PrefixSearchOptions {
  maxResults?: number;
  minScore?: number;
  fields?: ("title" | "namespace" | "description" | "tags")[];
}

/**
 * Search result with scoring information
 */
export interface PrefixSearchResult {
  node: NodeMetadata;
  score: number;
  matchedField: string;
  matchType: "prefix" | "exact" | "contains";
}

/**
 * Default search fields with weights
 */
const DEFAULT_SEARCH_FIELDS: SearchField[] = [
  { field: "title", weight: 1.0 },
  { field: "namespace", weight: 0.8 },
  { field: "tags", weight: 0.6 },
  { field: "description", weight: 0.4 },
];

/**
 * PrefixTreeSearch - Fast prefix-based search using Trie data structure
 */
export class PrefixTreeSearch {
  private roots: Map<string, TrieNode> = new Map();
  private fields: SearchField[];
  private nodeCount: number = 0;

  constructor(fields?: SearchField[]) {
    this.fields = fields || DEFAULT_SEARCH_FIELDS;
    // Initialize a root for each field
    this.fields.forEach((field) => {
      this.roots.set(field.field, new TrieNode());
    });
  }

  /**
   * Get statistics about the indexed data
   */
  getStats(): { nodeCount: number; fields: string[] } {
    return {
      nodeCount: this.nodeCount,
      fields: Array.from(this.roots.keys()),
    };
  }

  /**
   * Index a collection of nodes for fast searching
   */
  indexNodes(nodes: NodeMetadata[]): void {
    this.clear();
    this.nodeCount = nodes.length;

    nodes.forEach((node) => {
      this.fields.forEach((fieldConfig) => {
        const root = this.roots.get(fieldConfig.field);
        if (!root) return;

        const values = this.getFieldValues(node, fieldConfig.field);
        values.forEach((value) => {
          if (!value) return;
          this.insertWord(
            root,
            value,
            node,
            fieldConfig.weight,
            fieldConfig.field
          );
        });
      });
    });
  }

  /**
   * Extract searchable values from a node field
   */
  private getFieldValues(
    node: NodeMetadata,
    field: "title" | "namespace" | "description" | "tags"
  ): string[] {
    switch (field) {
      case "title":
        return [node.title];
      case "namespace":
        // Index both full namespace and individual parts
        const parts = node.namespace.split(".");
        return [node.namespace, ...parts];
      case "description":
        // Split description into words for indexing
        return node.description
          ? node.description
              .toLowerCase()
              .split(/\s+/)
              .filter((word) => word.length > 2)
          : [];
      case "tags":
        // Note: tags would need to be extracted from description if available
        return [];
      default:
        return [];
    }
  }

  /**
   * Insert a word into the Trie with associated node reference
   */
  private insertWord(
    root: TrieNode,
    word: string,
    node: NodeMetadata,
    weight: number,
    field: string
  ): void {
    const normalized = word.toLowerCase().trim();
    if (!normalized) return;

    let current = root;

    // Insert each character
    for (const char of normalized) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char)!;

      // Store node reference at each position with a position-based score
      const nodeKey = node.node_type;
      const existing = current.nodeRefs.get(nodeKey);
      if (!existing || existing.score < weight) {
        current.nodeRefs.set(nodeKey, { node, score: weight });
      }
    }

    current.isEndOfWord = true;
  }

  /**
   * Search for nodes matching a prefix
   */
  search(
    query: string,
    options: PrefixSearchOptions = {}
  ): PrefixSearchResult[] {
    const {
      maxResults = 100,
      minScore = 0.1,
      fields = this.fields.map((f) => f.field),
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalized = query.toLowerCase().trim();
    const results = new Map<string, PrefixSearchResult>();

    // Search in each specified field
    fields.forEach((field) => {
      const root = this.roots.get(field);
      if (!root) return;

      // Find the node in the trie corresponding to the query prefix
      let current: TrieNode | null = root;
      for (const char of normalized) {
        if (!current.children.has(char)) {
          current = null;
          break;
        }
        current = current.children.get(char)!;
      }

      // If prefix found, collect all nodes under this prefix
      if (current) {
        this.collectNodes(
          current,
          normalized,
          field,
          results,
          minScore,
          maxResults
        );
      }
    });

    // Convert to array and sort by score (descending)
    const sortedResults = Array.from(results.values()).sort(
      (a, b) => b.score - a.score
    );

    return sortedResults.slice(0, maxResults);
  }

  /**
   * Collect all nodes under a given trie node
   */
  private collectNodes(
    node: TrieNode,
    prefix: string,
    field: string,
    results: Map<string, PrefixSearchResult>,
    minScore: number,
    maxResults: number
  ): void {
    if (results.size >= maxResults) return;

    // Add nodes at current position
    node.nodeRefs.forEach((ref, nodeKey) => {
      if (ref.score < minScore) return;

      const existing = results.get(nodeKey);
      if (!existing || existing.score < ref.score) {
        // Determine match type: exact if this is end of indexed word and matches query length
        // Otherwise it's a prefix match
        const matchType = node.isEndOfWord && 
          ref.node.title.toLowerCase() === prefix ? "exact" : "prefix";
        
        results.set(nodeKey, {
          node: ref.node,
          score: ref.score,
          matchedField: field,
          matchType: matchType,
        });
      }
    });

    // Recursively collect from children
    node.children.forEach((child) => {
      if (results.size < maxResults) {
        this.collectNodes(
          child,
          prefix,
          field,
          results,
          minScore,
          maxResults
        );
      }
    });
  }

  /**
   * Perform a fuzzy search (contains substring anywhere)
   * This is slower but more flexible than prefix search
   */
  fuzzySearch(
    query: string,
    options: PrefixSearchOptions = {}
  ): PrefixSearchResult[] {
    const { maxResults = 100, minScore = 0.1 } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalized = query.toLowerCase().trim();
    const results: PrefixSearchResult[] = [];
    const seen = new Set<string>();

    // Search through all indexed nodes
    this.roots.forEach((root, field) => {
      this.fuzzyCollectNodes(
        root,
        normalized,
        field,
        "",
        results,
        seen,
        minScore,
        maxResults
      );
    });

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults);
  }

  /**
   * Recursively collect nodes for fuzzy search
   */
  private fuzzyCollectNodes(
    node: TrieNode,
    query: string,
    field: string,
    currentWord: string,
    results: PrefixSearchResult[],
    seen: Set<string>,
    minScore: number,
    maxResults: number
  ): void {
    if (results.length >= maxResults) return;

    // Check if current word contains the query
    if (currentWord.length >= query.length && currentWord.includes(query)) {
      node.nodeRefs.forEach((ref, nodeKey) => {
        if (seen.has(nodeKey)) return;
        if (ref.score < minScore) return;

        // Bonus score if query is at the start
        const bonus = currentWord.startsWith(query) ? 0.2 : 0;
        results.push({
          node: ref.node,
          score: ref.score + bonus,
          matchedField: field,
          matchType: "contains",
        });
        seen.add(nodeKey);
      });
    }

    // Recurse to children
    node.children.forEach((child, char) => {
      if (results.length < maxResults) {
        this.fuzzyCollectNodes(
          child,
          query,
          field,
          currentWord + char,
          results,
          seen,
          minScore,
          maxResults
        );
      }
    });
  }

  /**
   * Clear all indexed data
   */
  clear(): void {
    this.roots.forEach((root) => {
      this.clearNode(root);
    });
    this.nodeCount = 0;
  }

  /**
   * Recursively clear a trie node
   */
  private clearNode(node: TrieNode): void {
    node.nodeRefs.clear();
    node.children.forEach((child) => this.clearNode(child));
    node.children.clear();
  }
}
