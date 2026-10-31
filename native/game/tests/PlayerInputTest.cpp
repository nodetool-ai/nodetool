#include "player/PlayerInput.h"
#include "core/PlayerInput.h"
#include <array>
#include <iostream>
#include <thread>
using namespace nodetool::game;
using namespace nodetool::game::player;
namespace {
void require(bool value, const char *message) {
  if (!value) { throw std::runtime_error(message); }
}
bool action(const Json &packet, const char *name) {
  return packet.at("actions").value(name, false);
}
void quickTap(const std::vector<std::string> &aliases) {
  InputState state;
  state.recording = true;
  setPhysicalActions(state, aliases, true);
  setPhysicalActions(state, aliases, false);
  const auto first = consumeInput(state), second = consumeInput(state);
  for (const auto &name : aliases) {
    require(first.at("actions").at(name) == true, "Physical tap disappeared before consumption");
    require(second.at("actions").at(name) == false, "Physical tap repeated after consumption");
    require(state.actions.at(name) == false && !state.heldActions.contains(name), "Pulse changed physical held state");
  }
  require(Json(state.recorded) == Json::array({first, second}), "Recording differs from consumed packets");
  require(first.size() == 1 && first.contains("actions"), "Action packet shape changed");
}
void quickStart() { quickTap({"start"}); }
void quickJump() { quickTap({"jump"}); }
void quickMovementAliases() { quickTap({"forward", "accelerate"}); }
void heldAndReleased() {
  InputState state;
  setPhysicalActions(state, {"jump"}, true);
  require(action(consumeInput(state), "jump"), "Initial physical press missing");
  require(action(consumeInput(state), "jump"), "Held action was not retained");
  setPhysicalActions(state, {"jump"}, true);
  setPhysicalActions(state, {"jump"}, false);
  require(!action(consumeInput(state), "jump"), "Repeated press while held created a new release pulse");
  require(!action(consumeInput(state), "jump"), "Physical release was not retained");
}
void straddledTapAndMovement() {
  InputState state;
  setPhysicalActions(state, {"forward", "accelerate"}, true);
  const auto pressed = consumeInput(state);
  require(action(pressed, "forward") && action(pressed, "accelerate"), "Aliases were not pressed together");
  setPhysicalActions(state, {"forward", "accelerate"}, false);
  const auto released = consumeInput(state);
  require(!action(released, "forward") && !action(released, "accelerate"), "Movement aliases did not release together");
  require(movementInput(released.at("actions"), "2d").at("move").at("y") == 0, "2D movement remained held");
  require(movementInput(released.at("actions"), "3d").at("move")[2] == 0, "3D movement remained held");
}
void hudLookAndRecording() {
  InputState state;
  state.recording = true; state.lookEnabled = true;
  setActionValues(state, {{"start", true}});
  addLook(state, {{"x", 2}, {"y", -3}});
  addLook(state, {{"x", 5}, {"y", 1}});
  const auto first = consumeInput(state), second = consumeInput(state);
  require(action(first, "start") && !action(second, "start"), "HUD pulse changed");
  require(first.at("look") == Json{{"x", 7.0}, {"y", -2.0}}, "Look deltas did not accumulate");
  require(second.at("look") == Json{{"x", 0.0}, {"y", 0.0}}, "Look deltas repeated");
  require(first.size() == 2 && Json(state.recorded) == Json::array({first, second}), "Look/recording packet changed");
}
void pausedTapsAreNotQueued() {
  InputState state;
  togglePause(state);
  require(state.paused.load() && state.actions.empty(), "Host pause became a gameplay action");
  setPhysicalActions(state, {"start"}, true);
  setPhysicalActions(state, {"start"}, false);
  togglePause(state);
  require(!state.paused.load() && !action(consumeInput(state), "start"), "Paused tap was queued across resume");
  setPhysicalActions(state, {"start"}, true);
  togglePause(state);
  setPhysicalActions(state, {"start"}, false);
  togglePause(state);
  require(!action(consumeInput(state), "start"), "Pause did not cancel an unstaged press");
}
void hostPausePreservesHeldAndLookState() {
  InputState state;
  state.lookEnabled = true;
  setPhysicalActions(state, {"forward"}, true);
  addLook(state, {{"x", 3}, {"y", 4}});
  togglePause(state);
  addLook(state, {{"x", 90}, {"y", 80}});
  require(state.actions.at("forward") == true && state.heldActions.contains("forward"), "Host pause changed current held state");
  togglePause(state);
  const auto resumed = consumeInput(state);
  require(action(resumed, "forward") && resumed.at("look") == Json{{"x", 3.0}, {"y", 4.0}}, "Host pause changed held/look behavior");
  setPhysicalActions(state, {"forward"}, false);
  require(!action(consumeInput(state), "forward"), "Movement did not release after host resume");
}
void recordingBudgetRetained() {
  InputState state;
  state.recording = true;
  state.recorded.resize(1'000'000);
  bool rejected = false;
  try { consumeInput(state); } catch (const Error &error) { rejected = error.code == "resource_limit"; }
  require(rejected && state.recorded.size() == 1'000'000, "Recording frame cap changed");
}
void aliasBatchIsAtomic() {
  InputState state;
  setPhysicalActions(state, {"forward", "accelerate"}, false);
  std::atomic<bool> finished = false;
  std::jthread producer([&] {
    for (int i = 0; i < 1000; ++i) {
      setPhysicalActions(state, {"forward", "accelerate"}, true);
      setPhysicalActions(state, {"forward", "accelerate"}, false);
    }
    finished = true;
  });
  bool consistent = true;
  do {
    const auto packet = consumeInput(state);
    consistent = consistent && action(packet, "forward") == action(packet, "accelerate");
  } while (!finished.load());
  producer.join();
  require(consistent, "Consumer observed a partial alias update");
}
}
int main() {
  const std::array cases{
      std::pair{"quick-start", &quickStart}, std::pair{"quick-jump", &quickJump},
      std::pair{"quick-movement-aliases", &quickMovementAliases},
      std::pair{"held-release-no-extra-edge", &heldAndReleased},
      std::pair{"straddled-movement-release", &straddledTapAndMovement},
      std::pair{"hud-look-recording", &hudLookAndRecording},
      std::pair{"paused-taps", &pausedTapsAreNotQueued},
      std::pair{"host-pause-held-look", &hostPausePreservesHeldAndLookState},
      std::pair{"recording-cap", &recordingBudgetRetained},
      std::pair{"atomic-alias-batch", &aliasBatchIsAtomic}};
  int failed = 0;
  for (const auto &[name, test] : cases) {
    try { test(); std::cout << "PASS " << name << '\n'; }
    catch (const std::exception &error) { ++failed; std::cerr << "FAIL " << name << ": " << error.what() << '\n'; }
  }
  std::cout << cases.size() - failed << " passed, " << failed << " failed\n";
  return failed ? 1 : 0;
}
