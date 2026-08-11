// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function sentimentAnalysis(inputs) {
  return createNode("lib.nlp.SentimentAnalysis", inputs, { outputNames: ["score", "comparative", "positive_words", "negative_words"] });
}
function tokenize(inputs) {
  return createNode("lib.nlp.Tokenize", inputs, { outputNames: ["output", "count"] });
}
function stem(inputs) {
  return createNode("lib.nlp.Stem", inputs, { outputNames: ["output", "tokens"] });
}
function tfIdf(inputs) {
  return createNode("lib.nlp.TfIdf", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function classifyText(inputs) {
  return createNode("lib.nlp.ClassifyText", inputs, { outputNames: ["output", "classifications"] });
}
function extractEntities(inputs) {
  return createNode("lib.nlp.ExtractEntities", inputs, { outputNames: ["people", "places", "organizations", "numbers", "nouns", "verbs"] });
}
function phoneticMatch(inputs) {
  return createNode("lib.nlp.PhoneticMatch", inputs, { outputNames: ["output", "tokens"] });
}
export {
  classifyText,
  extractEntities,
  phoneticMatch,
  sentimentAnalysis,
  stem,
  tfIdf,
  tokenize
};
