import { describe, it, expect } from "vitest";
import {
  SentimentAnalysisLibNode,
  TokenizeLibNode,
  StemLibNode,
  TfIdfLibNode,
  ClassifyTextLibNode,
  ExtractEntitiesLibNode,
  PhoneticMatchLibNode
} from "@nodetool-ai/text-nodes";

// ---------------------------------------------------------------------------
// NLP
// ---------------------------------------------------------------------------

describe("lib.nlp nodes", () => {
  it("SentimentAnalysisLibNode has correct metadata", () => {
    expect(SentimentAnalysisLibNode.nodeType).toBe("lib.nlp.SentimentAnalysis");
  });

  it("TokenizeLibNode has correct metadata", () => {
    expect(TokenizeLibNode.nodeType).toBe("lib.nlp.Tokenize");
  });

  it("StemLibNode has correct metadata", () => {
    expect(StemLibNode.nodeType).toBe("lib.nlp.Stem");
  });

  it("TfIdfLibNode has correct metadata", () => {
    expect(TfIdfLibNode.nodeType).toBe("lib.nlp.TfIdf");
  });

  it("ClassifyTextLibNode has correct metadata", () => {
    expect(ClassifyTextLibNode.nodeType).toBe("lib.nlp.ClassifyText");
  });

  it("ExtractEntitiesLibNode has correct metadata", () => {
    expect(ExtractEntitiesLibNode.nodeType).toBe("lib.nlp.ExtractEntities");
  });

  it("PhoneticMatchLibNode has correct metadata", () => {
    expect(PhoneticMatchLibNode.nodeType).toBe("lib.nlp.PhoneticMatch");
  });
});
