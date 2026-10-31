#include "core/Session.h"
#include <algorithm>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool condition, const char* message) {
  if (!condition) { throw std::runtime_error(message); }
}
Json document() {
  auto entity = Json{{"id", "moving"}, {"body2d", {{"type", "kinematic"}, {"velocity", {{"x", 3}, {"y", 0}}}}}};
  return {{"engine", "native-cpp-1"}, {"schemaVersion", 5}, {"dimension", "2d"},
    {"id", "session2d"}, {"title", "2D"}, {"initialSceneId", "scene"},
    {"gravity", {{"x", 0}, {"y", 0}}},
    {"scenes", Json::array({Json{{"id", "scene"}, {"entities", Json::array({entity})}}})}};
}
void checkAuthoredOrder(bool twoDimensional) {
  const std::size_t offset = twoDimensional ? 128 : 0;
  const Json controller{{"id", "a"}, {"behaviors", Json::array({{{"id", "b"}, {"scriptId", "commands"}}})}};
  Json doc{{"engine", "native-cpp-1"}, {"schemaVersion", twoDimensional ? 5 : 4},
           {"dimension", twoDimensional ? "2d" : "3d"}, {"id", "order"}, {"title", "Order"},
           {"initialSceneId", "a"},
           {"prefabs", Json::array({{{"id", "pair"}, {"entities", Json::array({{{"id", "leafB"}}, {{"id", "leafA"}}})}}})},
           {"scripts", Json::array({{{"id", "commands"}, {"source", "i=>({commands:i.input.commands||[]})"}}})},
           {"scenes", Json::array({
             {{"id", "a"}, {"entities", Json::array({Json{{"id", "z"}, {"prefabId", "pair"}}, controller})}},
             {{"id", "b"}, {"entities", Json::array({{{"id", "b2"}}, {{"id", "b1"}}})}}
           })}};
  Session session(doc);
  const auto original = session.snapshot();
  const auto initial = session.frame();
  const Json expected{{"z", offset}, {"z:leafB", offset + 1}, {"z:leafA", offset + 2}, {"a", offset + 3}};
  require(initial.at("authoredOrder") == expected, "Authored prefab DFS order precedes simulation ID sorting");
  require(session.generation() == initial.at("generation"), "Scalar generation matches committed frame");
  auto step = [&](Json commands) { return session.step({{"commands", std::move(commands)}}); };
  auto spawned = step(Json::array({{{"kind", "spawn"}, {"entity", {{"id", "zRuntime"}}}}, {{"kind", "spawn"}, {"entity", {{"id", "aRuntime"}}}}, {{"kind", "despawn"}, {"entityId", "z:leafB"}}}));
  auto order = expected;
  order["aRuntime"] = offset + 4; order["zRuntime"] = offset + 5;
  require(spawned.at("authoredOrder") == order, "Authored despawn retains rank and current runtime IDs append in simulation order");
  auto replaced = step(Json::array({{{"kind", "despawn"}, {"entityId", "aRuntime"}}, {{"kind", "spawn"}, {"entity", {{"id", "mRuntime"}}}}}));
  order.erase("aRuntime"); order["mRuntime"] = offset + 4;
  require(replaced.at("authoredOrder") == order, "Runtime order compresses after despawn and reorders new IDs");
  auto removed = step(Json::array({{{"kind", "despawn"}, {"entityId", "zRuntime"}}}));
  order.erase("zRuntime");
  require(removed.at("authoredOrder") == order, "Dead runtime IDs never enter cached authored seed");
  const auto beforeFrames = session.snapshot();
  require(session.frame() == removed && session.frame() == removed && session.snapshot() == beforeFrames, "Frame locals move without consuming authoritative state");
  const auto next = step(Json::array({{{"kind", "transition"}, {"sceneId", "b"}}}));
  const Json nextOrder{{"b2", offset}, {"b1", offset + 1}};
  require(next.at("authoredOrder") == nextOrder, "Transition derives new scene order");
  const auto savedB = session.snapshot();
  session.restore(savedB);
  require(session.frame().at("authoredOrder") == nextOrder && session.generation() == session.frame().at("generation"), "Cold cross-scene restore derives authored seed from document");
  session.restore(original);
  require(session.frame().at("authoredOrder") == expected, "Restoring initial scene replaces cross-scene cache");
  const auto beforeCancelledTransition = session.snapshot();
  const auto previousGeneration = session.generation();
  setCancellationCheck([&] {
    if (session.generation() != previousGeneration) { throw Error("cancelled", "cancel after scene switch"); }
  });
  bool cancelledTransition = false;
  try { step(Json::array({{{"kind", "transition"}, {"sceneId", "b"}}})); }
  catch (const Error &error) { cancelledTransition = error.code == "cancelled"; }
  setCancellationCheck({});
  require(cancelledTransition && session.snapshot() == beforeCancelledTransition && session.frame().at("authoredOrder") == expected, "Post-switch cancellation restores prior scene order and exact checkpoint");
  session.restore(original);
  const auto beforeFailure = session.snapshot();
  bool rejected = false;
  try { step(Json::array({{{"kind", "transition"}, {"sceneId", "missing"}}})); } catch (const Error &) { rejected = true; }
  require(rejected && session.snapshot() == beforeFailure && session.frame().at("authoredOrder") == expected, "Rejected transition preserves snapshot and derived order");
  auto reordered = doc;
  std::reverse(reordered["scenes"][0]["entities"].begin(), reordered["scenes"][0]["entities"].end());
  std::reverse(reordered["prefabs"][0]["entities"].begin(), reordered["prefabs"][0]["entities"].end());
  session.reload(reordered);
  const Json reloadedOrder{{"a", offset}, {"z", offset + 1}, {"z:leafA", offset + 2}, {"z:leafB", offset + 3}};
  require(session.frame().at("authoredOrder") == reloadedOrder, "Same scene ID reload replaces authored and prefab order seed");
}
}
int main() {
  try {
    checkAuthoredOrder(true);
    checkAuthoredOrder(false);
    {
      auto doc = document();
      doc["scenes"][0]["entities"] = Json::array({
        {{"id", "aaa"}, {"behaviors", Json::array({{{"id", "b"}, {"scriptId", "early"}}})}},
        {{"id", "actor"}, {"behaviors", Json::array({{{"id", "b"}, {"scriptId", "late"}}})}}
      });
      doc["scripts"] = Json::array({
        {{"id", "early"}, {"source", "({onFixedUpdate(i){i.state.counter=(i.state.counter||0)+1;i.random();}})"}},
        {{"id", "late"}, {"source", "({onFixedUpdate(i){i.state.late=true;}})"}}
      });
      Session cancelled(doc);
      const auto checkpoint = cancelled.snapshot();
      bool interrupted = false;
      setCancellationCheck([&] {
        if (interrupted || cancelled.snapshot().at("states").contains("aaa/b")) {
          interrupted = true;
          throw Error("cancelled", "cancel after staged early behavior");
        }
      });
      std::string code;
      try { cancelled.step(); } catch (const Error &error) { code = error.code; }
      bool callbackRestored = false;
      try { checkCancellation(); } catch (const Error &) { callbackRestored = true; }
      setCancellationCheck({});
      require(interrupted && callbackRestored && code == "cancelled", "Rollback suppresses cancellation only during recovery");
      require(cancelled.snapshot() == checkpoint && !cancelled.irrecoverable(), "2D rollback restores all behavior state and RNG before exposing checkpoint");
      cancelled.restore(checkpoint);
      require(cancelled.step().at("tick") == 1, "Recovered 2D session can resume from authenticated checkpoint");
    }
    Document edit(document());
    auto changed = edit.transact({{"requestId", "add-bare"}, {"expectedRevision", 0}, {"operations", Json::array({
      {{"kind", "addEntity"}, {"sceneId", "scene"}, {"entity", {{"id", "bare"}}}}
    })}});
    require(changed.at("document").at("scenes")[0].at("entities")[1].at("transform").contains("x"), "2D transaction defaults");
    Session session(edit.inspect());
    bool wrongMoveRejected = false;
    try { session.step({{"move", Json::array({0, 0})}}); }
    catch (const Error &error) { wrongMoveRejected = error.code == "validation_error" && error.path == "input.move"; }
    require(wrongMoveRejected && !session.inspect().at("faulted").get<bool>() && session.frame().at("tick") == 0, "Wrong-dimensional input produces a structured recoverable error");
    auto initial = session.snapshot();
    const auto stepped = session.step();
    require(stepped.at("entities")[1].at("transform").at("x").get<double>() > 0, "2D movement");
    session.restore(initial);
    auto replay = session.step();
    replay["generation"] = stepped.at("generation");
    require(replay == stepped, "2D snapshot continuation");
    Session foreign(edit.inspect());
    bool rejected = false;
    try { foreign.restore(initial); } catch (const Error&) { rejected = true; }
    require(rejected, "Foreign snapshot rejection");
    auto invalid = document();
    invalid["scripts"] = Json::array({{{"id", "script"}, {"source", "i=>({commands:[{kind:'score',amount:4},{kind:'applyImpulse',entityId:'moving',impulse:[1,0,0]}]})"}}});
    invalid["scenes"][0]["entities"][0]["behaviors"] = Json::array({{{"id", "behavior"}, {"scriptId", "script"}}});
    Session commands(invalid);
    rejected = false;
    try { commands.step(); } catch (const Error&) { rejected = true; }
    require(rejected && commands.inspect().at("tick") == 0 && commands.inspect().at("score") == 0, "Unsupported commands fail atomically");
    auto animated = document();
    animated["healthEntityId"] = "moving";
    animated["assets"] = Json::array({{{"id", "atlas"}, {"kind", "image"}, {"path", "atlas.png"}, {"size", 1}, {"digest", std::string(64, 'a')}}});
    auto &actor = animated["scenes"][0]["entities"][0];
    actor["sprite"] = {{"assetId", "atlas"}, {"width", 1}, {"height", 1}};
    const Json first = {{"x", 0}, {"y", 0}, {"width", 8}, {"height", 8}};
    auto second = first; second["x"] = 8;
    actor["animator"] = {{"frames", Json::array({first})}, {"ticksPerFrame", 1}, {"clips", {{"walk", {{"frames", Json::array({first, second})}, {"ticksPerFrame", 1}, {"loop", false}}}}}};
    actor["behaviors"] = Json::array({{{"id", "behavior"}, {"scriptId", "anim"}}});
    animated["scripts"] = Json::array({{{"id", "anim"}, {"source", "({onStart(i){i.command({kind:'playAnimation',clip:'walk'});i.command({kind:'health',amount:-25});}})"}}});
    animated["scenes"][0]["gravity"] = {{"x", 0}, {"y", -60}};
    Session animation(animated);
    auto shown = animation.step();
    require(shown.at("health") == 75, "2D selected health target");
    const auto checkpoint = animation.snapshot();
    const auto immutable = checkpoint.at("entities");
    require(animation.frame() == animation.frame() && animation.snapshot().at("entities") == immutable, "Presentation sampling is immutable");
    const auto continuing = animation.step();
    require(continuing.at("entities")[0].at("sprite").at("frame") == second, "Selected nonlooping animation frame");
    animation.restore(checkpoint);
    auto resumed = animation.step(); resumed["generation"] = continuing.at("generation");
    require(resumed == continuing, "Animation, health and gravity replay");
    require(resumed.at("entities")[0].at("transform").at("y").get<double>() < 0, "Scene-local gravity");
    auto scenes = document();
    const auto ambient = Json{{"ambient", {{"color", "#ffffff"}, {"intensity", 0.3}}}, {"points", Json::array()}};
    auto nextEntity = scenes["scenes"][0]["entities"][0];
    scenes["scenes"].push_back({{"id", "next"}, {"entities", Json::array({nextEntity})}, {"gravity", {{"x", 0}, {"y", -60}}}, {"lighting", ambient}, {"backgrounds", Json::array()}});
    scenes["scenes"][0]["entities"][0]["behaviors"] = Json::array({{{"id", "travel"}, {"scriptId", "travel"}}});
    scenes["scripts"] = Json::array({{{"id", "travel"}, {"source", "i=>({commands:[{kind:'transition',sceneId:'next'}]})"}}});
    Session transition(scenes);
    const auto changedScene = transition.step();
    require(changedScene.at("sceneId") == "next" && changedScene.at("lighting") == ambient && changedScene.at("backgrounds").empty(), "Transition selects scene presentation");
    require(transition.step().at("entities")[0].at("transform").at("y").get<double>() < 0, "Transition selects scene gravity");
    auto missingHealth = document(); missingHealth["healthEntityId"] = "missing";
    rejected = false;
    try { Document invalidHealth(missingHealth); } catch (const Error&) { rejected = true; }
    require(rejected, "Missing health target rejected at admission");
    auto grouped = document();
    grouped["scenes"][0]["entities"][0]["parentId"] = "group";
    grouped["scenes"][0]["entities"].push_back({{"id", "group"}, {"transform", {{"x", 10}, {"y", 20}}}});
    Document fixedGroup(grouped);
    grouped["scenes"][0]["entities"][1]["body2d"] = {{"type", "kinematic"}};
    rejected = false;
    try { Document movingGroup(grouped); } catch (const Error&) { rejected = true; }
    require(rejected, "Moving physics ancestor rejected before commit");
    auto crossing = document();
    crossing["scenes"][0]["entities"] = Json::array({
      {{"id", "actor"}, {"transform", {{"x", -1.5}, {"y", 0}}}, {"body2d", {{"type", "kinematic"}, {"velocity", {{"x", 60}, {"y", 0}}}}}, {"collider2d", {{"width", 0.5}, {"height", 0.5}}}},
      {{"id", "zone"}, {"collider2d", {{"width", 4}, {"height", 4}, {"sensor", true}}}}
    });
    Session overlap(crossing);
    const auto enter = overlap.step().at("events");
    const auto stay = overlap.step().at("events");
    const auto changedNormal = overlap.step().at("events");
    require(enter.size() == 1 && enter[0].at("phase") == "enter", "Sensor overlap enters once");
    require(stay.size() == 1 && stay[0].at("phase") == "stay", "Sensor overlap stays");
    require(changedNormal.size() == 1 && changedNormal[0].at("phase") == "stay" && changedNormal[0].at("normalX") != enter[0].at("normalX"), "Contact normal changes preserve pair lifecycle");
    for (const auto* dimension : {"2d", "3d"}) {
      auto spawning = document();
      spawning["dimension"] = dimension;
      spawning["schemaVersion"] = std::string(dimension) == "2d" ? 5 : 4;
      if (std::string(dimension) == "3d") { spawning.erase("gravity"); }
      spawning["scripts"] = Json::array({{{"id", "spawn"}, {"source", "({onStart(i){i.command({kind:'health',entityId:'parent',amount:-200});i.command({kind:'spawn',entity:{id:'child',parentId:'parent'}});}})"}}});
      spawning["scenes"][0]["entities"] = Json::array({
        {{"id", "parent"}},
        {{"id", "spawner"}, {"behaviors", Json::array({{{"id", "spawn"}, {"scriptId", "spawn"}}})}}
      });
      auto &parent = spawning["scenes"][0]["entities"][0];
      if (std::string(dimension) == "2d") {
        parent["body2d"] = {{"type", "kinematic"}, {"velocity", {{"x", 3}, {"y", 0}}}};
      } else {
        parent["body"] = {{"type", "kinematic"}, {"velocity", {3, 0, 0}}};
        parent["collider"] = {{"shape", "sphere"}};
      }
      Session spawned(spawning);
      const auto result = spawned.step();
      const auto committed = spawned.snapshot();
      const auto &runtimeChild = committed.at("entities")[0];
      require(result.at("entities").size() == 3 && runtimeChild.at("id") == "child" && runtimeChild.at("parentId") == "parent", "Spawn can reference a live parent in both dimensions");
      require(result.at("entities")[1].at("gameplay").at("health") == -100, "Spawn validation preserves runtime gameplay state");
      const auto &liveTransform = result.at("entities")[1].at("transform");
      require((std::string(dimension) == "2d" ? liveTransform.at("x").get<double>() : liveTransform.at("position")[0].get<double>()) > 0, "Spawn validation preserves runtime movement");
      if (std::string(dimension) == "2d") {
        require(result.at("entities")[0].at("parentId") == "parent" && result.at("entities")[0].at("transform") == runtimeChild.at("transform"), "2D frames retain the child's parent and local transform");
        require(runtimeChild.at("transform").at("x") == 0, "2D runtime child remains local to its parent");
      } else {
        require(!result.at("entities")[0].contains("parentId") && result.at("entities")[0].at("transform") == result.at("worldTransforms").at("child"), "3D frames bake the child's world pose without changing runtime ancestry");
        require(runtimeChild.at("transform").at("position") == Json::array({0, 0, 0}), "3D runtime child remains local to its parent");
      }
      require(result.at("worldTransforms").at("child") == result.at("worldTransforms").at("parent"), "Identity-local spawned child inherits the live parent's world pose");
      const auto continued = spawned.step();
      require(continued.at("entities").size() == 3, "Spawned child remains in live scene");
      spawned.restore(committed);
      require(spawned.snapshot().at("entities")[0].at("parentId") == "parent", "Restore retains the spawned child's runtime ancestry");
      auto replayed = spawned.step(); replayed["generation"] = continued.at("generation");
      require(replayed == continued, "Spawned hierarchy replays the same local and world poses");
      auto failedSpawn = spawning;
      failedSpawn["scripts"][0]["source"] = "({onStart(i){i.command({kind:'health',entityId:'parent',amount:-200});i.command({kind:'spawn',entity:{id:'child',parentId:'missing'}});}})";
      Session failed(failedSpawn);
      const auto beforeFailure = failed.snapshot();
      rejected = false;
      try { failed.step(); } catch (const Error&) { rejected = true; }
      require(rejected && failed.frame().at("tick") == 0 && failed.snapshot().at("entities") == beforeFailure.at("entities"), "Invalid spawned ancestry rolls back movement and gameplay changes");
    }
    std::cout << "2D session passed\n";
  } catch (const Error& error) { std::cerr << error.path << ": " << error.what() << '\n'; return 1; } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
