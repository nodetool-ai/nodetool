#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include <vector>

namespace nodetool::game {
// Pose sampling retains all nodes for animation/skin dependencies. Submission
// alone is restricted to the selected glTF scene's root closure.
inline std::vector<bool> selectedModelNodes(const PreparedModel &model) {
  std::vector<bool> selected(model.nodes.size(), false);
  std::vector<int> pending(model.roots);
  while (!pending.empty()) {
    const auto index = pending.back();
    pending.pop_back();
    if (index < 0 || static_cast<std::size_t>(index) >= model.nodes.size()) {
      throw Error("asset", "Selected model scene references an invalid node");
    }
    if (selected[index]) {
      continue;
    }
    selected[index] = true;
    const auto &children = model.nodes[index].children;
    pending.insert(pending.end(), children.begin(), children.end());
  }
  return selected;
}
} // namespace nodetool::game
