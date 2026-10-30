#include "core/Session.h"
#include <cmath>
#include <functional>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool test, const char *message) {
  if (!test) {
    throw std::runtime_error(message);
  }
}
Json entity(std::string id, Json position = Json::array({0, 0, 0})) {
  return {{"id", id}, {"transform", {{"position", position}}}};
}
Json document(Json entities = Json::array(), Json scripts = Json::array()) {
  return {{"schemaVersion", 4},
          {"engine", "native-cpp-1"},
          {"dimension", "3d"},
          {"id", "test"},
          {"title", "Session"},
          {"initialSceneId", "scene"},
          {"scenes", Json::array({{{"id", "scene"}, {"entities", entities}}})},
          {"scripts", scripts}};
}
Json scripted(std::string source, Json extra = Json::object()) {
  auto e = entity("player");
  e["behaviors"] = Json::array({{{"id", "update"}, {"scriptId", "script"}}});
  for (auto it = extra.begin(); it != extra.end(); ++it) {
    e[it.key()] = it.value();
  }
  return document(Json::array({e}),
                  Json::array({{{"id", "script"}, {"source", source}}}));
}
Json dynamic(std::string id, Json position) {
  auto e = entity(id, position);
  e["body"] = {{"type", "dynamic"}, {"velocity", {1, 0, 0}}};
  e["collider"] = {{"shape", "sphere"}, {"radius", .5}};
  return e;
}
Json ground() {
  auto e = entity("floor", {0, -.5, 0});
  e["collider"] = {{"shape", "box"}, {"halfExtents", {10, .5, 10}}};
  return e;
}
void expectError(const std::function<void()> &f) {
  bool failed = false;
  try {
    f();
  } catch (const std::exception &) {
    failed = true;
  }
  require(failed, "Expected operation to fail");
}
} // namespace
int main() {
  int caseIndex=0;
  try {
    for (const bool transition : {false, true}) {
      auto doc = scripted(std::string("i=>({state:{calls:(i.state.calls||0)+1,random:i.random()},commands:[{kind:'score',amount:1},") +
        (transition ? "{kind:'transition',sceneId:'next'}" : "{kind:'despawn'}") + "]})");
      doc["scenes"].push_back({{"id", "next"}, {"entities", Json::array()}});
      Session function(doc);
      const auto checkpoint = function.snapshot();
      const auto first = function.step();
      require(first.at("score") == 1 && function.step().at("score") == 1, "Function updates do not run during destruction");
      const auto completed = function.snapshot();
      function.restore(checkpoint);
      function.step(); function.step();
      const auto replayed = function.snapshot();
      for (const auto *field : {"tick", "rngState", "states", "timers", "started", "entities", "removed", "score"}) {
        require(replayed.at(field) == completed.at(field), "Function destruction preserves transaction and RNG replay");
      }
    }
    for (const bool despawn : {false, true}) {
      auto doc = scripted(std::string("({onStart(i){i.state.payload='retained';") +
        (despawn ? "i.command({kind:'despawn'});" : "") +
        "i.command({kind:'transition',sceneId:'next'});},onDestroy(i){if(i.state.payload!=='retained')throw Error('lost state');i.command({kind:'score',amount:7});}})");
      doc["scenes"].push_back({{"id", "next"}, {"entities", Json::array()}});
      Session transition(doc);
      const auto checkpoint = transition.snapshot();
      require(transition.step().at("score") == 7, "Outgoing scene destruction runs with preserved state");
      require(transition.step().at("score") == 7, "Despawn plus transition destroys exactly once");
      transition.restore(checkpoint);
      require(transition.step().at("score") == 7, "Outgoing destruction replays from checkpoint");
    }
    {
      auto doc = scripted("({onStart(i){i.state.payload='staged';i.command({kind:'transition',sceneId:'next'});},onDestroy(i){i.command({kind:'health',entityId:'missing',amount:1});}})");
      doc["scenes"].push_back({{"id", "next"}, {"entities", Json::array()}});
      Session transition(doc);
      const auto checkpoint = transition.snapshot();
      expectError([&] { transition.step(); });
      require(transition.snapshot() == checkpoint, "Failed outgoing destruction rolls back entire transition");
    }
    {
      auto controller = entity("controller");
      controller["behaviors"] = Json::array({{{"id", "b"}, {"scriptId", "controller"}}});
      auto doc = document(Json::array({controller}), Json::array({
        {{"id", "controller"}, {"source", "({onFixedUpdate(i){if(i.tick<40)i.command({kind:'spawn',entity:{id:'ephemeral'+i.tick,behaviors:[{id:'b',scriptId:'ephemeral'}]}});}})"}},
        {{"id", "ephemeral"}, {"source", "({onStart(i){i.state.payload='x'.repeat(4096);after(100,'later');i.command({kind:'despawn'});},onDestroy(i){i.command({kind:'score',amount:1});},later(){}})"}}
      }));
      Session lifecycle(doc);
      lifecycle.step();
      auto baseline = lifecycle.snapshot();
      for (int i = 0; i < 43; ++i) { lifecycle.step(); }
      const auto saved = lifecycle.snapshot();
      require(saved.at("score") == 40, "Each ephemeral entity destroys once");
      require(saved.dump().size() < baseline.dump().size() + 4096, "Checkpoint size retains ID history without accumulating dead state payloads");
      for (const auto *field : {"states", "timers", "started"}) {
        require(saved.at(field).size() == 1 && saved.at(field).contains("controller/b"), "Dead behavior state, timers and started keys released");
        require(saved.at(field).dump().size() == baseline.at(field).dump().size(), "Lifecycle checkpoint state returns to live baseline");
      }
    }
    {
      auto camera = entity("camera", {0, .65, 0}); camera["parentId"] = "actor";
      camera["camera3d"] = {{"projection", {{"kind", "perspective"}, {"fov", 78}, {"near", .03}, {"far", 160}}}, {"behavior", {{"kind", "fixed"}}}};
      camera["behaviors"] = Json::array({{{"id", "pose"}, {"scriptId", "pose"}}});
      auto muzzle = entity("muzzle", {0, 0, -1}); muzzle["parentId"] = "camera";
      auto emitter = entity("emitter"); emitter["particles"] = {{"emitters", Json::array({{{"id", "spark"}, {"rate", 60}, {"maxParticles", 16}, {"speed", 0}, {"lifetime", 1}}})}};
      auto doc = document(Json::array({entity("actor", {0, 1, 0}), camera, muzzle, emitter}), Json::array({{{"id", "pose"}, {"source", "i=>({commands:i.tick===0?[{kind:'setVisual',rotation:[0,0,0.7071067811865475,0.7071067811865475]},{kind:'ui',id:'label',text:'committed'},{kind:'emitParticles',entityId:'emitter',emitter:'spark',count:2}]:[]})"}}}));
      doc["scenes"][0]["activeCameraId"] = "camera";
      doc["scenes"][0]["environment"] = {{"postProcessing", {{"toneMapping", "agx"}, {"antialias", "smaa"}}}};
      doc["presentation"] = {{"aspectRatio", 16. / 9.}, {"hudWidth", 1280}, {"hudHeight", 720}};
      doc["ui"] = {{"nodes", Json::array({{{"kind", "text"}, {"id", "label"}, {"text", "initial"}}})}};
      Session presentation(doc);
      const auto original = presentation.snapshot();
      const auto first = presentation.step();
      require(first.at("environment").at("postProcessing").at("toneMapping") == "agx", "Committed authored environment");
      require(first.at("ui").at("nodes")[0].at("text") == "committed", "UI command commits to frame");
      require(first.at("camera").at("up")[0].get<double>() < -.99, "Active camera preserves authored recoil roll");
      require(first.at("camera").at("position")[1] == 1.65, "Active camera uses parent hierarchy");
      require(!first.at("particles").empty(), "Portable particles advance committed tick");
      const auto checkpoint = presentation.snapshot();
      const auto continuous = presentation.step();
      presentation.restore(checkpoint);
      const auto resumed = presentation.step();
      require(continuous.at("particles") == resumed.at("particles") && continuous.at("ui") == resumed.at("ui"), "Presentation particles and UI restore exactly");
      presentation.restore(original);
      require(presentation.frame().at("ui").at("nodes")[0].at("text") == "initial" && presentation.frame().at("particles").empty(), "Original presentation snapshot restores initial state");
      require(presentation.snapshot().at("document").at("scenes")[0].at("entities")[1].at("transform").at("rotation") == Json::array({0, 0, 0, 1}), "Visual override never mutates authored pose");
    }
    for (const auto *dimension : {"3d", "2d"}) {
      auto source = std::string("i=>({commands:i.tick===0?[{kind:'save',scope:'progress',slot:'slot',data:{version:1,level:2}},{kind:'load',scope:'settings',slot:'slot'}]:[],state:{loaded:i.input.loaded||[]}})");
      auto doc = scripted(source);
      if (std::string(dimension) == "2d") {
        doc["dimension"] = "2d"; doc["schemaVersion"] = 5;
        doc["scenes"][0]["entities"][0]["transform"] = {{"x", 0}, {"y", 0}};
      }
      Session invalidMove(doc);
      bool accurateInputError = false;
      try { invalidMove.step({{"move", std::string(dimension) == "2d" ? Json::array({0, 0}) : Json{{"x", 0}, {"y", 0}}}}); }
      catch (const Error &error) { accurateInputError = error.code == "validation_error" && error.path == "input.move"; }
      require(accurateInputError && invalidMove.frame().at("tick") == 0 && !invalidMove.inspect().at("faulted").get<bool>(), "Dimensional input errors are structured and do not fault the session");
      Session saves(doc);
      const auto original = saves.snapshot();
      const auto committed = saves.step();
      require(committed.at("hostRequests").size() == 2, "Committed JSON requests");
      require(committed.at("hostRequests")[0].at("sequence") == 0 && committed.at("hostRequests")[1].at("sequence") == 1, "Ordered JSON requests");
      require(committed.at("hostRequests")[0].at("tick") == 1 && committed.at("hostRequests")[0].at("generation") == committed.at("generation"), "Committed request identity");
      require(!saves.snapshot().contains("hostRequests"), "Storage requests excluded from snapshot");
      auto loaded = Json::array({{{"scope", "progress"}, {"slot", "slot"}, {"data", {{"version", 1}, {"level", 2}}}}});
      saves.step({{"loaded", loaded}});
      require(saves.snapshot().at("states").at("player/update").at("loaded") == loaded, "Recorded load reaches guest input");
      saves.restore(original);
      require(saves.frame().at("hostRequests").empty(), "Restore drops host outputs");
      require(saves.snapshot().at("document").at("scripts")[0].at("source") == source, "Source preserved across save and restore");
      for (const auto *commands : {
        "[{kind:'save',slot:'slot',data:{ok:true}},{kind:'move',entityId:'missing',direction:DIRECTION}]",
        "[{kind:'save',slot:'slot',data:{},snapshot:true}]",
        "Array.from({length:5},()=>({kind:'load',slot:'slot'}))",
        "[{kind:'save',slot:'slot',data:{huge:'x'.repeat(16384)}}]",
        "[{kind:'save',slot:'slot',data:{constructor:1}}]"}) {
        auto code = std::string(commands);
        if (const auto pos = code.find("DIRECTION"); pos != std::string::npos) { code.replace(pos, 9, std::string(dimension) == "2d" ? "{x:1,y:0}" : "[1,0,0]"); }
        auto invalid = doc; invalid["scripts"][0]["source"] = "i=>({commands:" + code + "})";
        Session rejected(invalid);
        expectError([&] { rejected.step(); });
        require(rejected.inspect().at("tick") == 0 && rejected.frame().at("hostRequests").empty(), "Failed tick rolls back all save requests");
      }
      expectError([&] { saves.step({{"loaded", Json::array({loaded[0], loaded[0], loaded[0]})}}); });
    }

    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(scripted("i=>({state:{n:(i.state.n||0)+1},commands:[{kind:'"
                         "score',amount:2}]})"));
      auto a = s.step();
      require(a["tick"] == 1 && a["score"] == 2, "script tick");
      auto snap = s.snapshot();
      auto continuous = s.step();
      s.restore(snap);
      auto resumed = s.step();
      require(continuous["score"] == resumed["score"] &&
                  continuous["entities"] == resumed["entities"],
              "script replay");
      require(s.snapshot()["states"]["player/update"]["n"] == 2,
              "explicit state replay");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto doc = scripted(
          "i=>({commands:[{kind:'score',amount:1},{kind:'score',amount:1}]})");
      doc["scenes"][0]["entities"][0]["behaviors"][0]["maxCommands"] = 1;
      Session s(doc);
      expectError([&] { s.step(); });
      require(s.frame()["tick"] == 0 && s.frame()["score"] == 0,
              "failed script must rollback tick");
      require(s.inspect()["faulted"] == true, "failed session faulted");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(document(Json::array({dynamic("ball", {0, 5, 0}), ground()})));
      for (int i = 0; i < 20; ++i) {
        s.step();
      }
      auto snap = s.snapshot();
      for (int i = 0; i < 20; ++i) {
        s.step();
      }
      auto continuous = s.frame();
      s.restore(snap);
      for (int i = 0; i < 20; ++i) {
        s.step();
      }
      require(s.frame()["entities"] == continuous["entities"],
              "Jolt world replay");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto c = entity("hero", {0, 1, 0});
      c["character"] = Json::object();
      c["collider"] = {{"shape", "capsule"}};
      Session s(document(Json::array({c, ground()})));
      for (int i = 0; i < 30; ++i) {
        s.step();
      }
      auto snap = s.snapshot();
      for (int i = 0; i < 10; ++i) {
        s.step({{"move", {1, 0, 0}}});
      }
      auto a = s.frame();
      s.restore(snap);
      for (int i = 0; i < 10; ++i) {
        s.step({{"move", {1, 0, 0}}});
      }
      require(a["entities"] == s.frame()["entities"],
              "virtual character replay");
      require(
          s.frame()["entities"][1]["transform"]["position"][0].get<double>() >
              .1,
          "character horizontal movement");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(scripted(
          "i=>({commands:i.tick===0?[{kind:'query',queryId:'ray',origin:[0,4,0]"
          ",direction:[0,-1,0],maxDistance:10}]:[],state:{seen:i.queryResults."
          "length}})"));
      auto a = s.step();
      require(a["queryResults"][0]["queryId"] == "ray", "query result");
      s.step();
      require(s.snapshot()["states"]["player/update"]["seen"] == 1,
              "query arrives next tick");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto actor = entity("actor");
      actor["behaviors"] = Json::array({{{"id", "rays"}, {"scriptId", "rays"}}});
      auto wall = entity("wall", {3, 2, 0});
      const double half = std::sqrt(.5);
      wall["transform"]["rotation"] = {0, 0, std::sin(std::acos(-1.) / 8), std::cos(std::acos(-1.) / 8)};
      wall["body"] = {{"type", "static"}};
      wall["collider"] = {{"shape", "box"}, {"halfExtents", {.2, 2, 4}}};
      auto script = Json{{"id", "rays"}, {"source", "i=>({commands:i.tick===0?[{kind:'query',queryId:'floor',origin:[0,4,0],direction:[0,-1,0],maxDistance:10},{kind:'query',queryId:'wall',origin:[0,2,0],direction:[1,0,0],maxDistance:10},{kind:'query',queryId:'miss',origin:[0,4,0],direction:[0,0,1],maxDistance:10}]:[]})"}};
      Session rays(document(Json::array({actor, wall, ground()}), Json::array({script})));
      const auto saved = rays.snapshot();
      const auto result = rays.step().at("queryResults");
      require(result[0].at("hit") && result[1].at("hit") && !result[2].at("hit"), "Floor and rotated wall ray hits");
      require(std::abs(result[0]["normal"][1].get<double>() - 1) < 1e-6, "Floor ray normal points up");
      require(std::abs(result[1]["normal"][0].get<double>() + half) < 1e-5 && std::abs(result[1]["normal"][1].get<double>() + half) < 1e-5, "Rotated wall ray normal is world-space");
      for (const auto &hit : {result[0], result[1]}) {
        double length = 0;
        for (const auto &value : hit.at("normal")) { length += value.get<double>() * value.get<double>(); }
        require(std::abs(length - 1) < 1e-6, "Ray hit normal is unit length");
      }
      require(!result[2].contains("normal"), "Miss omits hit normal");
      rays.restore(saved);
      require(rays.step().at("queryResults") == result, "Ray normals survive same-session replay");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(scripted("({onStart(i){i.state.started=(i.state.started||0)+1;"
                         "after(2,'timer')},timer(i){i.state.fired=true}})"));
      s.step();
      auto snap = s.snapshot();
      s.step();
      s.step();
      require(s.snapshot()["states"]["player/update"]["fired"] == true,
              "timer fires");
      s.restore(snap);
      s.step();
      s.step();
      require(s.snapshot()["states"]["player/update"]["started"] == 1,
              "onStart not duplicated on restore");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(document());
      auto before = s.frame();
      auto broken = s.snapshot();
      broken["build"] = "wrong";
      expectError([&] { s.restore(broken); });
      require(before == s.frame(), "mismatched restore atomic");
      broken = s.snapshot();
      broken.erase("states");
      expectError([&] { s.restore(broken); });
      require(before == s.frame(), "incomplete restore atomic");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(scripted("i=>({commands:[{kind:'score',amount:1}]})"));
      s.step();
      auto before = s.frame();
      auto doc = scripted("({broken syntax");
      expectError([&] { s.reload(doc); });
      require(s.frame() == before, "invalid source reload atomic");
      s.reload(scripted("i=>({commands:[{kind:'score',amount:5}]})"));
      require(s.frame()["tick"] == 0, "reload restarts");
      require(s.step()["score"] == 5, "reload installs source");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto doc = scripted("i=>({commands:i.tick===2?[{kind:'spawn',entity:{id:'"
                          "spawned',transform:{position:[10,10,10]}}}]:[]})");
      doc["scenes"][0]["entities"].push_back(dynamic("ball", {0, 5, 0}));
      Session s(doc);
      auto a = s.step();
      auto b = s.step();
      auto c = s.step();
      auto ball = [](const Json &f) {
        for (const auto &e : f["entities"]) {
          if (e["id"] == "ball") {
            return e;
          }
        }
        throw std::runtime_error("ball missing");
      };
      require(ball(c)["velocity"][1].get<double>() <
                  ball(b)["velocity"][1].get<double>(),
              "spawn preserves moving body velocity");
      auto snap = s.snapshot();
      auto d = s.step();
      s.restore(snap);
      require(s.step()["entities"] == d["entities"], "spawn replay");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(scripted("i=>({commands:[{kind:'score',amount:1}]})"));
      auto before = s.frame();
      setCancellationCheck([] { throw Error("cancelled", "cancel"); });
      expectError([&] { s.step(); });
      setCancellationCheck({});
      require(s.frame() == before, "cancellation atomic");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto character = entity("hero", {0, 1, 0});
      character["character"] = {{"speed", 3}, {"stepHeight", .3}};
      character["collider"] = {
          {"shape", "capsule"}, {"radius", .4}, {"halfHeight", .5}};
      auto step = entity("step", {2, .1, 0});
      step["collider"] = {{"shape", "box"}, {"halfExtents", {.6, .1, 2}}};
      Session stairs(document(Json::array({character, ground(), step})));
      for (int i = 0; i < 100; ++i) {
        stairs.step({{"move", {1, 0, 0}}});
      }
      auto hero = [](const Json &f) {
        for (const auto &e : f["entities"]) {
          if (e["id"] == "hero") {
            return e;
          }
        }
        throw std::runtime_error("hero missing");
      };
      require(hero(stairs.frame())["transform"]["position"][0].get<double>() >
                  3,
              "character climbs allowed step");
      auto wall = entity("ceiling", {2, 1.5, 0});
      wall["collider"] = {{"shape", "box"}, {"halfExtents", {.5, .4, 2}}};
      Session low(document(Json::array({character, ground(), wall})));
      for (int i = 0; i < 80; ++i) {
        low.step({{"move", {1, 0, 0}}});
      }
      require(hero(low.frame())["transform"]["position"][0].get<double>() < 1.5,
              "low ceiling blocks capsule");
      auto sensor = entity("sensor", {1, 1, 0});
      sensor["collider"] = {
          {"shape", "box"}, {"halfExtents", {.2, 1, 1}}, {"sensor", true}};
      Session triggers(document(Json::array({character, ground(), sensor})));
      bool enter = false, exit = false;
      for (int i = 0; i < 90; ++i) {
        auto f = triggers.step({{"move", {1, 0, 0}}});
        for (const auto &e : f["events"]) {
          if (e.value("sensor", false)) {
            enter |= e.value("phase", std::string{}) == "enter";
            exit |= e.value("phase", std::string{}) == "exit";
          }
        }
      }
      require(enter && exit, "character sensor enter and exit");
      auto platform = entity("platform", {0, -.2, 0});
      platform["collider"] = {{"shape", "box"}, {"halfExtents", {2, .2, 2}}};
      platform["body"] = {{"type", "kinematic"}, {"velocity", {0, .5, 0}}};
      Session elevator(document(Json::array({character, platform})));
      for (int i = 0; i < 90; ++i) {
        elevator.step();
      }
      require(hero(elevator.frame())["transform"]["position"][1].get<double>() >
                  1.2,
              "character follows moving platform");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto mesh = entity("mesh");
      mesh["collider"] = {
          {"shape", "mesh"},
          {"vertices", {{-10, 0, -10}, {0, 0, 10}, {10, 0, -10}}},
          {"indices", {0, 1, 2}}};
      Session s(document(Json::array({mesh, dynamic("ball", {0, 3, 0})})));
      for (int i = 0; i < 100; ++i) {
        s.step();
      }
      require(
          s.frame()["entities"][0]["transform"]["position"][1].get<double>() >
              .4,
          "static prepared mesh collision");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      Session s(document());
      auto saved = s.snapshot();
      auto before = s.frame();
      saved["physics"]["world"] = "00";
      expectError([&] { s.restore(saved); });
      require(s.frame() == before,
              "tampered opaque bytes rejected before physics");
      saved = s.snapshot();
      saved["physics"]["bodyIds"]["fake"] = 999999;
      expectError([&] { s.restore(saved); });
      require(s.frame() == before, "forged body layout rejected");
      Session other(document());
      expectError([&] { other.restore(s.snapshot()); });
      require(other.frame()["tick"] == 0, "foreign snapshot rejected");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto floor = ground();
      floor["collider"]["layer"] = 1;
      floor["collider"]["mask"] = 0;
      Session s(document(Json::array({floor, dynamic("ball", {0, 2, 0})})));
      for (int i = 0; i < 80; ++i) {
        s.step();
      }
      require(
          s.frame()["entities"][0]["transform"]["position"][1].get<double>() <
              0,
          "collision mask disables floor collision");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto doc = scripted("i=>({state:{random:Math.random()}})");
      Session s(doc, 77);
      s.step();
      auto first = s.snapshot()["states"];
      s.reload(doc);
      s.step();
      require(first == s.snapshot()["states"],
              "reload retains authored session seed");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto doc =
          scripted("i=>({commands:i.tick===0?[{kind:'spawn',entity:{id:'child',"
                   "behaviors:[{id:'boot',scriptId:'childScript'}]}}]:[]})");
      doc["scripts"].push_back(
          {{"id", "childScript"},
           {"source", "({onStart(i){i.state.booted=true}})"}});
      Session s(doc);
      s.step();
      s.step();
      require(s.snapshot()["states"]["child/boot"]["booted"] == true,
              "spawned behavior onStart next tick");
    }
    {
      std::cerr<<"Session case "<<++caseIndex<<"\n";
      auto doc =
          scripted("i=>({commands:i.tick===0?[{kind:'spawn',entity:{id:'child'}"
                   "}]:i.tick===1?[{kind:'despawn',entityId:'child'}]:i.tick==="
                   "2?[{kind:'spawn',entity:{id:'child'}}]:[]})");
      Session s(doc);
      s.step();
      s.step();
      expectError([&] { s.step(); });
      require(s.frame()["tick"] == 2, "stale ID reuse fails before commit");
    }
    std::cout << "Native session simulation, scripting, Jolt, restoration and "
                 "failure cases passed\n";
    return 0;
  } catch (const Error& error) {
    std::cerr<<error.code<<" "<<error.path<<" "<<error.what()<<" "<<error.details.dump()<<"\n";return 1;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
