#pragma once
#include "document/Schema.h"
#include <atomic>
#include <mutex>
#include <set>
#include <string>
#include <vector>

namespace nodetool::game::player {
struct InputState {
  std::mutex mutex;
  Json actions = Json::object();
  std::set<std::string> heldActions;
  std::set<std::string> pendingPhysicalPresses;
  std::vector<Json> recorded;
  bool recording = false;
  bool lookEnabled = false;
  double lookX = 0, lookY = 0;
  std::atomic<bool> paused = false;
};
inline Json consumeInput(InputState &state) {
  std::scoped_lock lock(state.mutex);
  Json result = {{"actions", state.actions}};
  // A physical tap can finish between ticks without changing current held state.
  for (const auto &action : state.pendingPhysicalPresses) {
    result["actions"][action] = true;
  }
  if (state.lookEnabled) {
    result["look"] = {{"x", state.lookX}, {"y", state.lookY}};
    state.lookX = 0;
    state.lookY = 0;
  }
  if (state.recording) {
    if (state.recorded.size() >= 1'000'000) {
      throw Error("resource_limit", "Input recording exceeds frame budget");
    }
    state.recorded.push_back(result);
  }
  state.pendingPhysicalPresses.clear();
  for (auto &[key, value] : state.actions.items()) {
    if (key != "left" && key != "right" && key != "forward" &&
        key != "backward" && !state.heldActions.contains(key)) {
      value = false;
    }
  }
  return result;
}
inline void setPhysicalActions(InputState &state,
                               const std::vector<std::string> &actions,
                               bool pressed) {
  std::scoped_lock lock(state.mutex);
  for (const auto &action : actions) {
    state.actions[action] = pressed;
    if (pressed) {
      const bool newlyHeld = state.heldActions.insert(action).second;
      if (newlyHeld && !state.paused.load()) {
        state.pendingPhysicalPresses.insert(action);
      }
    } else {
      state.heldActions.erase(action);
    }
  }
}
inline void togglePause(InputState &state) {
  std::scoped_lock lock(state.mutex);
  state.paused = !state.paused.load();
  if (state.paused.load()) {
    state.pendingPhysicalPresses.clear();
  }
}
inline void addLook(InputState &state, const Json &look) {
  if (!state.paused.load()) {
    std::scoped_lock lock(state.mutex);
    state.lookX += look.at("x").get<double>();
    state.lookY += look.at("y").get<double>();
  }
}
inline void setActionValues(InputState &state, const Json &actions) {
  std::scoped_lock lock(state.mutex);
  for (const auto &[key, value] : actions.items()) {
    state.actions[key] = value;
  }
}
} // namespace nodetool::game::player
