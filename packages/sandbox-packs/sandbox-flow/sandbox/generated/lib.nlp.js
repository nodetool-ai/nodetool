// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function sentimentAnalysis(inputs) {
  return callNode("lib.nlp.SentimentAnalysis", inputs);
}
function tokenize(inputs) {
  return callNode("lib.nlp.Tokenize", inputs);
}
function stem(inputs) {
  return callNode("lib.nlp.Stem", inputs);
}
function tfIdf(inputs) {
  return callNode("lib.nlp.TfIdf", inputs);
}
function classifyText(inputs) {
  return callNode("lib.nlp.ClassifyText", inputs);
}
function extractEntities(inputs) {
  return callNode("lib.nlp.ExtractEntities", inputs);
}
function phoneticMatch(inputs) {
  return callNode("lib.nlp.PhoneticMatch", inputs);
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
