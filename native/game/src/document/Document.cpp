#include "Document.h"
#include "core/VisualHierarchy3D.h"
#include "physics/World2D.h"
#include <algorithm>
#include <cmath>
#include <filesystem>
#include <map>
#include <set>
#include <unordered_map>
#include <unordered_set>
namespace nodetool::game {
namespace {
using Index = std::unordered_map<std::string, std::size_t>;
Index index(const Json& values, const std::string& path) {
    Index result;
    for (std::size_t i = 0; i < values.size(); ++i) {
        const auto id = values[i].at("id").get<std::string>();
        if (!result.emplace(id, i).second) { throw Error("validation_error", "Duplicate id: " + id, path + "/" + std::to_string(i) + "/id"); }
    }
    return result;
}
void acyclic(const std::unordered_map<std::string, std::vector<std::string>>& edges, const std::string& label) {
    std::unordered_map<std::string, int> color;
    // Iterative traversal avoids exhausting the host stack on authored hierarchies.
    for (const auto& [start, unused] : edges) {
        (void)unused;
        if (color[start] == 2) { continue; }
        std::vector<std::pair<std::string, bool>> pending{{start, false}};
        while (!pending.empty()) {
            checkCancellation();
            auto [id, leaving] = pending.back(); pending.pop_back();
            if (leaving) { color[id] = 2; continue; }
            if (color[id] == 1) { throw Error("validation_error", label + " cycle at " + id); }
            if (color[id] == 2) { continue; }
            color[id] = 1; pending.emplace_back(id, true);
            const auto found = edges.find(id);
            if (found != edges.end()) {
                for (const auto& next : found->second) { pending.emplace_back(next, false); }
            }
        }
    }
}
bool physical(const Json& entity) {
    return entity.contains("body") || entity.contains("collider") || entity.contains("character");
}
bool identityTransform(const Json& transform) {
    if (transform.contains("x")) {
        return transform.at("x") == 0 && transform.at("y") == 0 && transform.at("rotation") == 0 &&
            transform.at("scaleX") == 1 && transform.at("scaleY") == 1;
    }
    for (const auto& value : transform.at("position")) { if (value.get<double>() != 0.) { return false; } }
    for (const auto& value : transform.at("scale")) { if (value.get<double>() != 1.) { return false; } }
    const auto& rotation = transform.at("rotation");
    return rotation[0].get<double>() == 0. && rotation[1].get<double>() == 0. &&
        rotation[2].get<double>() == 0. && std::abs(rotation[3].get<double>()) == 1.;
}
void validatePhysics(const Json& entities, const Index& ids, const std::string& path) {
    // Each ancestry link is visited once, including large chains of visual anchors.
    std::unordered_map<std::string, bool> blocked, moving;
    for (const auto& start : entities) {
        checkCancellation();
        std::vector<std::string> chain;
        std::string cursor = start.at("id").get<std::string>();
        bool ancestorBlocked = false, ancestorMoving = false;
        while (!blocked.contains(cursor)) {
            const auto& entity = entities[ids.at(cursor)];
            chain.push_back(cursor);
            if (!entity.contains("parentId")) { break; }
            cursor = entity.at("parentId").get<std::string>();
        }
        if (blocked.contains(cursor)) { ancestorBlocked = blocked.at(cursor); ancestorMoving = moving.at(cursor); }
        for (auto it = chain.rbegin(); it != chain.rend(); ++it) {
            const auto& entity = entities[ids.at(*it)];
            if (entity.at("transform").contains("x")) {
                const auto& transform = entity.at("transform");
                const bool transformed = transform.at("rotation") != 0 || transform.at("scaleX") != 1 || transform.at("scaleY") != 1;
                const bool spatial = entity.contains("body2d") || entity.contains("collider2d") || entity.contains("tilemap");
                if (spatial && ancestorMoving) { throw Error("validation_error", "2D physics ancestors must be fixed", path); }
                if (spatial && (ancestorBlocked || transformed)) { throw Error("validation_error", "2D physics cannot be rotated or scaled", path); }
                if ((entity.contains("collider2d") || entity.contains("tilemap") || entity.contains("camera2d")) && (ancestorBlocked || transformed)) {
                    throw Error("validation_error", "2D collider, tilemap or camera cannot be rotated or scaled", path);
                }
                ancestorBlocked = ancestorBlocked || transformed;
                const auto body = entity.value("body2d", Json::object());
                const auto velocity = body.value("velocity", Json{{"x", 0}, {"y", 0}});
                ancestorMoving = ancestorMoving || body.value("type", std::string{}) == "kinematic" || velocity.at("x") != 0 || velocity.at("y") != 0;
                blocked.emplace(*it, ancestorBlocked);
                moving.emplace(*it, ancestorMoving);
                continue;
            }
            if (physical(entity)) {
                if (ancestorBlocked) { throw Error("validation_error", "Physics entity has a transformed or physical ancestor", path); }
                if (entity.contains("body") && entity.contains("character")) { throw Error("validation_error", "Character and body cannot own the same transform", path); }
                for (const auto& scale : entity.at("transform").at("scale")) {
                    if (scale.get<double>() != 1.) { throw Error("validation_error", "Physics scale must be identity", path); }
                }
                auto boundedVector = [&](const Json& vector) {
                    for (const auto& value : vector) {
                        if (std::abs(value.get<double>()) > 1000000.) { throw Error("validation_error", "Physics coordinate exceeds supported range", path); }
                    }
                };
                boundedVector(entity.at("transform").at("position"));
                if (entity.contains("body")) { boundedVector(entity.at("body").at("velocity")); }
                if (entity.contains("collider") && entity.at("collider").at("shape") == "mesh") {
                    const auto& collider = entity.at("collider");
                    if (entity.contains("character") || (entity.contains("body") && entity.at("body").at("type") != "static")) {
                        throw Error("validation_error", "Triangle mesh requires a static body", path);
                    }
                    const auto& vertices = collider.at("vertices");
                    const auto& indices = collider.at("indices");
                    if (indices.size() % 3 != 0) { throw Error("validation_error", "Mesh indices require triangles", path); }
                    for (const auto& value : indices) { if (value.get<std::size_t>() >= vertices.size()) { throw Error("validation_error", "Mesh index out of range", path); } }
                    for (const auto& vertex : vertices) { boundedVector(vertex); }
                }
            }
            ancestorBlocked = ancestorBlocked || physical(entity) || !identityTransform(entity.at("transform")) || (entity.contains("visual") && entity.at("visual").value("cameraRelative", false));
            blocked.emplace(*it, ancestorBlocked);
            moving.emplace(*it, false);
        }
    }
}
void validateEntities(const Json& entities, const Index& prefabs, const Index& scripts, const Index& assets, const std::string& path) {
    const auto ids = index(entities, path);
    std::unordered_map<std::string, std::vector<std::string>> parents;
    for (std::size_t i = 0; i < entities.size(); ++i) {
        checkCancellation();
        const auto& entity = entities[i];
        const auto id = entity.at("id").get<std::string>();
        const auto entityPath = path + "/" + std::to_string(i);
        if (entity.contains("parentId")) {
            const auto parent = entity.at("parentId").get<std::string>();
            if (!ids.contains(parent)) { throw Error("validation_error", "Parent does not exist: " + parent, entityPath + "/parentId"); }
            parents[id].push_back(parent);
        }
        if (entity.contains("prefabId") && !prefabs.contains(entity.at("prefabId").get<std::string>())) { throw Error("validation_error", "Prefab does not exist", entityPath + "/prefabId"); }
        index(entity.at("behaviors"), entityPath + "/behaviors");
        for (const auto& behavior : entity.at("behaviors")) {
            if (!scripts.contains(behavior.at("scriptId").get<std::string>())) { throw Error("validation_error", "Behavior script does not exist", entityPath + "/behaviors"); }
        }
        for (const auto& asset : entity.at("assetIds")) {
            if (!assets.contains(asset.get<std::string>())) { throw Error("validation_error", "Asset does not exist", entityPath + "/assetIds"); }
        }
        if (!entity.at("transform").contains("x")) {
        double norm = 0;
        for (const auto& value : entity.at("transform").at("rotation")) { norm += value.get<double>() * value.get<double>(); }
        if (std::abs(norm - 1.0) > 0.0001) { throw Error("validation_error", "Rotation quaternion must be normalized", entityPath + "/transform/rotation"); }
        for (const auto& value : entity.at("transform").at("scale")) {
            if (value.get<double>() == 0) { throw Error("validation_error", "Scale must be nonzero", entityPath + "/transform/scale"); }
        }
        } else {
            const auto& transform = entity.at("transform");
            if (transform.at("scaleX") == 0 || transform.at("scaleY") == 0) { throw Error("validation_error", "Scale must be nonzero", entityPath + "/transform"); }
            for (const auto* axis : {"x", "y"}) {
                if (std::abs(transform.at(axis).get<double>()) > 1000000.) { throw Error("validation_error", "Physics coordinate exceeds supported range", entityPath + "/transform"); }
            }
        }
    }
    acyclic(parents, "Entity hierarchy");
    validatePhysics(entities, ids, path);
}
Json applyOverride(Json entity, const Json& overrides) {
    for (const auto& override : overrides) {
        if (override.at("entityId") != entity.at("id")) { continue; }
        for (auto field = override.begin(); field != override.end(); ++field) {
            if (field.key() == "entityId") { continue; }
            if (field.key() == "props") {
                for (auto property = field.value().begin(); property != field.value().end(); ++property) { entity["props"][property.key()] = property.value(); }
            } else { entity[field.key()] = field.value(); }
        }
    }
    return entity;
}
Json& find(Json& values, const std::string& id) {
    for (auto& value : values) { if (value.at("id") == id) { return value; } }
    throw Error("validation_error", "Resource does not exist: " + id);
}
void erase(Json& values, const std::string& id) {
    const auto found = std::find_if(values.begin(), values.end(), [&](const auto& value) { return value.at("id") == id; });
    if (found == values.end()) { throw Error("validation_error", "Resource does not exist: " + id); }
    values.erase(found);
}
void add(Json& values, const Json& value) {
    for (const auto& existing : values) { if (existing.at("id") == value.at("id")) { throw Error("validation_error", "Resource already exists"); } }
    values.push_back(value);
}
void set(Json& values, const Json& value) {
    for (auto& existing : values) { if (existing.at("id") == value.at("id")) { existing = value; return; } }
    values.push_back(value);
}
void operation(Json& candidate, const Json& op) {
    const auto kind = op.at("kind").get<std::string>();
    if (kind == "replaceDocument") {
        auto replacement = op.at("document");
        if (replacement.at("id") != candidate.at("id")) { throw Error("validation_error", "Cannot replace document identity"); }
        replacement["revision"] = candidate.at("revision"); candidate = std::move(replacement);
    } else if (kind == "addScene") { add(candidate["scenes"], op.at("scene")); }
    else if (kind == "removeScene") { erase(candidate["scenes"], op.at("sceneId")); }
    else if (kind == "addPrefab") { add(candidate["prefabs"], op.at("prefab")); }
    else if (kind == "removePrefab") { erase(candidate["prefabs"], op.at("prefabId")); }
    else if (kind == "setScript") { set(candidate["scripts"], op.at("script")); }
    else if (kind == "removeScript") { erase(candidate["scripts"], op.at("scriptId")); }
    else if (kind == "setAsset") { set(candidate["assets"], op.at("asset")); }
    else if (kind == "removeAsset") { erase(candidate["assets"], op.at("assetId")); }
    else if (kind == "setTitle") { candidate["title"] = op.at("title"); }
    else if (kind == "setInputActions") { candidate["inputActions"] = op.at("inputActions"); }
    else {
        auto& entities = find(candidate["scenes"], op.at("sceneId"))["entities"];
        if (kind == "addEntity") { add(entities, op.at("entity")); }
        else if (kind == "updateEntity") { find(entities, op.at("entity").at("id")) = op.at("entity"); }
        else if (kind == "removeEntity") { erase(entities, op.at("entityId")); }
        else if (kind == "cloneEntity") {
            auto entity = find(entities, op.at("entityId")); entity["id"] = op.at("newId"); add(entities, entity);
        } else { throw Error("validation_error", "Unsupported document operation"); }
    }
}
}
Json validateDocument(Json document) {
    document = normalizeSchema(documentSchema(), std::move(document));
    if (document.dump().size() > 4 * 1024 * 1024) { throw Error("resource_limit", "Normalized document exceeds 4 MiB budget"); }
    const auto scenes = index(document.at("scenes"), "/scenes");
    const auto prefabs = index(document.at("prefabs"), "/prefabs");
    const auto scripts = index(document.at("scripts"), "/scripts");
    const auto assets = index(document.at("assets"), "/assets");
    index(document.at("inputActions"), "/inputActions");
    if (!scenes.contains(document.at("initialSceneId").get<std::string>())) { throw Error("validation_error", "Initial scene does not exist", "/initialSceneId"); }
    for (const auto& asset : document.at("assets")) {
        const auto path = asset.at("path").get<std::string>();
        if (path.empty() || path.front() == '/' || path.find('\\') != std::string::npos || path.find(':') != std::string::npos) { throw Error("validation_error", "Asset path must be workspace-relative", "/assets"); }
        for (const auto& part : std::filesystem::path(path)) {
            if (part == ".." || part == ".") { throw Error("validation_error", "Asset path contains traversal", "/assets"); }
        }
    }
    std::unordered_map<std::string, std::vector<std::string>> dependencies;
    for (std::size_t i = 0; i < document.at("prefabs").size(); ++i) {
        const auto& prefab = document.at("prefabs")[i];
        validateEntities(prefab.at("entities"), prefabs, scripts, assets, "/prefabs/" + std::to_string(i) + "/entities");
        auto& edges = dependencies[prefab.at("id").get<std::string>()];
        for (const auto& entity : prefab.at("entities")) { if (entity.contains("prefabId")) { edges.push_back(entity.at("prefabId").get<std::string>()); } }
    }
    acyclic(dependencies, "Prefab dependency");
    std::unordered_map<std::string, Index> prefabEntityIndexes;
    for (const auto& prefab : document.at("prefabs")) { prefabEntityIndexes.emplace(prefab.at("id").get<std::string>(), index(prefab.at("entities"), "/prefabs")); }
    auto validateOverrides = [&](const Json& entities, const std::string& path) {
        for (const auto& entity : entities) {
            const auto& overrides = entity.at("prefabOverrides");
            if (overrides.empty()) { continue; }
            if (!entity.contains("prefabId")) { throw Error("validation_error", "Overrides require a prefab instance", path); }
            const auto& templateEntities = document.at("prefabs")[prefabs.at(entity.at("prefabId").get<std::string>())].at("entities");
            const auto& templateIds = prefabEntityIndexes.at(entity.at("prefabId").get<std::string>());
            std::unordered_set<std::string> targets;
            for (const auto& override : overrides) {
                const auto target = override.at("entityId").get<std::string>();
                if (!templateIds.contains(target)) { throw Error("validation_error", "Override target does not exist", path); }
                if (!targets.insert(target).second) { throw Error("validation_error", "Duplicate override target", path); }
                auto candidate = applyOverride(templateEntities[templateIds.at(target)], Json::array({override}));
                // Reference and transform validation is shared with ordinary entities.
                // Parent topology belongs to the intact template, not this field-only candidate.
                candidate.erase("parentId"); candidate["prefabOverrides"] = Json::array();
                validateEntities(Json::array({candidate}), prefabs, scripts, assets, path);
            }
        }
    };
    for (const auto& prefab : document.at("prefabs")) { validateOverrides(prefab.at("entities"), "/prefabs"); }
    for (const auto& scene : document.at("scenes")) { validateOverrides(scene.at("entities"), "/scenes"); }

    for (std::size_t i = 0; i < document.at("scenes").size(); ++i) { validateEntities(document.at("scenes")[i].at("entities"), prefabs, scripts, assets, "/scenes/" + std::to_string(i) + "/entities"); }
    if (document.at("dimension") == "2d") {
        const auto requireImage = [&](const Json& resource) {
            const auto id = resource.at("assetId").get<std::string>();
            if (!assets.contains(id) || document.at("assets")[assets.at(id)].at("kind") != "image") { throw Error("validation_error", "2D visual requires an image asset", "/assets"); }
        };
        for (const auto& background : document.at("backgrounds")) { requireImage(background); }
        for (const auto& scene : document.at("scenes")) {
            for (const auto& background : scene.value("backgrounds", Json::array())) { requireImage(background); }
        }
        for (const auto* collection : {"scenes", "prefabs"}) {
            for (const auto& group : document.at(collection)) {
                for (const auto& entity : group.at("entities")) {
                    for (const auto* component : {"sprite", "tilemap"}) { if (entity.contains(component)) { requireImage(entity.at(component)); } }
                }
            }
        }
    }
    if (document.contains("ui")) {
        if (!document.contains("presentation")) { throw Error("validation_error", "Widget UI requires presentation dimensions", "/presentation"); }
        std::map<std::string, std::string> preceding;
        for (const auto &node : document.at("ui").at("nodes")) {
            const auto id = node.at("id").get<std::string>();
            if (preceding.contains(id)) { throw Error("validation_error", "Duplicate UI node", "/ui/nodes"); }
            if (node.contains("parent")) {
                const auto parent = node.at("parent").get<std::string>();
                if (!preceding.contains(parent) || preceding.at(parent) != "panel") { throw Error("validation_error", "UI parent must be a preceding panel", "/ui/nodes/parent"); }
            }
            if (node.at("kind") != "text" && (!node.contains("width") || !node.contains("height"))) { throw Error("validation_error", "UI panels and bars require dimensions", "/ui/nodes"); }
            if (node.contains("fontId")) {
                const auto font = node.at("fontId").get<std::string>();
                if (!assets.contains(font) || document.at("assets")[assets.at(font)].at("kind") != "font") { throw Error("validation_error", "UI font requires a font asset", "/ui/nodes/fontId"); }
            }
            preceding.emplace(id, node.at("kind").get<std::string>());
        }
    }
    const auto healthTarget = document.value("healthEntityId", std::string{});
    bool healthTargetFound = healthTarget.empty();
    const auto camera = document.value("camera", Json::object());
    if (!camera.empty()) {
        if (camera.value("near", .05) >= camera.value("far", 10000.)) { throw Error("validation_error", "Camera far plane must exceed near plane", "/camera"); }
        if (camera.value("kind", std::string{}) == "firstPerson" &&
            (camera.at("minPitch") > camera.at("pitch") || camera.at("pitch") > camera.at("maxPitch"))) { throw Error("validation_error", "Invalid first-person camera pitch bounds", "/camera"); }
    }
    // Admission and every transaction must prove the scene is usable before commit.
    for (const auto& scene : document.at("scenes")) {
        const auto expanded = resolvePrefabs(document, scene.at("id").get<std::string>());
        validatePhysics(expanded, index(expanded, "/scenes/expanded"), "/scenes/expanded");
        if (document.at("dimension") == "3d") {
            const auto ids = index(expanded, "/scenes/expanded");
            std::vector<std::vector<std::size_t>> children(expanded.size());
            std::vector<bool> receiverHasModel(expanded.size(), false), visited(expanded.size(), false);
            for (std::size_t i = 0; i < expanded.size(); ++i) { if (expanded[i].contains("parentId")) { children[ids.at(expanded[i].at("parentId").get<std::string>())].push_back(i); } }
            for (std::size_t start = 0; start < expanded.size(); ++start) {
                std::vector<std::pair<std::size_t, bool>> pending{{start, false}};
                while (!pending.empty()) {
                    const auto [current, leaving] = pending.back(); pending.pop_back();
                    if (leaving) {
                        const auto &entity = expanded[current];
                        receiverHasModel[current] = entity.contains("visual") && entity.at("visual").at("kind") == "model";
                        for (const auto child : children[current]) { receiverHasModel[current] = receiverHasModel[current] || receiverHasModel[child]; }
                    } else if (!visited[current]) {
                        visited[current] = true; pending.emplace_back(current, true);
                        for (const auto child : children[current]) { pending.emplace_back(child, false); }
                    }
                }
            }
            std::size_t lights = 0, localShadows = 0, directionalShadows = 0, decals = 0, emitters = 0;
            for (const auto &entity : expanded) {
                const auto visual = entity.value("visual", Json::object());
                if ((entity.contains("light3d") || entity.contains("particles") || entity.contains("decal3d") || entity.contains("animator3d") || visual.contains("material") || visual.contains("castShadow") || visual.contains("receiveShadow")) && !scene.contains("environment")) { throw Error("validation_error", "Authored 3D presentation requires an explicit environment", "/scenes/environment"); }
                if (visual.value("kind", std::string{}) == "model") {
                    const auto asset = visual.at("assetId").get<std::string>();
                    if (!assets.contains(asset) || document.at("assets")[assets.at(asset)].at("kind") != "model") { throw Error("validation_error", "Model visual requires a model asset", "/scenes/expanded/visual/assetId"); }
                }
                if (entity.contains("light3d")) {
                    ++lights;
                    if (entity.at("light3d").at("kind") == "directional" && entity.at("light3d").value("castShadow", false)) { ++directionalShadows; }
                    if (entity.at("light3d").at("kind") == "point" && entity.at("light3d").value("castShadow", false)) { ++localShadows; }
                    if (!scene.contains("environment")) { throw Error("validation_error", "Authored 3D lights require an environment", "/scenes/environment"); }
                }
                if (entity.contains("particles")) { emitters += entity.at("particles").at("emitters").size(); index(entity.at("particles").at("emitters"), "/scenes/expanded/particles/emitters"); }
                if (entity.contains("decal3d")) {
                    ++decals;
                    const auto receiver = entity.at("decal3d").at("receiverId").get<std::string>();
                    if (!ids.contains(receiver) || !receiverHasModel[ids.at(receiver)]) { throw Error("validation_error", "Decal receiver must contain a model in this scene", "/scenes/expanded/decal3d/receiverId"); }
                    const auto image = entity.at("decal3d").at("assetId").get<std::string>();
                    if (!assets.contains(image) || document.at("assets")[assets.at(image)].at("kind") != "image") { throw Error("validation_error", "Decal requires an image asset", "/scenes/expanded/decal3d/assetId"); }
                }
                if (entity.contains("animator3d")) {
                    const auto &animator = entity.at("animator3d");
                    if (!entity.contains("visual") || entity.at("visual").at("kind") != "model" || animator.at("clips").size() > 64 || !animator.at("clips").contains(animator.at("initialClip").get<std::string>())) { throw Error("validation_error", "Model animator requires a valid initial clip", "/scenes/expanded/animator3d"); }
                }
            }
            if (lights > 32 || localShadows > 4 || directionalShadows > 1 || decals > 32 || emitters > 1024) { throw Error("resource_limit", "3D scene presentation budget exceeded", "/scenes/expanded"); }
            if (scene.contains("activeCameraId")) {
                const auto selected = scene.at("activeCameraId").get<std::string>();
                if (!ids.contains(selected) || !expanded[ids.at(selected)].contains("camera3d")) { throw Error("validation_error", "Active camera must name a camera3d entity", "/scenes/activeCameraId"); }
                const auto &projection = expanded[ids.at(selected)].at("camera3d").at("projection");
                if (projection.at("near").get<double>() >= projection.at("far").get<double>()) { throw Error("validation_error", "Camera far plane must exceed near plane", "/scenes/activeCameraId"); }
                const Json *cursor = &expanded[ids.at(selected)];
                while (true) {
                    if (cursor->contains("visual") && cursor->at("visual").value("cameraRelative", false)) { throw Error("validation_error", "Active camera cannot depend on a camera-relative branch", "/scenes/activeCameraId"); }
                    if (!cursor->contains("parentId")) { break; }
                    cursor = &expanded[ids.at(cursor->at("parentId").get<std::string>())];
                }
            }
            const Json fallbackCamera = {{"position", {0, 0, 0}}, {"target", {0, 0, -1}}, {"up", {0, 1, 0}}, {"fov", 60}};
            resolveVisualHierarchy3D(expanded, fallbackCamera, scene.value("activeCameraId", std::string{}));
            if (scene.contains("environment") && scene.at("environment").contains("sky") && scene.at("environment").at("sky").contains("sunEntityId")) {
                const auto sun = scene.at("environment").at("sky").at("sunEntityId").get<std::string>();
                if (!ids.contains(sun) || !expanded[ids.at(sun)].contains("light3d") || expanded[ids.at(sun)].at("light3d").at("kind") != "directional") { throw Error("validation_error", "Procedural sky sun must name a directional light", "/scenes/environment/sky/sunEntityId"); }
            }
        }
        bool cameraTargetFound = camera.value("kind", std::string{}) != "firstPerson";
        for (const auto &entity : expanded) {
            if (!cameraTargetFound && entity.at("id") == camera.at("targetId")) { cameraTargetFound = true; }
            if (entity.contains("visual") && entity.at("visual").value("cameraRelative", false)) {
                if (physical(entity) || entity.contains("parentId")) { throw Error("validation_error", "Camera-relative models must be nonphysical roots", "/scenes/expanded/visual/cameraRelative"); }
            }
        }
        if (!cameraTargetFound) { throw Error("validation_error", "First-person camera target does not exist in scene", "/camera/targetId"); }
        if (document.at("dimension") == "2d") {
            const auto gravity = scene.value("gravity", document.value("gravity", Json{{"x", 0}, {"y", -9.81}}));
            // Construct the same spatial backend before commit so resource limits,
            // translated coordinates and tile indexing cannot drift from admission.
            const World2D admitted(expanded, gravity);
        }
        for (const auto& entity : expanded) {
            if (entity.at("id") == healthTarget) { healthTargetFound = true; }
            if (document.at("dimension") == "2d") {
                for (const auto* field : {"sprite", "tilemap"}) {
                    if (entity.contains(field)) {
                        const auto id = entity.at(field).at("assetId").get<std::string>();
                        if (!assets.contains(id) || document.at("assets")[assets.at(id)].at("kind") != "image") { throw Error("validation_error", "Expanded 2D visual requires an image asset", "/assets"); }
                    }
                }
            }
        }
    }
    if (!healthTargetFound) { throw Error("validation_error", "Health entity does not exist", "/healthEntityId"); }
    return document;
}
Json resolvePrefabs(const Json& document, const std::string& sceneId) {
    const Json* selectedScene = nullptr;
    for (const auto& scene : document.at("scenes")) { if (scene.at("id") == sceneId) { selectedScene = &scene; break; } }
    if (!selectedScene) { throw Error("validation_error", "Scene does not exist: " + sceneId); }
    const auto& scene = *selectedScene;
    std::unordered_map<std::string, const Json*> prefabIndex;
    for (const auto& prefab : document.at("prefabs")) { prefabIndex.emplace(prefab.at("id").get<std::string>(), &prefab); }
    Json result = Json::array();
    std::vector<Json> pending;
    std::unordered_set<std::string> ids;
    std::size_t bytes = 0;
    std::size_t pendingBytes = 0;
    const std::size_t entityBudget = document.at("dimension") == "2d" ? 20000 : 100000;
    constexpr std::size_t byteBudget = 16 * 1024 * 1024;
    auto enqueue = [&](Json child) {
        const auto size = child.dump().size();
        if (size > byteBudget - pendingBytes) { throw Error("resource_limit", "Prefab expansion work exceeds 16 MiB budget"); }
        pendingBytes += size;
        pending.push_back(std::move(child));
    };
    for (auto it = scene.at("entities").rbegin(); it != scene.at("entities").rend(); ++it) { enqueue(*it); }
    while (!pending.empty()) {
        checkCancellation();
        auto entity = std::move(pending.back()); pending.pop_back();
        pendingBytes -= entity.dump().size();
        if (result.size() >= entityBudget) { throw Error("resource_limit", "Expanded scene exceeds entity budget"); }
        const auto id = entity.at("id").get<std::string>();
        if (!ids.insert(id).second) { throw Error("validation_error", "Expanded prefab identity collision: " + id); }
        if (entity.contains("prefabId")) {
            const auto prefabId = entity.at("prefabId").get<std::string>();
            const auto foundPrefab = prefabIndex.find(prefabId);
            if (foundPrefab == prefabIndex.end()) { throw Error("validation_error", "Prefab does not exist: " + prefabId); }
            const auto& prefab = *foundPrefab->second;
            Index overrides;
            for (std::size_t i = 0; i < entity.at("prefabOverrides").size(); ++i) { overrides.emplace(entity.at("prefabOverrides")[i].at("entityId").get<std::string>(), i); }
            if (prefab.at("entities").size() > entityBudget - result.size() - pending.size() - 1) {
                throw Error("resource_limit", "Expanded scene exceeds entity budget");
            }
            for (auto it = prefab.at("entities").rbegin(); it != prefab.at("entities").rend(); ++it) {
                const auto found = overrides.find(it->at("id").get<std::string>());
                auto child = found == overrides.end() ? *it : applyOverride(*it, Json::array({entity.at("prefabOverrides")[found->second]}));
                child["id"] = id + ":" + child.at("id").get<std::string>();
                child["parentId"] = child.contains("parentId") ? id + ":" + child.at("parentId").get<std::string>() : id;
                enqueue(std::move(child));
            }
            entity.erase("prefabId");
            entity["prefabOverrides"] = Json::array();
        }
        const auto entityBytes = entity.dump().size();
        if (entityBytes > byteBudget - bytes) { throw Error("resource_limit", "Expanded scene exceeds 16 MiB budget"); }
        bytes += entityBytes;
        result.push_back(std::move(entity));
    }
    return result;
}
Document::Document(Json document) : document_(validateDocument(std::move(document))) {}
void Document::checkRevision(std::uint64_t expected) const {
    if (document_.at("revision").get<std::uint64_t>() != expected) { throw Error("conflict", "Document revision changed"); }
}
Json Document::commit(Json candidate, const Json& operations, bool history) {
    candidate = validateDocument(std::move(candidate));
    const auto revision = document_.at("revision").get<std::uint64_t>();
    if (revision >= 9007199254740991ULL) { throw Error("resource_limit", "Revision exhausted"); }
    const Json inverse = Json::array({Json{{"kind", "replaceDocument"}, {"document", document_}}});
    checkCancellation();
    candidate["revision"] = revision + 1;
    if (history) { past_.push_back(document_);
        std::size_t bytes = 0;
        for (const auto& saved : past_) { bytes += saved.dump().size(); }
        while (past_.size() > 64 || (bytes > 8 * 1024 * 1024 && past_.size() > 1)) { bytes -= past_.front().dump().size(); past_.pop_front(); }
        future_.clear(); }
    document_ = std::move(candidate);
    return Json{{"document", document_}, {"revision", revision + 1}, {"operations", operations}, {"inverseOperations", inverse}};
}
Json Document::transact(const Json& transaction) {
    const auto normalized = normalizeSchema(transactionSchema(document_.value("dimension", std::string("3d"))), transaction);
    checkRevision(normalized.at("expectedRevision"));
    auto candidate = document_;
    for (const auto& op : normalized.at("operations")) { operation(candidate, op); }
    return commit(std::move(candidate), normalized.at("operations"), true);
}
Json Document::undo(std::uint64_t expectedRevision) {
    checkRevision(expectedRevision);
    if (past_.empty()) { throw Error("validation_error", "Nothing to undo"); }
    auto candidate = past_.back();
    auto result = commit(candidate, Json::array({Json{{"kind", "replaceDocument"}, {"document", candidate}}}), false);
    future_.push_back(result.at("inverseOperations")[0].at("document")); past_.pop_back(); return result;
}
Json Document::redo(std::uint64_t expectedRevision) {
    checkRevision(expectedRevision);
    if (future_.empty()) { throw Error("validation_error", "Nothing to redo"); }
    auto candidate = future_.back();
    auto result = commit(candidate, Json::array({Json{{"kind", "replaceDocument"}, {"document", candidate}}}), false);
    past_.push_back(result.at("inverseOperations")[0].at("document")); future_.pop_back(); return result;
}
}
