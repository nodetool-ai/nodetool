// JSON values in the kernel. The ordered map keeps insertion order, as
// JavaScript objects do for string keys, so serialized messages match the
// TypeScript runner's key order. Bytes inside a value are a binary value
// that holds a Blob (kernel/blob.h). Json::dump() does not write them in
// the form a host reads: use dumpWire() of kernel/wire.h for any text that
// leaves the kernel.
#pragma once

#include "kernel/blob.h"

#include <nlohmann/json.hpp>

#include <cstdint>

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace gr {

// nlohmann::ordered_json with Blob as its binary type.
using Json = nlohmann::basic_json<nlohmann::ordered_map, std::vector, std::string, bool, std::int64_t,
                                  std::uint64_t, double, std::allocator, nlohmann::adl_serializer, Blob>;

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
