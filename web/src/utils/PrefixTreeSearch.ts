/**
 * Prefix-based node search backed by a Trie: O(m) prefix lookup (m = query
 * length) instead of scanning all nodes. Case-insensitive, multi-field
 * (title, namespace, description), weighted scoring.
 */

import { NodeMetadata } from "../stores/ApiTypes";

/** Common stop words to exclude from indexing individual words */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "in",
  "on",
  "of",
  "for",
  "and",
  "or",
  "by",
  "with",
  "from",
  "at",
  "as",
  "it",
  "be",
  "do",
  "no",
  "so",
  "if",
  "up",
  "to",
  "not",
  "but",
  "are",
  "was",
  "has",
  "its",
  "all",
  "into",
  "that",
  "this",
  "can",
  "will",
  "may"
]);

/**
 * A single node in the Trie data structure
 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  nodeRefs: Map<string, { node: NodeMetadata; score: number }> = new Map();
  isEndOfWord: boolean = false;
}

export interface SearchField {
  field: "title" | "namespace" | "description" | "tags";
  weight: number; // Higher weight = better score
}

interface PrefixSearchOptions {
  maxResults?: number;
  minScore?: number;
  fields?: ("title" | "namespace" | "description" | "tags")[];
}

interface PrefixSearchResult {
  node: NodeMetadata;
  score: number;
  matchedField: string;
  matchType: "prefix" | "exact" | "contains";
}

const DEFAULT_SEARCH_FIELDS: SearchField[] = [
  { field: "title", weight: 1.0 },
  { field: "namespace", weight: 0.8 },
  { field: "tags", weight: 0.6 },
  { field: "description", weight: 0.4 }
];

export class PrefixTreeSearch {
  private roots: Map<string, TrieNode> = new Map();
  private fields: SearchField[];
  private nodeCount: number = 0;

  constructor(fields?: SearchField[]) {
    this.fields = fields || DEFAULT_SEARCH_FIELDS;
    this.fields.forEach((field) => {
      this.roots.set(field.field, new TrieNode());
    });
  }

  getStats(): { nodeCount: number; fields: string[] } {
    return {
      nodeCount: this.nodeCount,
      fields: Array.from(this.roots.keys())
    };
  }

  indexNodes(nodes: NodeMetadata[]): void {
    this.clear();
    this.nodeCount = nodes.length;

    nodes.forEach((node) => {
      this.fields.forEach((fieldConfig) => {
        const root = this.roots.get(fieldConfig.field);
        if (!root) {
          return;
        }

        const values = this.getFieldValues(node, fieldConfig.field);
        values.forEach((value) => {
          if (!value) {
            return;
          }
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

  private getFieldValues(
    node: NodeMetadata,
    field: "title" | "namespace" | "description" | "tags"
  ): string[] {
    switch (field) {
      case "title": {
        const titleWords = node.title
          .split(/\s+/)
          .filter((w) => w.length > 0 && !STOP_WORDS.has(w.toLowerCase()));
        const noSpaces = node.title.replace(/\s+/g, "");
        return [node.title, noSpaces, ...titleWords];
      }
      case "namespace": {
        const parts = node.namespace.split(".");
        return [node.namespace, ...parts];
      }
      case "description":
        return node.description
          ? node.description
              .toLowerCase()
              .split(/\s+/)
              .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
          : [];
      case "tags":
        // tags would need to be extracted from description if available
        return [];
      default:
        return [];
    }
  }

  private insertWord(
    root: TrieNode,
    word: string,
    node: NodeMetadata,
    weight: number,
    _field: string
  ): void {
    const normalized = word.toLowerCase().trim();
    if (!normalized) {
      return;
    }

    let current = root;

    for (const char of normalized) {
      let child = current.children.get(char);
      if (!child) {
        child = new TrieNode();
        current.children.set(char, child);
      }
      current = child;

      const nodeKey = node.node_type;
      const existing = current.nodeRefs.get(nodeKey);
      if (!existing || existing.score < weight) {
        current.nodeRefs.set(nodeKey, { node, score: weight });
      }
    }

    current.isEndOfWord = true;
  }

  search(
    query: string,
    options: PrefixSearchOptions = {}
  ): PrefixSearchResult[] {
    const {
      maxResults = 100,
      minScore = 0.1,
      fields = this.fields.map((f) => f.field)
    } = options;

    if (!query || query.trim().length === 0) {
      return [];
    }

    const normalized = query.toLowerCase().trim();
    const results = new Map<string, PrefixSearchResult>();

    fields.forEach((field) => {
      const root = this.roots.get(field);
      if (!root) {
        return;
      }

      let current: TrieNode | null = root;
      for (const char of normalized) {
        const child: TrieNode | undefined = current.children.get(char);
        if (!child) {
          current = null;
          break;
        }
        current = child;
      }

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

    const sortedResults = Array.from(results.values()).sort(
      (a, b) => b.score - a.score
    );

    return sortedResults.slice(0, maxResults);
  }

  private collectNodes(
    node: TrieNode,
    prefix: string,
    field: string,
    results: Map<string, PrefixSearchResult>,
    minScore: number,
    maxResults: number
  ): void {
    if (results.size >= maxResults) {
      return;
    }

    node.nodeRefs.forEach((ref, nodeKey) => {
      if (ref.score < minScore) {
        return;
      }

      const existing = results.get(nodeKey);
      if (!existing || existing.score < ref.score) {
        const matchType =
          node.isEndOfWord && ref.node.title.toLowerCase() === prefix
            ? "exact"
            : "prefix";

        results.set(nodeKey, {
          node: ref.node,
          score: ref.score,
          matchedField: field,
          matchType: matchType
        });
      }
    });

    node.children.forEach((child) => {
      if (results.size < maxResults) {
        this.collectNodes(child, prefix, field, results, minScore, maxResults);
      }
    });
  }

  clear(): void {
    this.roots.forEach((root) => {
      this.clearNode(root);
    });
    this.nodeCount = 0;
  }

  private clearNode(node: TrieNode): void {
    node.nodeRefs.clear();
    node.children.forEach((child) => this.clearNode(child));
    node.children.clear();
  }
}
