#pragma once
#include "document/Schema.h"
#include <cctype>
namespace nodetool::game {
inline void validateSaveSlot(const Json &scope, const Json &slot) {
  if (!scope.is_string() || (scope != "progress" && scope != "settings") ||
      !slot.is_string() || slot.get_ref<const std::string &>().empty() || slot.get_ref<const std::string &>().size() > 32) {
    throw Error("validation_error", "Invalid JSON save scope or slot");
  }
  for (const auto c : slot.get_ref<const std::string &>()) {
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) {
      throw Error("validation_error", "Invalid JSON save slot");
    }
  }
}
inline void validateSaveData(const Json &data) {
  if (!data.is_object() || data.dump().size() > 16 * 1024) {
    throw Error("resource_limit", "JSON save data must be an object of at most 16384 bytes");
  }
  std::size_t keys = 0;
  const auto walk = [&](const auto &self, const Json &value, std::size_t depth) -> void {
    if (!value.is_structured()) { return; }
    if (depth > 16) { throw Error("resource_limit", "JSON save depth exceeds 16"); }
    for (auto i = value.begin(); i != value.end(); ++i) {
      if (value.is_object()) {
        if (++keys > 256 || i.key() == "__proto__" || i.key() == "constructor" || i.key() == "prototype") {
          throw Error("resource_limit", "JSON save contains forbidden keys or exceeds 256 keys");
        }
      }
      self(self, i.value(), depth + 1);
    }
  };
  walk(walk, data, 1);
}
inline void validateLoadedSaves(const Json &loaded) {
  if (!loaded.is_array() || loaded.size() > 2) { throw Error("resource_limit", "At most two loaded saves per input frame"); }
  for (const auto &value : loaded) {
    if (!value.is_object() || value.size() != 3 || !value.contains("scope") || !value.contains("slot") || !value.contains("data")) {
      throw Error("validation_error", "Invalid loaded JSON save");
    }
    validateSaveSlot(value.at("scope"), value.at("slot"));
    if (!value.at("data").is_null()) { validateSaveData(value.at("data")); }
  }
}
} // namespace nodetool::game
