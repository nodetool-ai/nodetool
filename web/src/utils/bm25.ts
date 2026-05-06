import { NodeMetadata } from "../stores/ApiTypes";

/**
 * BM25F-style multi-field index.
 *
 * Score for term t in doc d:
 *   IDF(t) * Σ_field weight_f * tf_f(d,t)*(k1+1) / (tf_f(d,t) + k1*(1 - b + b*dl_f/avgdl_f))
 *
 * IDF uses the Lucene/BM25+ smoothed form:
 *   log( (N - df + 0.5) / (df + 0.5) + 1 )
 */

export interface BM25Field {
  name: string;
  weight: number;
}

export interface BM25Doc {
  id: string;
  fields: Record<string, string>;
}

export interface BM25Result {
  id: string;
  score: number;
}

interface FieldStats {
  avgLen: number;
  docLens: Map<string, number>;
}

const TOKEN_SPLIT = /[\s.,;:!?\-_/(){}\[\]"'`<>@#$%^&*+=|\\~]+/;

export function tokenize(text: string): string[] {
  if (!text || typeof text !== "string") return [];
  const out: string[] = [];
  for (const part of text.toLowerCase().split(TOKEN_SPLIT)) {
    if (part.length >= 2) out.push(part);
  }
  return out;
}

export class BM25Index {
  private readonly fields: BM25Field[];
  private readonly k1: number;
  private readonly b: number;
  private docCount = 0;
  // field -> stats (avg length + per-doc length)
  private fieldStats = new Map<string, FieldStats>();
  // term -> field -> docId -> tf
  private postings = new Map<string, Map<string, Map<string, number>>>();
  // term -> document frequency (number of docs containing the term in any field)
  private docFreq = new Map<string, number>();

  constructor(fields: BM25Field[], k1 = 1.5, b = 0.75) {
    this.fields = fields;
    this.k1 = k1;
    this.b = b;
  }

  index(docs: BM25Doc[]): void {
    this.docCount = docs.length;
    const fieldLenSums = new Map<string, number>();
    for (const f of this.fields) {
      this.fieldStats.set(f.name, { avgLen: 0, docLens: new Map() });
      fieldLenSums.set(f.name, 0);
    }

    for (const doc of docs) {
      const docTerms = new Set<string>();
      for (const f of this.fields) {
        const tokens = tokenize(doc.fields[f.name] ?? "");
        const stats = this.fieldStats.get(f.name)!;
        stats.docLens.set(doc.id, tokens.length);
        fieldLenSums.set(
          f.name,
          (fieldLenSums.get(f.name) ?? 0) + tokens.length
        );

        const tfMap = new Map<string, number>();
        for (const tok of tokens) tfMap.set(tok, (tfMap.get(tok) ?? 0) + 1);

        for (const [tok, tf] of tfMap) {
          let perField = this.postings.get(tok);
          if (!perField) {
            perField = new Map();
            this.postings.set(tok, perField);
          }
          let perDoc = perField.get(f.name);
          if (!perDoc) {
            perDoc = new Map();
            perField.set(f.name, perDoc);
          }
          perDoc.set(doc.id, tf);
          docTerms.add(tok);
        }
      }
      for (const tok of docTerms) {
        this.docFreq.set(tok, (this.docFreq.get(tok) ?? 0) + 1);
      }
    }

    for (const f of this.fields) {
      const stats = this.fieldStats.get(f.name)!;
      const sum = fieldLenSums.get(f.name) ?? 0;
      stats.avgLen = this.docCount > 0 ? sum / this.docCount : 0;
    }
  }

  /**
   * Score every doc for the given query terms. Terms are lowercased and
   * filtered to length >= 2; multi-word phrases should be tokenized first.
   */
  search(query: string, limit = 0): BM25Result[] {
    const terms = tokenize(query);
    if (terms.length === 0 || this.docCount === 0) return [];
    const scores = new Map<string, number>();

    for (const term of terms) {
      const df = this.docFreq.get(term);
      if (!df) continue;
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
      const perField = this.postings.get(term);
      if (!perField) continue;

      for (const f of this.fields) {
        const perDoc = perField.get(f.name);
        if (!perDoc) continue;
        const stats = this.fieldStats.get(f.name)!;
        const avgLen = stats.avgLen || 1;
        for (const [docId, tf] of perDoc) {
          const dl = stats.docLens.get(docId) ?? 0;
          const norm = 1 - this.b + this.b * (dl / avgLen);
          const tfScore = (tf * (this.k1 + 1)) / (tf + this.k1 * norm);
          scores.set(
            docId,
            (scores.get(docId) ?? 0) + idf * tfScore * f.weight
          );
        }
      }
    }

    const sorted: BM25Result[] = [];
    for (const [id, score] of scores) sorted.push({ id, score });
    sorted.sort((a, b) => b.score - a.score);
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  }
}

/**
 * Build a BM25 index over node metadata. Field weights are tuned to mirror
 * the existing prefix-tree weights: title is the strongest signal, then
 * namespace/tags, then description.
 */
export function buildNodeBM25Index(
  nodes: readonly NodeMetadata[],
  extraFields?: ReadonlyMap<string, { tags: string; useCases: string }>
): BM25Index {
  const index = new BM25Index([
    { name: "title", weight: 4.0 },
    { name: "node_type", weight: 2.5 },
    { name: "namespace", weight: 1.5 },
    { name: "tags", weight: 1.5 },
    { name: "description", weight: 0.8 },
    { name: "use_cases", weight: 0.6 }
  ]);

  const docs: BM25Doc[] = nodes.map((node) => {
    const extras = extraFields?.get(node.node_type);
    return {
      id: node.node_type,
      fields: {
        title: node.title ?? "",
        node_type: node.node_type ?? "",
        namespace: node.namespace ?? "",
        tags: extras?.tags ?? "",
        description: node.description ?? "",
        use_cases: extras?.useCases ?? ""
      }
    };
  });

  index.index(docs);
  return index;
}
