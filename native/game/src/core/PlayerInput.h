#pragma once
#include "document/Schema.h"
namespace nodetool::game {
/** Player and editor keyboard actions use the same dimensional movement contract. */
inline Json movementInput(const Json &actions, const std::string &dimension) {
  const auto pressed = [&](const char *key) { return actions.value(key, false); };
  Json result = {{"actions", actions}, {"jump", pressed("jump")}};
  const auto horizontal = int(pressed("right")) - int(pressed("left"));
  if (dimension == "2d") {
    result["move"] = {{"x", horizontal}, {"y", int(pressed("forward")) - int(pressed("backward"))}};
  } else {
    result["move"] = {horizontal, 0, int(pressed("backward")) - int(pressed("forward"))};
  }
  return result;
}
} // namespace nodetool::game
