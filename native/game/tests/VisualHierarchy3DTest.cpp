#include "core/VisualHierarchy3D.h"
#include <chrono>
#include <cmath>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool value, const char *message) { if (!value) { throw std::runtime_error(message); } }
void near(double actual, double expected) { require(std::abs(actual - expected) < 1e-8, "World pose coordinate mismatch"); }
Json entity(const std::string &id, Json position = {0, 0, 0}) { return {{"id", id}, {"transform", {{"position", position}, {"rotation", {0, 0, 0, 1}}, {"scale", {1, 1, 1}}}}}; }
template<typename Callback> void rejects(Callback callback) {
  bool failed = false;
  try { callback(); } catch (const Error &) { failed = true; }
  require(failed, "Invalid hierarchy was admitted");
}
}
int main() {
  try {
    const double h = std::sqrt(.5);
    auto root = entity("root", {10, 20, 30});
    root["transform"]["rotation"] = {0, h, 0, h}; root["transform"]["scale"] = {2, 3, 4};
    auto child = entity("child", {1, 2, 3}); child["parentId"] = "root"; child["transform"]["scale"] = {.5, 1, 2};
    auto leaf = entity("leaf", {1, 0, 0}); leaf["parentId"] = "child";
    auto entities = Json::array({leaf, child, root});
    const auto original = entities;
    const auto resolved = resolveVisualHierarchy3D(entities, Json::object());
    require(entities == original, "World resolution mutated local simulation entities");
    near(resolved.worldTransforms["child"]["position"][0], 22);
    near(resolved.worldTransforms["child"]["position"][1], 26);
    near(resolved.worldTransforms["child"]["position"][2], 28);
    near(resolved.worldTransforms["leaf"]["position"][2], 27);
    require(!resolved.entities[0].contains("parentId"), "Baked entities retained parent transforms");
    auto scaledParent = entity("scaled"); scaledParent["transform"]["scale"] = {2, 1, 1};
    auto rotatedChild = entity("rotated"); rotatedChild["parentId"] = "scaled";
    rotatedChild["transform"]["rotation"] = {0, std::sin(std::acos(-1.) / 8), 0, std::cos(std::acos(-1.) / 8)};
    rejects([&] { resolveVisualHierarchy3D(Json::array({scaledParent, rotatedChild}), Json::object()); });
    rotatedChild["transform"]["rotation"] = {0, h, 0, h};
    rejects([&] { resolveVisualHierarchy3D(Json::array({scaledParent, rotatedChild}), Json::object()); });
    rotatedChild["transform"]["rotation"] = {h, 0, 0, h};
    require(resolveVisualHierarchy3D(Json::array({scaledParent, rotatedChild}), Json::object()).entities.size() == 2, "Rotation within equally scaled axes was rejected");
    scaledParent["transform"]["scale"] = {2, 2, 2}; rotatedChild["transform"]["rotation"] = {0, h, 0, h};
    require(resolveVisualHierarchy3D(Json::array({scaledParent, rotatedChild}), Json::object()).entities.size() == 2, "Uniform parent rotation was rejected");
    scaledParent["transform"]["scale"] = {2, 1, 1}; rotatedChild["transform"]["rotation"] = {0, 0, 0, 1}; rotatedChild["visualOverride"] = {{"rotation", {0, h, 0, h}}};
    rejects([&] { resolveVisualHierarchy3D(Json::array({scaledParent, rotatedChild}), Json::object()); });
    auto player = entity("player", {2, 3, 4});
    auto camera = entity("camera", {0, .65, 0}); camera["parentId"] = "player";
    camera["camera3d"] = {{"projection", {{"kind", "perspective"}, {"fov", 78}, {"near", .03}, {"far", 160}}}, {"behavior", {{"kind", "fixed"}}}};
    camera["visualOverride"] = {{"rotation", {0, 0, h, h}}};
    auto muzzle = entity("muzzle", {.3, -.2, -1}); muzzle["parentId"] = "camera";
    auto scene = resolveVisualHierarchy3D(Json::array({muzzle, camera, player}), Json::object(), "camera");
    near(scene.camera["position"][0], 2); near(scene.camera["position"][1], 3.65);
    near(scene.camera["up"][0], -1); near(scene.camera["up"][1], 0);
    near(scene.worldTransforms["muzzle"]["position"][0], 2.2);
    near(scene.worldTransforms["muzzle"]["position"][1], 3.95);
    require(!scene.entities[1].contains("visualOverride"), "Resolved camera retained local override");
    near(scene.camera["near"], .03); near(scene.camera["far"], 160);
    auto rifle = entity("rifle", {0, -1, -2}); rifle["visual"] = {{"kind", "model"}, {"assetId", "rifle"}, {"cameraRelative", true}};
    auto flash = entity("flash", {1, 0, 0}); flash["parentId"] = "rifle";
    const auto relative = resolveVisualHierarchy3D(Json::array({rifle, flash, camera, player}), Json::object(), "camera");
    near(relative.worldTransforms["rifle"]["position"][0], 3);
    near(relative.worldTransforms["rifle"]["position"][1], 3.65);
    near(relative.worldTransforms["flash"]["position"][0], 3);
    near(relative.worldTransforms["flash"]["position"][1], 4.65);
    require(!relative.entities[0]["visual"].contains("cameraRelative"), "Camera-relative flag was applied twice");
    auto fixed = resolveVisualHierarchy3D(Json::array({rifle}), {{"position", {0, 0, 0}}, {"target", {-1, 0, 0}}});
    near(fixed.worldTransforms["rifle"]["position"][0], -2);
    near(fixed.worldTransforms["rifle"]["position"][1], -1);
    auto cycle = entities; cycle[2]["parentId"] = "leaf";
    rejects([&] { resolveVisualHierarchy3D(cycle, Json::object()); });
    auto missing = entities; missing[0]["parentId"] = "missing";
    rejects([&] { resolveVisualHierarchy3D(missing, Json::object()); });
    rejects([&] { resolveVisualHierarchy3D(entities, Json::object(), "root"); });
    auto nestedCamera = camera; nestedCamera["parentId"] = "rifle";
    rejects([&] { resolveVisualHierarchy3D(Json::array({rifle, nestedCamera}), Json::object(), "camera"); });
    auto physical = flash; physical["body"] = {{"type", "static"}};
    rejects([&] { resolveVisualHierarchy3D(Json::array({rifle, physical}), Json::object()); });
    auto overridePhysics = player; overridePhysics["character"] = Json::object(); overridePhysics["visualOverride"] = {{"rotation", {0, 0, 0, 1}}};
    rejects([&] { resolveVisualHierarchy3D(Json::array({overridePhysics}), Json::object()); });
    Json chain = Json::array();
    for (std::size_t i = 0; i < 20000; ++i) {
      auto item = entity("node-" + std::to_string(i), {1, 0, 0});
      if (i != 0) { item["parentId"] = "node-" + std::to_string(i - 1); }
      chain.push_back(std::move(item));
    }
    const auto start = std::chrono::steady_clock::now();
    const auto large = resolveVisualHierarchy3D(chain, Json::object());
    near(large.worldTransforms["node-19999"]["position"][0], 20000);
    require(large.entities.size() == chain.size(), "Large hierarchy was not fully inspected");
    std::cout << "Visual hierarchy, active camera roll, local overrides, relative children and 20000-node chain passed in "
      << std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count() << " ms\n";
  } catch (const std::exception &error) { std::cerr << error.what() << '\n'; return 1; }
}
