#include "VisualHierarchy3D.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <map>
#include <vector>

namespace nodetool::game {
namespace {
using Vector = std::array<double, 3>;
using Quaternion = std::array<double, 4>;
struct Pose {
  Vector position{0, 0, 0}, scale{1, 1, 1};
  Quaternion rotation{0, 0, 0, 1};
};
template<std::size_t Size>
std::array<double, Size> numbers(const Json &value) {
  if (!value.is_array() || value.size() != Size) { throw Error("validation_error", "Invalid visual transform tuple"); }
  std::array<double, Size> result;
  for (std::size_t i = 0; i < Size; ++i) {
    if (!value[i].is_number() || !std::isfinite(value[i].get<double>())) { throw Error("validation_error", "Visual transforms must be finite"); }
    result[i] = value[i].get<double>();
  }
  return result;
}
Quaternion multiply(const Quaternion &a, const Quaternion &b) {
  return {a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]};
}
Vector rotate(const Quaternion &q, const Vector &p) {
  const double x = 2 * (q[1]*p[2]-q[2]*p[1]), y = 2 * (q[2]*p[0]-q[0]*p[2]), z = 2 * (q[0]*p[1]-q[1]*p[0]);
  return {p[0]+q[3]*x+q[1]*z-q[2]*y, p[1]+q[3]*y+q[2]*x-q[0]*z, p[2]+q[3]*z+q[0]*y-q[1]*x};
}
Vector cross(const Vector &a, const Vector &b) { return {a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]}; }
Vector unit(Vector value, const Vector &fallback) {
  const double length = std::hypot(value[0], value[1], value[2]);
  if (!std::isfinite(length)) { throw Error("resource_limit", "Camera basis overflow"); }
  if (length < 1e-12) { return fallback; }
  for (auto &component : value) { component /= length; }
  return value;
}
Pose localPose(const Json &entity) {
  const auto &transform = entity.at("transform");
  Pose result{numbers<3>(transform.at("position")), numbers<3>(transform.at("scale")), numbers<4>(transform.at("rotation"))};
  if (entity.contains("visualOverride") && entity.at("visualOverride").contains("rotation")) {
    if (entity.contains("body") || entity.contains("collider") || entity.contains("character")) { throw Error("validation_error", "Visual rotation cannot override a physics owner"); }
    result.rotation = numbers<4>(entity.at("visualOverride").at("rotation"));
  }
  return result;
}
Pose compose(const Pose &parent, const Pose &local) {
  for (std::size_t column = 0; column < 3; ++column) {
    Vector axis{0, 0, 0}; axis[column] = 1;
    const auto rotated = rotate(local.rotation, axis);
    for (std::size_t row = 0; row < 3; ++row) {
      const double magnitude = std::max(std::abs(parent.scale[row]), std::abs(parent.scale[column]));
      if (std::abs(rotated[row] * (parent.scale[row] - parent.scale[column])) > magnitude * 1e-8) {
        throw Error("validation_error", "3D hierarchy rotation crosses differently scaled parent axes", "/transform/rotation");
      }
    }
  }
  Vector scaled;
  for (std::size_t i = 0; i < 3; ++i) { scaled[i] = local.position[i] * parent.scale[i]; }
  const auto translated = rotate(parent.rotation, scaled);
  Pose result;
  result.rotation = multiply(parent.rotation, local.rotation);
  for (std::size_t i = 0; i < 3; ++i) { result.position[i] = parent.position[i] + translated[i]; result.scale[i] = parent.scale[i] * local.scale[i]; }
  const auto finite = [](const auto &tuple) { return std::all_of(tuple.begin(), tuple.end(), [](double value) { return std::isfinite(value); }); };
  if (!finite(result.position) || !finite(result.scale) || !finite(result.rotation)) { throw Error("resource_limit", "Visual hierarchy transform overflow"); }
  return result;
}
Json transform(const Pose &pose) { return {{"position", pose.position}, {"rotation", pose.rotation}, {"scale", pose.scale}}; }
Pose cameraPose(const Json &camera) {
  Pose result;
  result.position = numbers<3>(camera.value("position", Json::array({6, 5, 8})));
  const auto target = numbers<3>(camera.value("target", Json::array({0, 0, 0})));
  auto forward = target;
  for (std::size_t i = 0; i < 3; ++i) { forward[i] -= result.position[i]; }
  forward = unit(forward, {0, 0, -1});
  const auto authoredUp = numbers<3>(camera.value("up", Json::array({0, 1, 0})));
  const auto right = unit(cross(forward, authoredUp), unit(cross(forward, {0, 0, 1}), {1, 0, 0}));
  const auto up = unit(cross(right, forward), {0, 1, 0});
  const double m00 = right[0], m01 = up[0], m02 = -forward[0], m10 = right[1], m11 = up[1], m12 = -forward[1], m20 = right[2], m21 = up[2], m22 = -forward[2];
  const double trace = m00 + m11 + m22;
  if (trace > 0) {
    const double s = 2 * std::sqrt(trace + 1);
    result.rotation = {(m21-m12)/s, (m02-m20)/s, (m10-m01)/s, s/4};
  } else if (m00 > m11 && m00 > m22) {
    const double s = 2 * std::sqrt(1 + m00 - m11 - m22);
    result.rotation = {s/4, (m01+m10)/s, (m02+m20)/s, (m21-m12)/s};
  } else if (m11 > m22) {
    const double s = 2 * std::sqrt(1 + m11 - m00 - m22);
    result.rotation = {(m01+m10)/s, s/4, (m12+m21)/s, (m02-m20)/s};
  } else {
    const double s = 2 * std::sqrt(1 + m22 - m00 - m11);
    result.rotation = {(m02+m20)/s, (m12+m21)/s, s/4, (m10-m01)/s};
  }
  return result;
}
} // namespace

