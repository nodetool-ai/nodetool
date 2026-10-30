#include "render/Decals3D.h"
#include <QVector3D>
#include <cmath>
#include <iostream>
#include <stdexcept>

using namespace nodetool::game;
namespace {
void require(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
void near(float actual, float expected, const char *message) {
  require(std::abs(actual - expected) < .0001F, message);
}
Matrix4 identity() { return {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1}; }
std::shared_ptr<PreparedModel> plane() {
  auto model = std::make_shared<PreparedModel>();
  model->source = Json::object();
  ModelPrimitive primitive;
  for (const auto &point : std::array<std::array<float, 3>, 4>{
           {{-2, -2, 0}, {2, -2, 0}, {2, 2, 0}, {-2, 2, 0}}}) {
    ModelVertex vertex;
    vertex.position = point;
    vertex.normal = {0, 0, 1};
    primitive.vertices.push_back(vertex);
  }
  primitive.indices = {0, 1, 2, 0, 2, 3};
  model->meshes = {{primitive}};
  model->nodes = {{identity(), {}, 0, -1}};
  model->roots = {0};
  return model;
}
Json decal(std::string id = "mark", std::string assetId = "image",
           int order = 0) {
  return {{"id", id},
          {"decal3d",
           {{"assetId", assetId},
            {"receiverId", "receiver"},
            {"size", {{"x", 1}, {"y", 1}, {"z", 1}}},
            {"opacity", .75},
            {"renderOrder", order}}}};
}
Json frame(Json marks = Json::array({decal()})) {
  Json entities =
      Json::array({{{"id", "receiver"},
                    {"visual", {{"kind", "model"}, {"assetId", "model"}}}}});
  Json order = Json::object();
  std::size_t next = 0;
  for (const auto &mark : marks) {
    entities.push_back(mark);
    order[mark.at("id").get<std::string>()] = next++;
  }
  return {{"entities", entities}, {"authoredOrder", order}};
}
float area(const std::vector<DecalVertex3D> &vertices) {
  float result = 0;
  for (std::size_t i = 0; i < vertices.size(); i += 3) {
    const auto &a = vertices[i], &b = vertices[i + 1], &c = vertices[i + 2];
    result +=
        QVector3D::crossProduct(QVector3D(b.x - a.x, b.y - a.y, b.z - a.z),
                                QVector3D(c.x - a.x, c.y - a.y, c.z - a.z))
            .length() *
        .5F;
  }
  return result;
}
template <class Action>
void drops(const Decals3D &decals, Action action, const std::string &message) {
  action();
  const bool rejected =
      std::any_of(decals.diagnostics().begin(), decals.diagnostics().end(),
                  [&](const auto &diagnostic) {
                    return diagnostic.find(message) != std::string::npos;
                  });
  require(rejected, message.c_str());
}
} // namespace
int main() {
  try {
    auto model = plane();
    auto models = std::make_shared<DecalModels3D>();
    models->emplace("model", model);
    DecalTransforms3D transforms{{"receiver", QMatrix4x4()},
                                 {"mark", QMatrix4x4()}};
    Decals3D decals;
    const auto input = frame();
    const auto &initial = decals.prepare(input, models, transforms);
    require(initial.size() == 1 && !initial[0].vertices->empty(),
            "projected planar geometry");
    near(area(*initial[0].vertices), 1, "projector clipping area");
    for (const auto &vertex : *initial[0].vertices) {
      require(std::abs(vertex.x) <= .5001F && std::abs(vertex.y) <= .5001F,
              "clipped vertices stay inside projector");
      near(vertex.u, .5F + vertex.x, "projector horizontal UV");
      near(vertex.v, .5F + vertex.y, "projector vertical UV");
      near(vertex.nz, 1, "receiver normal");
    }
    const auto vertices = initial[0].vertices;
    const auto revision = decals.revision(), builds = decals.projectionBuilds(),
               initialAggregateChecks = decals.aggregateChecks();
    for (int i = 0; i < 120; ++i) {
      decals.prepare(input, models, transforms);
    }
    require(decals.revision() == revision &&
                decals.projectionBuilds() == builds,
            "steady frame skips geometry rebuild");
    require(decals.lastWork().sourceTriangles == 0 &&
                decals.lastWork().candidateTriangles == 0,
            "steady frame skips triangle walks");
    require(decals.aggregateChecks() == initialAggregateChecks,
            "steady receiver revision skips aggregate validation");
    auto faded = input;
    faded["entities"][1]["decal3d"]["opacity"] = .25;
    require(decals.prepare(faded, models, transforms)[0].vertices == vertices,
            "opacity change reuses geometry");
    require(decals.projectionBuilds() == builds && decals.revision() > revision,
            "opacity changes draw revision only");
    transforms.at("mark").rotate(45, {0, 0, 1});
    near(area(*decals.prepare(input, models, transforms)[0].vertices), 1,
         "rotated projector clipping area");
    transforms.at("mark").setToIdentity();
    transforms.at("mark").scale(2, 1, 1);
    near(area(*decals.prepare(input, models, transforms)[0].vertices), 2,
         "projector world scale");
    transforms.at("mark").setToIdentity();
    transforms.at("receiver").scale(-1, 1, 1);
    const auto &mirrored =
        *decals.prepare(input, models, transforms)[0].vertices;
    for (std::size_t i = 0; i < mirrored.size(); i += 3) {
      const auto &a = mirrored[i], &b = mirrored[i + 1], &c = mirrored[i + 2];
      require(QVector3D::crossProduct({b.x - a.x, b.y - a.y, b.z - a.z},
                                      {c.x - a.x, c.y - a.y, c.z - a.z})
                      .z() >= 0,
              "negative receiver scale preserves front-face winding");
    }
    auto missingNormals = plane();
    for (auto &vertex : missingNormals->meshes[0][0].vertices) {
      vertex.normal = {0, 0, 0};
    }
    models->at("model") = missingNormals;
    for (const auto &vertex :
         *decals.prepare(input, models, transforms)[0].vertices) {
      near(vertex.nz, 1,
           "missing normal generation preserves mirrored receiver orientation");
    }
    models->at("model") = model;
    transforms.at("receiver").setToIdentity();
    model->nodes[0].local[12] = 2;
    model->nodes[0].local[13] = 3;
    transforms.at("receiver").translate(-2, -3, 0);
    // Prepared model identity is immutable in production. Replacement
    // invalidates the cache.
    auto replacement = std::make_shared<PreparedModel>(*model);
    models->at("model") = replacement;
    near(area(*decals.prepare(input, models, transforms)[0].vertices), 1,
         "receiver node hierarchy transformation");
    transforms.at("receiver").setToIdentity();
    models->at("model") = plane();
    auto grouped = input;
    grouped["entities"][0].erase("visual");
    grouped["entities"].push_back(
        {{"id", "model-child"},
         {"visual", {{"kind", "model"}, {"assetId", "model"}}}});
    transforms.emplace("model-child", QMatrix4x4());
    Json authored = {
        {"initialSceneId", "scene"},
        {"scenes",
         Json::array(
             {{{"id", "scene"},
               {"entities", Json::array({{{"id", "receiver"}},
                                         {{"id", "model-child"},
                                          {"parentId", "receiver"}}})}}})}};
    near(area(*decals.prepare(grouped, models, transforms, &authored)[0]
                   .vertices),
         1, "authored document restores baked receiver child grouping");
    transforms.emplace("z", QMatrix4x4());
    transforms.emplace("a", QMatrix4x4());
    auto ordering =
        frame(Json::array({decal("z", "late"), decal("a", "early")}));
    ordering["authoredOrder"] = {{"z", 1}, {"a", 0}};
    const auto &ordered = decals.prepare(ordering, models, transforms);
    require(ordered[0].entityId == "a" && ordered[1].entityId == "z",
            "authored order breaks decal layer ties");
    ordering["entities"][1]["decal3d"]["renderOrder"] = 2;
    require(decals.prepare(ordering, models, transforms)[1].entityId == "z",
            "explicit overlap order");
    auto missing = input;
    missing["entities"][1]["decal3d"]["receiverId"] = "missing";
    drops(
        decals, [&] { decals.prepare(missing, models, transforms); },
        "receiver entity is missing");
    auto skinned = plane();
    skinned->nodes[0].skin = 0;
    models->at("model") = skinned;
    drops(
        decals, [&] { decals.prepare(input, models, transforms); }, "skinning");
    auto transparent = plane();
    transparent->source = {
        {"materials", Json::array({{{"alphaMode", "MASK"}}})}};
    models->at("model") = transparent;
    drops(
        decals, [&] { decals.prepare(input, models, transforms); },
        "alpha masking");
    auto animated = plane();
    animated->animations.push_back({});
    models->at("model") = animated;
    drops(
        decals, [&] { decals.prepare(input, models, transforms); },
        "without animation");
    auto dense = plane();
    dense->meshes[0][0].indices.clear();
    for (std::size_t i = 0; i < DecalLimits3D.candidateTriangles + 1; ++i) {
      dense->meshes[0][0].indices.insert(dense->meshes[0][0].indices.end(),
                                         {0, 1, 2});
    }
    models->at("model") = dense;
    drops(
        decals, [&] { decals.prepare(input, models, transforms); },
        "candidate triangle");
    const auto failedBuilds = decals.projectionBuilds();
    const auto diagnosticCount = decals.diagnostics().size();
    for (int i = 0; i < 120; ++i) {
      require(decals.prepare(input, models, transforms).empty(),
              "intrinsic failure stays a nonfatal drop");
    }
    require(decals.projectionBuilds() == failedBuilds &&
                decals.lastWork().candidateTriangles == 0,
            "intrinsic failure cache skips repeated triangle work");
    require(decals.diagnostics().size() == diagnosticCount,
            "diagnostics deduplicate steady failures");
    auto huge = plane();
    auto &hugePrimitive = huge->meshes[0][0];
    hugePrimitive.vertices.resize(7);
    hugePrimitive.vertices[4].position = {100, 100, 0};
    hugePrimitive.vertices[5].position = {101, 100, 0};
    hugePrimitive.vertices[6].position = {100, 101, 0};
    hugePrimitive.indices = {0, 1, 2};
    for (std::size_t i = 0; i < NativeDecalReceiverTriangleLimit3D; ++i) {
      hugePrimitive.indices.insert(hugePrimitive.indices.end(), {4, 5, 6});
    }
    models->at("model") = huge;
    drops(
        decals,
        [&] {
          require(decals.prepare(input, models, transforms).empty(),
                  "large receiver tiny projector rejects before broadphase");
        },
        "aggregate receiver triangle cap");
    require(decals.lastWork().sourceTriangles == 0 &&
                decals.lastWork().candidateTriangles == 0,
            "aggregate restriction precedes broadphase triangle work");
    const auto hugeAggregateChecks = decals.aggregateChecks();
    for (int i = 0; i < 120; ++i) {
      decals.prepare(input, models, transforms);
    }
    require(decals.aggregateChecks() == hugeAggregateChecks,
            "large receiver rejection is cached");
    auto split = std::make_shared<PreparedModel>(*huge);
    split->meshes[0].clear();
    ModelPrimitive first = hugePrimitive;
    first.indices = {0, 1, 2};
    split->meshes[0].push_back(std::move(first));
    for (std::size_t offset = 3; offset < hugePrimitive.indices.size();) {
      ModelPrimitive part = hugePrimitive;
      const auto end = std::min(hugePrimitive.indices.size(), offset + 200001);
      part.indices.assign(hugePrimitive.indices.begin() + offset,
                          hugePrimitive.indices.begin() + end);
      split->meshes[0].push_back(std::move(part));
      offset = end;
    }
    models->at("model") = split;
    require(decals.prepare(input, models, transforms).empty(),
            "lossless mesh partition preserves aggregate restriction");
    require(decals.lastWork().sourceTriangles == 0,
            "partitioned restriction also precedes broadphase");
    auto distant = plane();
    auto &distantPrimitive = distant->meshes[0][0];
    distantPrimitive.vertices.resize(6);
    distantPrimitive.vertices[3].position = {100, 100, 0};
    distantPrimitive.vertices[4].position = {101, 100, 0};
    distantPrimitive.vertices[5].position = {100, 101, 0};
    distantPrimitive.indices = {0, 1, 2};
    for (std::size_t i = 1; i < 50000; ++i) {
      distantPrimitive.indices.insert(distantPrimitive.indices.end(),
                                      {3, 4, 5});
    }
    models->at("model") = distant;
    Json sourceMarks = Json::array();
    for (int i = 0; i < 5; ++i) {
      const auto id = "source-" + std::to_string(i);
      sourceMarks.push_back(decal(id));
      transforms.emplace(id, QMatrix4x4());
    }
    drops(
        decals, [&] { decals.prepare(frame(sourceMarks), models, transforms); },
        "source triangle");
    auto nodes = plane();
    nodes->nodes.resize(DecalLimits3D.nodes + 1,
                        ModelNode{identity(), {}, -1, -1});
    nodes->nodes[0].mesh = -1;
    for (std::size_t i = 0; i + 1 < nodes->nodes.size(); ++i) {
      nodes->nodes[i].children = {int(i + 1)};
    }
    models->at("model") = nodes;
    drops(
        decals, [&] { decals.prepare(input, models, transforms); },
        "receiver node");
    models->at("model") = plane();
    Json manyMarks = Json::array();
    for (int i = 0; i < 33; ++i) {
      const auto id = "mark-" + std::to_string(i);
      manyMarks.push_back(decal(id));
      transforms.emplace(id, QMatrix4x4());
    }
    drops(
        decals, [&] { decals.prepare(frame(manyMarks), models, transforms); },
        "count limit");
    models->at("model") = plane();
    decals.prepare(input, models, transforms);
    auto removed = input;
    removed["entities"].erase(removed["entities"].begin() + 1);
    require(decals.prepare(removed, models, transforms).empty(),
            "despawn releases cached decal");
    for (int i = 0; i < 100; ++i) {
      auto invalid = decal("invalid-" + std::to_string(i));
      invalid["decal3d"]["receiverId"] = "missing";
      decals.prepare(frame(Json::array({invalid})), models, transforms);
    }
    require(decals.diagnostics().size() == 64, "diagnostics stay bounded");
    decals.clear();
    require(decals.lastWork().outputVertices == 0,
            "clear resets work and resources");
    require(decals.diagnostics().empty(), "clear resets diagnostics");
    std::cout << "Decal geometry clipping, transforms, ordering, cache and "
                 "limits passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
