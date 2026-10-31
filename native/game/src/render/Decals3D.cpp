#include "Decals3D.h"
#include <QQuaternion>
#include <QVector3D>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <set>
#include <span>
#include <utility>

namespace nodetool::game {
namespace {
struct Bounds {
  QVector3D low{std::numeric_limits<float>::max(),
                std::numeric_limits<float>::max(),
                std::numeric_limits<float>::max()};
  QVector3D high{-std::numeric_limits<float>::max(),
                 -std::numeric_limits<float>::max(),
                 -std::numeric_limits<float>::max()};
  void add(QVector3D point) {
    for (int axis = 0; axis < 3; ++axis) {
      low[axis] = std::min(low[axis], point[axis]);
      high[axis] = std::max(high[axis], point[axis]);
    }
  }
  bool intersects(const Bounds &other) const {
    for (int axis = 0; axis < 3; ++axis) {
      if (high[axis] < other.low[axis] || low[axis] > other.high[axis]) {
        return false;
      }
    }
    return true;
  }
};
struct Projector {
  QMatrix4x4 world, inverse;
  QVector3D size;
  Bounds bounds;
};
struct ClipVertex {
  QVector3D point, normal;
};
void require(bool condition, const std::string &message) {
  if (!condition) {
    throw Error("render", "Decal projection: " + message);
  }
}
void budget(std::size_t count, std::size_t limit, const char *name) {
  if (count > limit) {
    throw Error("resource_limit",
                std::string("Scene decal ") + name + " work limit exceeded");
  }
}
QMatrix4x4 matrix(const Matrix4 &value) {
  return QMatrix4x4(value.data()).transposed();
}
Json matrixKey(const QMatrix4x4 &value) {
  Json result = Json::array();
  for (const auto component : std::span(value.constData(), 16)) {
    require(std::isfinite(component), "transform must be finite");
    result.push_back(component);
  }
  return result;
}
Bounds transformedBounds(const Bounds &local, const QMatrix4x4 &transform) {
  Bounds result;
  for (int corner = 0; corner < 8; ++corner) {
    result.add(transform.map({corner & 1 ? local.high.x() : local.low.x(),
                              corner & 2 ? local.high.y() : local.low.y(),
                              corner & 4 ? local.high.z() : local.low.z()}));
  }
  return result;
}
Projector projector(const QMatrix4x4 &transform, const Json &settings) {
  require(std::abs(transform.determinant()) > 1e-12F,
          "projector transform is singular");
  QVector3D scale;
  for (int axis = 0; axis < 3; ++axis) {
    scale[axis] = transform.column(axis).toVector3D().length();
  }
  if (transform.determinant() < 0) {
    scale[0] = -scale[0];
  }
  QMatrix3x3 rotation;
  for (int row = 0; row < 3; ++row) {
    for (int column = 0; column < 3; ++column) {
      rotation(row, column) = transform(row, column) / scale[column];
    }
  }
  Projector result;
  result.world.translate(transform.column(3).toVector3D());
  result.world.rotate(QQuaternion::fromRotationMatrix(rotation).normalized());
  result.inverse = result.world.inverted();
  const auto &size = settings.at("size");
  result.size = {size.at("x").get<float>() * std::abs(scale.x()),
                 size.at("y").get<float>() * std::abs(scale.y()),
                 size.at("z").get<float>() * std::abs(scale.z())};
  for (int axis = 0; axis < 3; ++axis) {
    require(std::isfinite(result.size[axis]) && result.size[axis] > 0 &&
                result.size[axis] <= 1000000,
            "world extents must be positive and at most 1000000 units");
  }
  Bounds local;
  local.add(-result.size * .5F);
  local.add(result.size * .5F);
  result.bounds = transformedBounds(local, result.world);
  return result;
}
QVector3D normal(const QMatrix4x4 &transform, QVector3D source) {
  const auto matrix = transform.normalMatrix();
  return QVector3D(matrix(0, 0) * source.x() + matrix(0, 1) * source.y() +
                       matrix(0, 2) * source.z(),
                   matrix(1, 0) * source.x() + matrix(1, 1) * source.y() +
                       matrix(1, 2) * source.z(),
                   matrix(2, 0) * source.x() + matrix(2, 1) * source.y() +
                       matrix(2, 2) * source.z())
      .normalized();
}
std::vector<ClipVertex> clip(std::vector<ClipVertex> input, int axis,
                             float sign, float extent) {
  if (input.empty()) {
    return {};
  }
  std::vector<ClipVertex> output;
  output.reserve(input.size() + 1);
  auto previous = input.back();
  auto previousDistance = sign * previous.point[axis] - extent;
  for (const auto &current : input) {
    const auto distance = sign * current.point[axis] - extent;
    if ((distance <= 0) != (previousDistance <= 0)) {
      const float t = previousDistance / (previousDistance - distance);
      output.push_back(
          {previous.point + (current.point - previous.point) * t,
           previous.normal + (current.normal - previous.normal) * t});
    }
    if (distance <= 0) {
      output.push_back(current);
    }
    previous = current;
    previousDistance = distance;
  }
  require(output.size() <= 16, "clipped polygon exceeds vertex limit");
  return output;
}
void projectPrimitive(const ModelPrimitive &primitive, const QMatrix4x4 &world,
                      const Projector &projection, DecalWork3D &work,
                      std::vector<DecalVertex3D> &vertices) {
  Bounds localBounds;
  for (const auto &vertex : primitive.vertices) {
    localBounds.add(
        {vertex.position[0], vertex.position[1], vertex.position[2]});
  }
  if (primitive.vertices.empty() ||
      !transformedBounds(localBounds, world).intersects(projection.bounds)) {
    return;
  }
  require(std::abs(world.determinant()) > 1e-12F,
          "receiver transform is singular");
  const auto count = primitive.indices.empty() ? primitive.vertices.size()
                                               : primitive.indices.size();
  for (std::size_t offset = 0; offset + 2 < count; offset += 3) {
    budget(++work.sourceTriangles, DecalLimits3D.sourceTriangles,
           "source triangle");
    std::array<const ModelVertex *, 3> source{};
    std::array<QVector3D, 3> points;
    Bounds bounds;
    for (std::size_t corner = 0; corner < 3; ++corner) {
      const auto index = primitive.indices.empty()
                             ? offset + corner
                             : primitive.indices.at(offset + corner);
      source[corner] = &primitive.vertices.at(index);
      const auto &position = source[corner]->position;
      points[corner] = world.map({position[0], position[1], position[2]});
      bounds.add(points[corner]);
    }
    if (!bounds.intersects(projection.bounds)) {
      continue;
    }
    budget(++work.candidateTriangles, DecalLimits3D.candidateTriangles,
           "candidate triangle");
    std::vector<ClipVertex> polygon;
    polygon.reserve(3);
    const auto sourcePoint = [&](std::size_t index) {
      const auto &point = source[index]->position;
      return QVector3D(point[0], point[1], point[2]);
    };
    const auto faceNormal =
        normal(world, QVector3D::normal(sourcePoint(1) - sourcePoint(0),
                                        sourcePoint(2) - sourcePoint(0)));
    for (std::size_t corner = 0; corner < 3; ++corner) {
      const auto &n = source[corner]->normal;
      QVector3D transformed = normal(world, {n[0], n[1], n[2]});
      if (transformed.isNull()) {
        transformed = faceNormal;
      }
      polygon.push_back({projection.inverse.map(points[corner]), transformed});
    }
    for (int axis = 0; axis < 3 && !polygon.empty(); ++axis) {
      polygon = clip(std::move(polygon), axis, 1, projection.size[axis] * .5F);
      polygon = clip(std::move(polygon), axis, -1, projection.size[axis] * .5F);
    }
    if (polygon.size() < 3) {
      continue;
    }
    const auto append = [&](const ClipVertex &vertex) {
      budget(++work.outputVertices, DecalLimits3D.outputVertices,
             "output vertex");
      const auto point = projection.world.map(vertex.point);
      vertices.push_back({point.x(), point.y(), point.z(), vertex.normal.x(),
                          vertex.normal.y(), vertex.normal.z(),
                          .5F + vertex.point.x() / projection.size.x(),
                          .5F + vertex.point.y() / projection.size.y()});
    };
    for (std::size_t corner = 1; corner + 1 < polygon.size(); ++corner) {
      append(polygon[0]);
      append(polygon[world.determinant() < 0 ? corner + 1 : corner]);
      append(polygon[world.determinant() < 0 ? corner : corner + 1]);
    }
  }
}
struct Receiver {
  std::shared_ptr<const PreparedModel> model;
  QMatrix4x4 world;
};
void checkReceiverTriangles(const std::vector<Receiver> &receivers) {
  std::size_t triangles = 0, nodes = 0;
  for (const auto &receiver : receivers) {
    const auto &model = *receiver.model;
    std::vector<int> pending(model.roots.begin(), model.roots.end());
    std::set<int> visited;
    while (!pending.empty()) {
      const auto index = pending.back();
      pending.pop_back();
      budget(++nodes, DecalLimits3D.nodes, "receiver node");
      require(index >= 0 && std::size_t(index) < model.nodes.size() &&
                  visited.insert(index).second,
              "receiver node hierarchy is invalid");
      const auto &node = model.nodes.at(index);
      pending.insert(pending.end(), node.children.begin(), node.children.end());
      if (node.mesh < 0) {
        continue;
      }
      for (const auto &primitive : model.meshes.at(node.mesh)) {
        if (primitive.material >= 0) {
          const auto &material = model.materials.at(primitive.material);
          if (material.alphaMode != "OPAQUE" || material.color[3] < 1) {
            continue;
          }
        }
        const auto count =
            (primitive.indices.empty() ? primitive.vertices.size()
                                       : primitive.indices.size()) /
            3;
        if (count > NativeDecalReceiverTriangleLimit3D - triangles) {
          throw Error(
              "resource_limit",
              "Native decal aggregate receiver triangle cap exceeded (200000)");
        }
        triangles += count;
      }
    }
  }
}
void projectReceiver(const Receiver &receiver, const Projector &projection,
                     DecalWork3D &work, std::vector<DecalVertex3D> &vertices) {
  const auto &model = *receiver.model;
  require(model.animations.empty(),
          "receivers must be static rigid models without animation");
  for (const auto &node : model.source.value("nodes", Json::array())) {
    require(!node.value("extensions", Json::object())
                 .contains("EXT_mesh_gpu_instancing"),
            "receivers must not use instancing");
  }
  for (const auto &mesh : model.source.value("meshes", Json::array())) {
    for (const auto &primitive : mesh.value("primitives", Json::array())) {
      require(!primitive.contains("targets"),
              "receivers must not have morph targets");
    }
  }
  for (const auto &material : model.source.value("materials", Json::array())) {
    require(material.value("alphaMode", std::string("OPAQUE")) == "OPAQUE",
            "receivers must use opaque materials without alpha masking");
  }
  struct Pending {
    int node;
    QMatrix4x4 parent;
  };
  std::vector<Pending> pending;
  for (auto root = model.roots.rbegin(); root != model.roots.rend(); ++root) {
    pending.push_back({*root, receiver.world});
  }
  std::set<int> visited;
  while (!pending.empty()) {
    const auto current = pending.back();
    pending.pop_back();
    budget(++work.nodes, DecalLimits3D.nodes, "receiver node");
    require(current.node >= 0 &&
                std::size_t(current.node) < model.nodes.size() &&
                visited.insert(current.node).second,
            "receiver node hierarchy is invalid");
    const auto &node = model.nodes.at(current.node);
    require(node.skin < 0, "receivers must not use skinning");
    const auto world = current.parent * matrix(node.local);
    for (auto child = node.children.rbegin(); child != node.children.rend();
         ++child) {
      pending.push_back({*child, world});
    }
    if (node.mesh < 0) {
      continue;
    }
    for (const auto &primitive : model.meshes.at(node.mesh)) {
      if (primitive.material >= 0) {
        require(model.materials.at(primitive.material).color[3] >= 1,
                "receiver materials must be fully opaque");
      }
      projectPrimitive(primitive, world, projection, work, vertices);
    }
  }
}
} // namespace
struct Decals3D::State {
  struct Eligibility {
    std::vector<std::shared_ptr<const PreparedModel>> models;
    std::string code, error;
  };
  struct Entry {
    Json key;
    std::shared_ptr<const std::vector<DecalVertex3D>> vertices;
    std::vector<std::shared_ptr<const PreparedModel>> models;
    bool failed = false;
  };
  std::map<std::string, Entry> entries;
  std::map<std::string, Eligibility> eligibility;
  std::vector<DecalBatch3D> batches;
  std::size_t revision = 0, builds = 0, aggregateChecks = 0;
  DecalWork3D work;
  std::vector<std::string> diagnostics;
  std::set<std::string> reported;
};
Decals3D::Decals3D() : state_(std::make_unique<State>()) {}
Decals3D::~Decals3D() = default;
std::size_t Decals3D::revision() const { return state_->revision; }
std::size_t Decals3D::projectionBuilds() const { return state_->builds; }
std::size_t Decals3D::aggregateChecks() const {
  return state_->aggregateChecks;
}
DecalWork3D Decals3D::lastWork() const { return state_->work; }
const std::vector<std::string> &Decals3D::diagnostics() const {
  return state_->diagnostics;
}
void Decals3D::clear() {
  state_->entries.clear();
  state_->eligibility.clear();
  state_->batches.clear();
  state_->work = {};
  state_->diagnostics.clear();
  state_->reported.clear();
  ++state_->revision;
}
const std::vector<DecalBatch3D> &Decals3D::prepare(
    const Json &frame, const std::shared_ptr<const DecalModels3D> &models,
    const DecalTransforms3D &worldTransforms, const Json *document) {
  auto &state = *state_;
  std::map<std::string, const Json *> entities;
  std::map<std::string, std::vector<std::string>> children;
  for (const auto &entity : frame.at("entities")) {
    const auto id = entity.at("id").get<std::string>();
    entities.emplace(id, &entity);
    if (entity.contains("parentId")) {
      children[entity.at("parentId").get<std::string>()].push_back(id);
    }
  }
  if (document) {
    const auto sceneId = frame.value(
        "sceneId", document->value("initialSceneId", std::string()));
    for (const auto &scene : document->value("scenes", Json::array())) {
      if (scene.at("id") != sceneId) {
        continue;
      }
      for (const auto &entity : scene.at("entities")) {
        const auto id = entity.at("id").get<std::string>();
        if (!entity.contains("parentId") || !entities.contains(id) ||
            entities.at(id)->contains("parentId")) {
          continue;
        }
        children[entity.at("parentId").get<std::string>()].push_back(id);
      }
      break;
    }
  }
  state.work = {};
  auto nextEntries = state.entries;
  std::set<std::string> present;
  std::set<std::string> presentReceivers;
  std::vector<DecalBatch3D> next;
  const auto report = [&](const std::string &message) {
    if (state.reported.size() < 64 && state.reported.insert(message).second) {
      state.diagnostics.push_back(message);
    }
  };
  std::vector<const Json *> projectors;
  for (const auto &entity : frame.at("entities")) {
    if (entity.contains("decal3d")) {
      projectors.push_back(&entity);
    }
  }
  std::stable_sort(projectors.begin(), projectors.end(),
                   [&](const auto *a, const auto *b) {
                     return frame.at("authoredOrder")
                                .at(a->at("id").template get<std::string>())
                                .template get<std::size_t>() <
                            frame.at("authoredOrder")
                                .at(b->at("id").template get<std::string>())
                                .template get<std::size_t>();
                   });
  if (projectors.size() > 32) {
    report("Scene decal count limit exceeded");
    projectors.resize(32);
  }
  for (const auto *definition : projectors) {
    const auto &entity = *definition;
    const auto id = entity.at("id").get<std::string>();
    present.insert(id);
    Json key;
    std::vector<std::shared_ptr<const PreparedModel>> owners;
    const auto before = state.work;
    try {
      const auto &settings = entity.at("decal3d");
      const auto receiverId = settings.at("receiverId").get<std::string>();
      presentReceivers.insert(receiverId);
      require(entities.contains(receiverId),
              "receiver entity is missing: " + receiverId);
      require(worldTransforms.contains(id),
              "projector world transform is missing: " + id);
      std::vector<Receiver> receivers;
      key = {{"size", settings.at("size")},
             {"projector", matrixKey(worldTransforms.at(id))},
             {"receiver", receiverId},
             {"sources", Json::array()}};
      std::vector<std::string> pending{receiverId};
      std::set<std::string> visited;
      while (!pending.empty()) {
        const auto current = pending.back();
        pending.pop_back();
        require(visited.insert(current).second, "receiver entity parent cycle");
        require(visited.size() <= DecalLimits3D.nodes,
                "receiver entity hierarchy exceeds node limit");
        const auto &definition = *entities.at(current);
        const auto foundChildren = children.find(current);
        if (foundChildren != children.end()) {
          for (auto child = foundChildren->second.rbegin();
               child != foundChildren->second.rend(); ++child) {
            pending.push_back(*child);
          }
        }
        if (!definition.contains("visual")) {
          continue;
        }
        const auto &visual = definition.at("visual");
        require(visual.at("kind") == "model",
                "receivers must use prepared rigid models");
        require(!visual.value("cameraRelative", false),
                "receivers cannot be camera relative");
        require(bool(models), "prepared model cache is unavailable");
        const auto modelId = visual.at("assetId").get<std::string>();
        const auto model = models->find(modelId);
        require(model != models->end() && bool(model->second),
                "receiver model is not prepared: " + modelId);
        require(worldTransforms.contains(current),
                "receiver world transform is missing: " + current);
        receivers.push_back({model->second, worldTransforms.at(current)});
        owners.push_back(model->second);
        key["sources"].push_back(
            {{"model", modelId},
             {"identity",
              reinterpret_cast<std::uintptr_t>(model->second.get())},
             {"world", matrixKey(worldTransforms.at(current))}});
      }
      require(!receivers.empty(), "receiver has no rigid model meshes");
      auto previous = nextEntries.find(id);
      if (previous != nextEntries.end() && previous->second.key == key &&
          previous->second.failed) {
        continue;
      }
      if (previous == nextEntries.end() || previous->second.key != key) {
        auto eligibility = state.eligibility.find(receiverId);
        if (eligibility == state.eligibility.end() ||
            eligibility->second.models != owners) {
          State::Eligibility checked{owners, {}, {}};
          ++state.aggregateChecks;
          try {
            checkReceiverTriangles(receivers);
          } catch (const Error &error) {
            checked.code = error.code;
            checked.error = error.what();
          }
          eligibility =
              state.eligibility.insert_or_assign(receiverId, std::move(checked))
                  .first;
        }
        if (!eligibility->second.error.empty()) {
          throw Error(eligibility->second.code, eligibility->second.error);
        }
        auto vertices = std::make_shared<std::vector<DecalVertex3D>>();
        ++state.builds;
        for (const auto &receiver : receivers) {
          projectReceiver(receiver, projector(worldTransforms.at(id), settings),
                          state.work, *vertices);
        }
        previous = nextEntries
                       .insert_or_assign(id, State::Entry{std::move(key),
                                                          std::move(vertices),
                                                          std::move(owners)})
                       .first;
      } else {
        state.work.outputVertices += previous->second.vertices->size();
        budget(state.work.outputVertices, DecalLimits3D.outputVertices,
               "output vertex");
      }
      const auto authoredOrder =
          frame.at("authoredOrder").at(id).get<std::size_t>();
      next.push_back({id, settings.at("assetId").get<std::string>(),
                      settings.value("opacity", 1.F),
                      settings.value("renderOrder", 0), authoredOrder,
                      previous->second.vertices});
    } catch (const Error &error) {
      if (error.code != "render" && error.code != "resource_limit") {
        throw;
      }
      nextEntries.erase(id);
      // A failure that exhausts an otherwise unused budget is intrinsic to
      // this immutable projector/receiver pair. Do not rescan it every frame.
      if (!key.is_null() && !owners.empty() && before.nodes == 0 &&
          before.sourceTriangles == 0 && before.candidateTriangles == 0 &&
          before.outputVertices == 0) {
        nextEntries.emplace(
            id,
            State::Entry{std::move(key),
                         std::make_shared<const std::vector<DecalVertex3D>>(),
                         std::move(owners), true});
      }
      report("Decal " + id + ": " + error.what());
    }
  }
  std::erase_if(nextEntries, [&](const auto &entry) {
    return !present.contains(entry.first);
  });
  state.entries = std::move(nextEntries);
  std::erase_if(state.eligibility, [&](const auto &entry) {
    return !presentReceivers.contains(entry.first);
  });
  std::stable_sort(next.begin(), next.end(), [](const auto &a, const auto &b) {
    return a.renderOrder == b.renderOrder ? a.authoredOrder < b.authoredOrder
                                          : a.renderOrder < b.renderOrder;
  });
  const bool changed =
      next.size() != state.batches.size() ||
      !std::equal(next.begin(), next.end(), state.batches.begin(),
                  [](const auto &a, const auto &b) {
                    return a.entityId == b.entityId && a.assetId == b.assetId &&
                           a.opacity == b.opacity &&
                           a.renderOrder == b.renderOrder &&
                           a.authoredOrder == b.authoredOrder &&
                           a.vertices == b.vertices;
                  });
  if (changed) {
    state.batches = std::move(next);
    ++state.revision;
  }
  return state.batches;
}
} // namespace nodetool::game
