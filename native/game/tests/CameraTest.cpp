#include "core/Session.h"
#include <algorithm>
#include <cmath>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool value, const char *message) { if (!value) { throw std::runtime_error(message); } }
void near(double actual, double expected) { require(std::abs(actual - expected) < 1e-6, "Camera coordinate mismatch"); }
Json document() {
  return {{"schemaVersion", 4}, {"engine", "native-cpp-1"}, {"dimension", "3d"}, {"id", "camera"}, {"title", "Camera"}, {"initialSceneId", "scene"},
    {"camera", {{"kind", "firstPerson"}, {"targetId", "player"}}},
    {"scenes", Json::array({{{"id", "scene"}, {"entities", Json::array({{{"id", "player"}, {"body", {{"type", "kinematic"}}}, {"collider", {{"shape", "sphere"}, {"radius", .1}}}, {"transform", {{"position", {2, 3, 4}}}}, {"behaviors", Json::array({{{"id", "aim"}, {"scriptId", "aim"}}})}}})}}})},
    {"scripts", Json::array({{{"id", "aim"}, {"source", "i=>({state:{camera:i.camera},commands:i.tick===0?[{kind:'setPosition',entityId:'player',position:[5,6,7]}]:[]})"}}})}};
}
void rejects(Json value, const std::string &label) {
  try { Document invalid(value); }
  catch (const Error &error) {
    if (error.code != "validation_error") { throw std::runtime_error(label + ": unexpected " + error.code + ": " + error.what()); }
    return;
  }
  throw std::runtime_error("Invalid camera document was admitted: " + label);
}
}
int main() {
  try {
    auto authored = document();
    Session session(authored);
    auto initial = session.snapshot();
    near(session.frame()["camera"]["position"][1], 3.65);
    auto first = session.step({{"look", {{"x", 100}, {"y", -50}}}});
    near(first["camera"]["position"][0], 5);
    near(first["camera"]["position"][1], 6.65);
    near(first["camera"]["near"], .03);
    near(first["camera"]["far"], 160);
    const auto aim = session.snapshot()["states"]["player/aim"]["camera"];
    near(aim["yaw"], -.2); near(aim["pitch"], .1);
    near(aim["forward"][0], std::sin(.2) * std::cos(.1));
    near(aim["position"][0], 2);
    session.restore(initial);
    auto replay = session.step({{"look", {{"x", 100}, {"y", -50}}}});
    replay["generation"] = first["generation"];
    require(replay == first, "Camera snapshot continuation diverged");
    session.step({{"look", {{"x", 0}, {"y", -1000000}}}});
    near(session.snapshot()["cameraState"]["pitch"], 1.3);
    const auto beforeInvalid = session.snapshot();
    bool badInput = false;
    try { session.step({{"look", {1, 2}}}); } catch (const Error &error) { badInput = error.path == "input.look"; }
    require(badInput && beforeInvalid == session.snapshot(), "Malformed look mutated camera state");
    session.reload(authored);
    near(session.snapshot()["cameraState"]["yaw"], 0);
    auto fault = authored;
    fault["scripts"][0]["source"] = "()=>{throw new Error('camera rollback');}";
    Session failed(fault);
    bool faulted = false;
    try { failed.step({{"look", {{"x", 100}, {"y", 100}}}}); } catch (const Error &) { faulted = true; }
    require(faulted, "Fault fixture unexpectedly succeeded");
    near(failed.snapshot()["cameraState"]["yaw"], 0);
    near(failed.snapshot()["cameraState"]["pitch"], 0);
    auto invalid = authored;
    invalid["camera"]["targetId"] = "missing"; rejects(invalid, "missing first-person target");
    invalid = authored; invalid["camera"]["near"] = 200; rejects(invalid, "first-person clip planes");
    invalid = authored; invalid["camera"]["minPitch"] = .1; rejects(invalid, "first-person pitch limits");
    invalid = authored; invalid["camera"] = {{"near", 20000}}; rejects(invalid, "fixed effective clip planes");
    auto viewmodel = authored;
    viewmodel["assets"] = Json::array({{{"id", "rifle"}, {"kind", "model"}, {"path", "rifle.glb"}, {"size", 0}, {"digest", std::string(64, '0')}}});
    viewmodel["scenes"][0]["entities"].push_back({{"id", "rifle"}, {"visual", {{"kind", "model"}, {"assetId", "rifle"}, {"cameraRelative", true}}}, {"transform", {{"position", {.3, -.2, -1}}}}});
    Session rifle(viewmodel);
    auto rendered = rifle.frame()["entities"];
    auto model = *std::find_if(rendered.begin(), rendered.end(), [](const Json &entity) { return entity.at("id") == "rifle"; });
    near(model["transform"]["position"][0], 2.3);
    near(model["transform"]["position"][1], 3.45);
    near(model["transform"]["position"][2], 3);
    require(!model["visual"].contains("cameraRelative"), "Resolved visual retained camera-relative marker");
    require(rifle.snapshot()["entities"][1]["transform"]["position"] == Json::array({.3, -.2, -1}), "Viewmodel mutated simulation transform");
    auto turned = rifle.step({{"look", {{"x", -500}, {"y", 0}}}})["entities"];
    model = *std::find_if(turned.begin(), turned.end(), [](const Json &entity) { return entity.at("id") == "rifle"; });
    near(model["transform"]["position"][0], 5 + .3 * std::cos(1.) - std::sin(1.));
    near(model["transform"]["position"][2], 7 - .3 * std::sin(1.) - std::cos(1.));
    for (const auto *component : {"body", "collider", "character"}) {
      invalid = viewmodel;
      invalid["scenes"][0]["entities"][1][component] = component == std::string("body") ? Json{{"type", "static"}} : component == std::string("collider") ? Json{{"shape", "box"}} : Json::object();
      rejects(invalid, std::string("camera-relative ") + component);
    }
    invalid = viewmodel; invalid["scenes"][0]["entities"][1]["parentId"] = "player"; rejects(invalid, "camera-relative root has parent");
    auto relativeChild = viewmodel;
    relativeChild["scenes"][0]["entities"].push_back({{"id", "child"}, {"parentId", "rifle"}, {"transform", {{"position", {0, 0, 1}}}}});
    Session childSession(relativeChild);
    const auto childFrame = childSession.frame();
    const auto &childTransform = childFrame.at("worldTransforms").at("child");
    near(childTransform["position"][0], 2.3);
    near(childTransform["position"][1], 3.45);
    near(childTransform["position"][2], 4);
    invalid = viewmodel;
    invalid["scenes"][0]["entities"][1]["transform"]["position"] = {0, 0, 0};
    invalid["scenes"][0]["entities"].push_back({{"id", "physical-child"}, {"parentId", "rifle"}, {"body", {{"type", "static"}}}});
    rejects(invalid, "camera-relative root has physical child");
    auto fixed = authored; fixed["camera"] = {{"position", {6, 5, 8}}, {"target", {0, 0, 0}}, {"fov", 60}};
    Session fixedSession(fixed);
    const auto fixedCamera = fixedSession.frame()["camera"];
    require(fixedSession.step({{"look", {{"x", 500}, {"y", 500}}}})["camera"] == fixedCamera, "Fixed camera consumed look");
    std::cout << "First-person aim, clipping, viewmodel admission, rollback and replay passed\n";
  } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