VisualHierarchy3D resolveVisualHierarchy3D(const Json &entities, const Json &fallbackCamera, std::string_view activeCameraId) {
  if (!entities.is_array() || entities.size() > 100000) { throw Error("resource_limit", "Visual hierarchy entity budget exceeded"); }
  std::map<std::string, std::size_t, std::less<>> ids;
  for (std::size_t i = 0; i < entities.size(); ++i) {
    checkCancellation();
    if (!ids.emplace(entities[i].at("id").get<std::string>(), i).second) { throw Error("validation_error", "Duplicate visual entity id"); }
  }
  const auto none = entities.size();
  std::vector<std::size_t> parents(entities.size(), none), order;
  std::vector<unsigned char> color(entities.size(), 0);
  std::vector<bool> relative(entities.size(), false);
  std::vector<Pose> poses(entities.size());
  for (std::size_t i = 0; i < entities.size(); ++i) {
    if (entities[i].contains("parentId")) {
      const auto parent = ids.find(entities[i].at("parentId").get<std::string>());
      if (parent == ids.end()) { throw Error("validation_error", "Visual parent does not exist"); }
      parents[i] = parent->second;
    }
    relative[i] = entities[i].contains("visual") && entities[i].at("visual").value("cameraRelative", false);
    if (relative[i] && (parents[i] != none || entities[i].contains("body") || entities[i].contains("collider") || entities[i].contains("character"))) { throw Error("validation_error", "Camera-relative visual must be a nonphysical root"); }
    poses[i] = localPose(entities[i]);
  }
  for (std::size_t start = 0; start < entities.size(); ++start) {
    std::vector<std::size_t> chain;
    auto current = start;
    while (current != none && color[current] != 2) {
      checkCancellation();
      if (color[current] == 1) { throw Error("validation_error", "Visual hierarchy contains a cycle"); }
      color[current] = 1; chain.push_back(current); current = parents[current];
    }
    while (!chain.empty()) {
      const auto index = chain.back(); chain.pop_back();
      if (parents[index] != none) { relative[index] = relative[index] || relative[parents[index]]; }
      if (relative[index] && (entities[index].contains("body") || entities[index].contains("collider") || entities[index].contains("character"))) { throw Error("validation_error", "Camera-relative branches cannot contain physics owners"); }
      color[index] = 2; order.push_back(index);
    }
  }
  for (const auto index : order) { if (!relative[index] && parents[index] != none) { poses[index] = compose(poses[parents[index]], poses[index]); } }
  Json camera = fallbackCamera;
  if (!activeCameraId.empty()) {
    const auto found = ids.find(activeCameraId);
    if (found == ids.end() || relative[found->second] || !entities[found->second].contains("camera3d")) { throw Error("validation_error", "Active camera must select a camera outside camera-relative branches", "/activeCameraId"); }
    const auto &definition = entities[found->second].at("camera3d").at("projection");
    if (definition.value("kind", std::string{}) != "perspective") { throw Error("unavailable_capability", "Only perspective entity cameras are supported"); }
    const auto &pose = poses[found->second];
    const auto forward = rotate(pose.rotation, {0, 0, -1}), up = rotate(pose.rotation, {0, 1, 0});
    auto target = pose.position;
    for (std::size_t i = 0; i < 3; ++i) { target[i] += forward[i]; }
    camera = {{"position", pose.position}, {"target", target}, {"up", up}, {"fov", definition.value("fov", 60.)}, {"near", definition.value("near", .05)}, {"far", definition.value("far", 10000.)}};
  }
  const auto cameraRoot = cameraPose(camera);
  for (const auto index : order) { if (relative[index]) { poses[index] = compose(parents[index] == none ? cameraRoot : poses[parents[index]], poses[index]); } }
  VisualHierarchy3D result{entities, Json::object(), std::move(camera)};
  for (std::size_t i = 0; i < entities.size(); ++i) {
    checkCancellation();
    const auto resolved = transform(poses[i]);
    result.worldTransforms[entities[i].at("id").get<std::string>()] = resolved;
    result.entities[i]["transform"] = resolved;
    result.entities[i].erase("parentId"); result.entities[i].erase("visualOverride");
    if (result.entities[i].contains("visual")) { result.entities[i]["visual"].erase("cameraRelative"); }
  }
  return result;
}
} // namespace nodetool::game
