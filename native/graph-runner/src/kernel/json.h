// JSON values in the kernel. ordered_json keeps insertion order, as
// JavaScript objects do for string keys, so serialized messages match the
// TypeScript runner's key order.
#pragma once

#include <nlohmann/json.hpp>

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace gr {

using Json = nlohmann::ordered_json;

// Correlation lineage: iteration root id -> token index.
using Lineage = std::map<std::string, long long>;
// Ordered chain of iteration root ids, outermost first.
using Scope = std::vector<std::string>;

inline Json lineageToJson(const Lineage& l) {
  Json out = Json::object();
  for (const auto& [root, index] : l) out[root] = {{"index", index}};
  return out;
}

inline Lineage lineageFromJson(const Json& j) {
  Lineage out;
  if (!j.is_object()) return out;
  for (const auto& [root, tok] : j.items()) {
    if (tok.is_object() && tok.contains("index") && tok["index"].is_number()) {
      out[root] = tok["index"].get<long long>();
    }
  }
  return out;
}

// Mirrors `tryProjectLineageKey`: canonical `root=index` pairs in scope
// order, or nullopt when a root is missing.
inline std::optional<std::string> tryProjectLineageKey(const Lineage& l,
                                                       const Scope& scope) {
  std::string key;
  for (size_t i = 0; i < scope.size(); ++i) {
    auto it = l.find(scope[i]);
    if (it == l.end()) return std::nullopt;
    if (i) key += ",";
    key += scope[i] + "=" + std::to_string(it->second);
  }
  return key;
}

// Mirrors `projectLineageKey`: "" when a root is missing.
inline std::string projectLineageKey(const Lineage& l, const Scope& scope) {
  return tryProjectLineageKey(l, scope).value_or("");
}

}  // namespace gr
