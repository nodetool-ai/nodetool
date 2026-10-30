#include "render/Effects3D.h"
#include <cmath>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool value, const char *message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}
Json particle(double z = -5) {
  return {{"entityId", "rain"},
          {"emitterId", "rain"},
          {"position", {0, 0, z}},
          {"velocity", {0, -10, 0}},
          {"size", 2},
          {"rotation", 0},
          {"color", {.5, .5, .5}},
          {"opacity", .5},
          {"softness", .5},
          {"render", {{"kind", "billboard"}}}};
}
} // namespace
int main() {
  try {
    Effects3D effects;
    ParticleCamera3D camera;
    camera.right = {1, 0, 0};
    camera.up = {0, 1, 0};
    camera.pixelSize = {64, 64};
    effects.prepareGeometry({{"particles", Json::array({particle()})}}, camera);
    require(effects.batches().size() == 1 && effects.batches()[0].count == 6,
            "Billboard emits one quad");
    const auto &vertices = effects.quadVertices();
    require(vertices.size() == 6 && vertices[0].x == -1 &&
                vertices[0].y == -1 && vertices[0].z == -5,
            "Billboard uses camera basis and source size");
    require(std::abs(vertices[0].r - .21404114F) < 1e-7F,
            "Particle RGB converts to linear light");
    require(vertices[0].a == .5F && vertices[0].softness == .5F,
            "Opacity and softness remain resolved");
    auto stretched = particle();
    stretched["size"] = .2;
    stretched["render"] = {
        {"kind", "stretched"}, {"length", 3}, {"speedScale", .1}};
    effects.prepareGeometry({{"particles", Json::array({stretched})}}, camera);
    float minY = 1e9F, maxY = -1e9F;
    for (const auto &v : effects.quadVertices()) {
      minY = std::min(minY, v.y);
      maxY = std::max(maxY, v.y);
    }
    require(std::abs(maxY - minY - 1.6F) < 1e-6F,
            "Stretched quads use speed and authored length");
    camera.transparentDepths = {5};
    effects.prepareGeometry(
        {{"particles",
          Json::array({particle(-2), particle(-8), particle(-10)})}},
        camera);
    require(effects.batches().size() == 2 && effects.batches()[0].count == 12 &&
                effects.batches()[1].count == 6,
            "Model transparency boundaries split globally sorted runs");
    auto debris = particle();
    debris["render"] = {
        {"kind", "mesh"}, {"shape", "tetrahedron"}, {"align", "world"}};
    debris["rotation"] = 1.2;
    effects.prepareGeometry({{"particles", Json::array({debris})}}, camera);
    require(effects.batches().empty() && effects.meshBatches().size() == 1 &&
                effects.meshBatches()[0].vertices.size() == 12,
            "Tetrahedra use the shared lit mesh pass");
    for (const auto &v : effects.meshBatches()[0].vertices) {
      require(std::abs(std::sqrt(v.nx * v.nx + v.ny * v.ny + v.nz * v.nz) - 1) <
                  1e-6F,
              "Debris normals remain unit length");
    }
    debris["render"]["shape"] = "box";
    bool rejected = false;
    try {
      effects.prepareGeometry({{"particles", Json::array({debris})}}, camera);
    } catch (const Error &) {
      rejected = true;
    }
    require(rejected, "Unsupported particle mesh shape rejected");
    std::cout << "3D particle billboard, stretch, transparency, linear color "
                 "and tetrahedron geometry passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
