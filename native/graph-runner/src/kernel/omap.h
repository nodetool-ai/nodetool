// Insertion-ordered string-keyed map, with the iteration and overwrite
// semantics of a JavaScript Map: set() on an existing key keeps its position.
#pragma once

#include <iterator>
#include <list>
#include <string>
#include <unordered_map>
#include <utility>

namespace gr {

template <class V>
class OMap {
public:
  using Entry = std::pair<std::string, V>;

  OMap() = default;
  OMap(const OMap& other) {
    for (const auto& [k, v] : other.entries_) set(k, v);
  }
  OMap& operator=(const OMap& other) {
    if (this != &other) {
      clear();
      for (const auto& [k, v] : other.entries_) set(k, v);
    }
    return *this;
  }
  OMap(OMap&&) noexcept = default;
  OMap& operator=(OMap&&) noexcept = default;

  void clear() {
    entries_.clear();
    index_.clear();
  }

  V* find(const std::string& key) {
    auto it = index_.find(key);
    return it == index_.end() ? nullptr : &it->second->second;
  }
  const V* find(const std::string& key) const {
    auto it = index_.find(key);
    return it == index_.end() ? nullptr : &it->second->second;
  }
  bool has(const std::string& key) const { return index_.count(key) > 0; }

  V& set(const std::string& key, V value) {
    if (V* v = find(key)) {
      *v = std::move(value);
      return *v;
    }
    entries_.emplace_back(key, std::move(value));
    index_.emplace(key, std::prev(entries_.end()));
    return entries_.back().second;
  }

  // Inserts a default value when absent.
  V& at(const std::string& key) {
    if (V* v = find(key)) return *v;
    return set(key, V{});
  }

  void erase(const std::string& key) {
    auto it = index_.find(key);
    if (it == index_.end()) return;
    entries_.erase(it->second);
    index_.erase(it);
  }

  size_t size() const { return entries_.size(); }
  bool empty() const { return entries_.empty(); }
  auto begin() { return entries_.begin(); }
  auto end() { return entries_.end(); }
  auto begin() const { return entries_.begin(); }
  auto end() const { return entries_.end(); }

private:
  std::list<Entry> entries_;
  std::unordered_map<std::string, typename std::list<Entry>::iterator> index_;
};

}  // namespace gr
