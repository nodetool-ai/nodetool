#include "document/Document.h"
#include <fstream>
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
namespace {
void require(bool condition, const std::string& message) { if (!condition) { throw std::runtime_error(message); } }
Json minimal() { return {{"schemaVersion", 4}, {"engine", "native-cpp-1"}, {"dimension", "3d"}, {"id", "test"}, {"title", "Test"}, {"initialSceneId", "main"}, {"scenes", {{{"id", "main"}}}}}; }
void rejects(const auto& action, const std::string& code = "validation_error") {
    try { action(); } catch (const Error& error) { require(error.code == code, "Unexpected error " + error.code); return; }
    throw std::runtime_error("Invalid operation succeeded");
}
}
int main() {
    try {
        std::ifstream fixturesFile(GAME_ADMISSION_FIXTURES);
        const auto fixtures = Json::parse(fixturesFile);
        require(!fixtures.empty(), "Admission fixtures missing");
        for (const auto& fixture : fixtures) {
            bool valid = true;
            try { validateDocument(fixture.at("document")); } catch (const Error&) { valid = false; }
            require(valid == fixture.at("valid").get<bool>(), "Admission mismatch: " + fixture.at("name").get<std::string>());
        }
        const Json exclusiveBounds{{"type", "number"}, {"exclusiveMinimum", 0}, {"exclusiveMaximum", 10}};
        rejects([&] { normalizeSchema(exclusiveBounds, 0); });
        rejects([&] { normalizeSchema(exclusiveBounds, -1); });
        rejects([&] { normalizeSchema(exclusiveBounds, 10); });
        rejects([&] { normalizeSchema(exclusiveBounds, 11); });
        require(normalizeSchema(exclusiveBounds, 5) == 5, "Exclusive numeric interior rejected");
        {
            auto authored = minimal();
            authored["scenes"][0]["environment"] = {{"postProcessing", {{"toneMapping", "agx"}, {"antialias", "smaa"}}}};
            auto &entities = authored["scenes"][0]["entities"] = Json::array();
            for (int i = 0; i < 33; ++i) { entities.push_back({{"id", "light-" + std::to_string(i)}, {"light3d", {{"kind", "point"}, {"color", "#ffffff"}, {"intensity", 1}, {"range", 10}}}}); }
            rejects([&] { validateDocument(authored); }, "resource_limit");
            entities.erase(entities.begin() + 32); validateDocument(authored);
            auto duplicateSuns = authored;
            duplicateSuns["scenes"][0]["entities"] = Json::array({{{"id", "sun1"}, {"light3d", {{"kind", "directional"}, {"color", "#ffffff"}, {"intensity", 1}, {"castShadow", true}}}}, {{"id", "sun2"}, {"light3d", {{"kind", "directional"}, {"color", "#ffffff"}, {"intensity", 1}, {"castShadow", true}}}}});
            rejects([&] { validateDocument(duplicateSuns); }, "resource_limit");
            authored["scenes"][0]["environment"]["postProcessing"]["enabled"] = false;
            rejects([&] { validateDocument(authored); });
            authored["scenes"][0]["environment"]["postProcessing"]["enabled"] = true;
            authored["scenes"][0]["activeCameraId"] = "missing";
            rejects([&] { validateDocument(authored); });
            authored["scenes"][0].erase("activeCameraId");
            authored["scenes"][0].erase("environment");
            rejects([&] { validateDocument(authored); });
        }
        {
            auto hierarchy = minimal();
            hierarchy["scenes"][0]["entities"] = Json::array({{{"id", "parent"}, {"transform", {{"scale", {2, 1, 1}}}}}, {{"id", "child"}, {"parentId", "parent"}}});
            validateDocument(hierarchy);
            hierarchy["scenes"][0]["entities"][1]["transform"] = {{"rotation", {0, std::sin(.39269908169872414), 0, std::cos(.39269908169872414)}}};
            rejects([&] { validateDocument(hierarchy); });
            hierarchy["scenes"][0]["entities"][1]["transform"]["rotation"] = {0, std::sin(.7853981633974483), 0, std::cos(.7853981633974483)};
            rejects([&] { validateDocument(hierarchy); });
            hierarchy["scenes"][0]["entities"][0]["transform"]["scale"] = {2, 2, 2};
            validateDocument(hierarchy);
        }
        const auto normalized = validateDocument(minimal());
        require(normalized.at("revision") == 0, "Missing default revision");
        require(normalized.at("scenes")[0].at("entities").empty(), "Missing entity defaults");
        Document document(minimal());
        auto transaction = [](int revision, Json operations) { return Json{{"requestId", "request"}, {"expectedRevision", revision}, {"operations", operations}}; };
        const auto entity = Json{{"id", "player"}};
        document.transact(transaction(0, {{{"kind", "addEntity"}, {"sceneId", "main"}, {"entity", entity}}}));
        require(document.inspect().at("revision") == 1, "Revision did not advance");
        rejects([&] { document.transact(transaction(0, {{{"kind", "setTitle"}, {"title", "stale"}}})); }, "conflict");
        const auto before = document.inspect();
        rejects([&] { document.transact(transaction(1, {{{"kind", "setTitle"}, {"title", "bad"}}, {{"kind", "removeEntity"}, {"sceneId", "main"}, {"entityId", "missing"}}})); });
        require(document.inspect() == before, "Failed batch partially committed");
        document.transact(transaction(1, {{{"kind", "cloneEntity"}, {"sceneId", "main"}, {"entityId", "player"}, {"newId", "clone"}}}));
        require(document.inspect().at("scenes")[0].at("entities").size() == 2, "Clone missing");
        document.undo(2);
        require(document.inspect().at("revision") == 3 && document.inspect().at("scenes")[0].at("entities").size() == 1, "Undo failed");
        document.redo(3);
        require(document.inspect().at("revision") == 4 && document.inspect().at("scenes")[0].at("entities").size() == 2, "Redo failed");
        const auto committed = document.inspect();
        int checks = 0;
        setCancellationCheck([&] { if (++checks >= 5) { throw Error("cancelled", "Cancelled by test"); } });
        rejects([&] { document.transact(transaction(4, {{{"kind", "setTitle"}, {"title", "Cancelled"}}})); }, "cancelled");
        setCancellationCheck({});
        require(document.inspect() == committed, "Cancelled transaction changed state");
        auto bad = normalized;
        bad["scenes"][0]["entities"] = {{{"id", "a"}, {"parentId", "b"}}, {{"id", "b"}, {"parentId", "a"}}};
        rejects([&] { validateDocument(bad); });
        bad = normalized; bad["scenes"][0]["entities"] = {{{"id", "a"}, {"assetIds", {"missing"}}}};
        rejects([&] { validateDocument(bad); });
        bad = normalized; bad["prefabs"] = {{{"id", "loop"}, {"entities", {{{"id", "child"}, {"prefabId", "loop"}}}}}};
        rejects([&] { validateDocument(bad); });
        auto prefab = normalized;
        prefab["prefabs"] = {{{"id", "tree"}, {"entities", {{{"id", "leaf"}}}}}};
        prefab["scenes"][0]["entities"] = {{{"id", "instance"}, {"prefabId", "tree"}}};
        prefab["scenes"][0]["entities"][0]["prefabOverrides"] = {{{"entityId", "leaf"}, {"name", "Overridden leaf"}, {"props", {{"health", 50}}}}};
        const auto expanded = resolvePrefabs(validateDocument(prefab), "main");
        require(expanded.size() == 2 && expanded[1].at("id") == "instance:leaf" && expanded[1].at("parentId") == "instance", "Prefab expansion failed");
        require(expanded[1].at("name") == "Overridden leaf" && expanded[1].at("props").at("health") == 50, "Prefab override not applied");
        auto collision = prefab;
        collision["scenes"][0]["entities"].push_back(Json{{"id", "instance:leaf"}});
        rejects([&] { validateDocument(collision); });
        Document prefabDraft(prefab);
        const auto prefabBefore = prefabDraft.inspect();
        rejects([&] { prefabDraft.transact(transaction(0, {{{"kind", "addEntity"}, {"sceneId", "main"}, {"entity", {{"id", "instance:leaf"}}}}})); });
        require(prefabDraft.inspect() == prefabBefore, "Expanded identity collision committed a draft");
        auto expansionLimit = normalized;
        for (int depth = 0; depth < 17; ++depth) {
            Json children = Json::array();
            for (const auto* id : {"left", "right"}) {
                Json child{{"id", id}};
                if (depth > 0) { child["prefabId"] = "p" + std::to_string(depth - 1); }
                children.push_back(std::move(child));
            }
            expansionLimit["prefabs"].push_back(Json{{"id", "p" + std::to_string(depth)}, {"entities", children}});
        }
        expansionLimit["scenes"][0]["entities"] = {{{"id", "root"}, {"prefabId", "p16"}}};
        rejects([&] { validateDocument(expansionLimit); }, "resource_limit");
        auto invalidOverride = prefab;
        invalidOverride["scenes"][0]["entities"][0]["prefabOverrides"][0]["entityId"] = "missing";
        rejects([&] { validateDocument(invalidOverride); });
        invalidOverride = prefab;
        invalidOverride["scenes"][0]["entities"][0]["prefabOverrides"][0]["assetIds"] = {"missing"};
        rejects([&] { validateDocument(invalidOverride); });
        auto physicsDocument = normalized;
        physicsDocument["scenes"][0]["entities"] = {{{"id", "physical"}, {"collider", {{"shape", "box"}}}, {"body", {{"type", "dynamic"}}}, {"character", Json::object()}}};
        rejects([&] { validateDocument(physicsDocument); });
        physicsDocument["scenes"][0]["entities"][0].erase("character");
        physicsDocument["scenes"][0]["entities"][0]["transform"] = {{"scale", {2, 1, 1}}};
        rejects([&] { validateDocument(physicsDocument); });
        physicsDocument["scenes"][0]["entities"][0]["transform"] = Json::object();
        physicsDocument["scenes"][0]["entities"][0]["parentId"] = "anchor";
        physicsDocument["scenes"][0]["entities"].push_back(Json{{"id", "anchor"}, {"transform", {{"position", {1, 0, 0}}}}});
        rejects([&] { validateDocument(physicsDocument); });
        physicsDocument["scenes"][0]["entities"][1]["transform"] = Json::object();
        require(validateDocument(physicsDocument).at("scenes")[0].at("entities").size() == 2, "Identity physics hierarchy rejected");
        physicsDocument["scenes"][0]["entities"][1]["collider"] = {{"shape", "box"}};
        rejects([&] { validateDocument(physicsDocument); });
        auto physicalPrefab = prefab;
        physicalPrefab["prefabs"][0]["entities"][0]["collider"] = {{"shape", "box"}};
        require(validateDocument(physicalPrefab).at("scenes").size() == 1, "Identity prefab anchor rejected");
        physicalPrefab["scenes"][0]["entities"][0]["transform"] = {{"position", {1, 0, 0}}};
        rejects([&] { validateDocument(physicalPrefab); });
        auto visualHierarchy = normalized;
        visualHierarchy["scenes"][0]["entities"] = {{{"id", "anchor"}, {"transform", {{"scale", {2, 2, 2}}}}}, {{"id", "visual"}, {"parentId", "anchor"}}};
        require(validateDocument(visualHierarchy).at("scenes")[0].at("entities").size() == 2, "Visual hierarchy rejected");
        auto meshDocument = normalized;
        meshDocument["scenes"][0]["entities"] = {{{"id", "mesh"}, {"collider", {{"shape", "mesh"}, {"vertices", {{0, 0, 0}, {1, 0, 0}, {0, 1, 0}}}, {"indices", {0, 1, 2}}}}}};
        require(validateDocument(meshDocument).at("scenes")[0].at("entities").size() == 1, "Valid static mesh rejected");
        meshDocument["scenes"][0]["entities"][0]["body"] = {{"type", "dynamic"}};
        rejects([&] { validateDocument(meshDocument); });
        meshDocument["scenes"][0]["entities"][0].erase("body");
        meshDocument["scenes"][0]["entities"][0]["collider"]["indices"] = {0, 1, 3};
        rejects([&] { validateDocument(meshDocument); });
        meshDocument["scenes"][0]["entities"][0]["collider"]["indices"] = {0, 1, 2, 0};
        rejects([&] { validateDocument(meshDocument); });
        auto large = normalized;
        auto& entities = large["scenes"][0]["entities"];
        for (int i = 0; i < 10000; ++i) {
            Json value{{"id", "e" + std::to_string(i)}};
            if (i > 0) { value["parentId"] = "e" + std::to_string(i - 1); }
            entities.push_back(value);
        }
        require(validateDocument(large).at("scenes")[0].at("entities").size() == 10000, "Large hierarchy failed");
        std::cout << "Document transactions, history, references, prefabs and large hierarchy passed\n";
        return 0;
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
