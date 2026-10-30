#include "core/Session.h"
#include <iostream>
#include <chrono>
using namespace nodetool::game;
namespace {
Json minimal() {
  return {{"engine", "native-cpp-1"}, {"schemaVersion", 5}, {"dimension", "2d"},
          {"id", "limits"}, {"title", "Limits"}, {"initialSceneId", "scene"},
          {"scenes", Json::array({{{"id", "scene"}, {"entities", Json::array()}}})}};
}
bool rejected(const Json& document, const char* label) {
  bool admission = false, runtime = false;
  try { Document candidate(document); } catch (const Error&) { admission = true; }
  if (!admission) {
    try { Session candidate(document); } catch (const Error&) { runtime = true; }
  }
  std::cerr << label << ": admissionRejected=" << admission << ", runtimeRejected=" << runtime << '\n';
  return admission;
}
}
int main() {
  try {
    auto entities = minimal();
    for (int i = 0; i < 20001; ++i) {
      entities["scenes"][0]["entities"].push_back({{"id", "entity" + std::to_string(i)}});
    }
    const bool entityBudget = rejected(entities, "entity capacity");
    entities["scenes"][0]["entities"].erase(20000);
    const auto boundaryStart = std::chrono::steady_clock::now();
    Document boundary(entities);
    std::cerr << "Supported 20000-entity admission seconds=" << std::chrono::duration<double>(std::chrono::steady_clock::now() - boundaryStart).count() << '\n';
    auto chain = minimal();
    for (int i = 0; i < 10000; ++i) {
      Json entity{{"id", "node" + std::to_string(i)}};
      if (i != 0) { entity["parentId"] = "node" + std::to_string(i - 1); }
      chain["scenes"][0]["entities"].push_back(std::move(entity));
    }
    const auto chainStart = std::chrono::steady_clock::now();
    Document chained(chain);
    std::cerr << "Supported 10000-deep hierarchy admission seconds=" << std::chrono::duration<double>(std::chrono::steady_clock::now() - chainStart).count() << '\n';
    bool transactionRejected = false;
    try { boundary.transact({{"requestId", "too-many"}, {"expectedRevision", 0}, {"operations", Json::array({{{"kind", "addEntity"}, {"sceneId", "scene"}, {"entity", {{"id", "overflow"}}}}})}}); }
    catch (const Error&) { transactionRejected = true; }
    if (!transactionRejected || boundary.inspect().at("revision") != 0 || boundary.inspect().at("scenes")[0].at("entities").size() != 20000) { throw std::runtime_error("Entity budget transaction partially committed"); }
    auto translations = minimal();
    translations["scenes"][0]["entities"] = Json::array({
      {{"id", "group"}, {"transform", {{"x", 600000}, {"y", 0}}}},
      {{"id", "child"}, {"parentId", "group"}, {"transform", {{"x", 600000}, {"y", 0}}}, {"collider2d", {{"width", 1}, {"height", 1}}}}
    });
    const bool worldBounds = rejected(translations, "composed world coordinates");
    auto obstacles = minimal();
    Json tiles = Json::array();
    for (int i = 0; i < 10000; ++i) { tiles.push_back({{"x", i}, {"y", 0}, {"width", 1}, {"height", 1}}); }
    obstacles["assets"] = Json::array({{{"id", "atlas"}, {"kind", "image"}, {"path", "atlas.png"}, {"digest", std::string(64, 'a')}, {"size", 1}}});
    obstacles["prefabs"] = Json::array({{{"id", "tiles"}, {"entities", Json::array({{{"id", "tiles"}, {"tilemap", {{"assetId", "atlas"}, {"solid", true}, {"tiles", tiles}}}}})}}});
    for (int i = 0; i < 20; ++i) { obstacles["scenes"][0]["entities"].push_back({{"id", "instance" + std::to_string(i)}, {"prefabId", "tiles"}}); }
    obstacles["scenes"][0]["entities"].push_back({{"id", "extra"}, {"collider2d", {{"width", 1}, {"height", 1}}}});
    const bool obstacleBudget = rejected(obstacles, "expanded obstacle capacity");
    auto numeric = minimal();
    numeric["gravity"] = {{"x", 1000001}, {"y", 0}};
    const bool gravityBounds = rejected(numeric, "gravity bound");
    numeric = minimal();
    numeric["scenes"][0]["entities"] = Json::array({{{"id", "fast"}, {"body2d", {{"type", "kinematic"}, {"velocity", {{"x", 1000001}, {"y", 0}}}}}}});
    const bool velocityBounds = rejected(numeric, "velocity bound");
    numeric = minimal();
    numeric["scenes"][0]["entities"] = Json::array({{{"id", "wide"}, {"collider2d", {{"width", 1000001}, {"height", 1}}}}});
    const bool colliderBounds = rejected(numeric, "collider bound");
    auto crowded = minimal();
    crowded["assets"] = obstacles.at("assets");
    Json overlapping = Json::array();
    for (int i = 0; i < 8193; ++i) { overlapping.push_back({{"x", 0}, {"y", 0}, {"width", 1}, {"height", 1}}); }
    crowded["scenes"][0]["entities"] = Json::array({{{"id", "crowded"}, {"tilemap", {{"assetId", "atlas"}, {"solid", true}, {"tiles", overlapping}}}}});
    const bool candidateBudget = rejected(crowded, "static index candidate capacity");
    if (!entityBudget || !worldBounds || !obstacleBudget || !gravityBounds || !velocityBounds || !colliderBounds || !candidateBudget) { throw std::runtime_error("Document admitted a scene outside spatial limits"); }
    std::cout << "2D spatial admission limits passed\n";
  } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
