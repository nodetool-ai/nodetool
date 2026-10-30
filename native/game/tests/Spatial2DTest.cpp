#include "physics/World2D.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
using namespace nodetool::game;
namespace {
void require(bool ok, const char *message) {
  if (!ok) {
    throw std::runtime_error(message);
  }
}
Json entity(const char *id, double x, double y, const char *type = "static",
            double width = 1, double height = 1) {
  return {{"id", id},
          {"transform", {{"x", x}, {"y", y}}},
          {"body2d", {{"type", type}, {"velocity", {{"x", 0}, {"y", 0}}}}},
          {"collider2d", {{"width", width}, {"height", height}}}};
}
Json state(World2D &world, const char *id) {
  for (auto e : world.entities()) {
    if (e["id"] == id) {
      return e;
    }
  }
  throw std::runtime_error("missing entity");
}
void velocity(World2D &w, const char *id, double x, double y) {
  w.command({{"kind", "setVelocity"},
             {"entityId", id},
             {"velocity", {{"x", x}, {"y", y}}}});
}
double x(World2D &w, const char *id) { return state(w, id)["transform"]["x"]; }
double y(World2D &w, const char *id) { return state(w, id)["transform"]["y"]; }
void near(double a, double b, const char *message) {
  require(std::abs(a - b) < 1e-8, message);
}
} // namespace
int main() {
  try {
    {
      World2D w(Json::array({entity("actor", 0, 2, "kinematic"),
                             entity("wall", 2, 0, "static", 1, 20)}));
      velocity(w, "actor", 600, -60);
      w.step(Json::object());
      near(x(w, "actor"), 1, "swept wall prevents tunneling");
      near(y(w, "actor"), 1, "wall slide retains vertical travel");
      require(state(w, "actor")["touching"]["right"], "touching wall");
    }
    {
      auto a = entity("actor", .25, 0, "kinematic");
      World2D w(Json::array({a, entity("wall", 1, 0)}));
      velocity(w, "actor", -60, 0);
      w.step(Json::object());
      near(x(w, "actor"), -.75, "overlap allows escape");
      velocity(w, "actor", 60, 0);
      w.step(Json::object());
      near(x(w, "actor"), 0, "reentry blocks");
    }
    {
      auto p = entity("platform", 0, 0, "static", 10, 1);
      p["collider2d"]["oneWay"] = true;
      World2D w(Json::array({entity("actor", 0, -2, "kinematic"), p}));
      velocity(w, "actor", 0, 240);
      w.step(Json::object());
      near(y(w, "actor"), 2, "one-way passes from below");
      velocity(w, "actor", 0, -240);
      w.step(Json::object());
      near(y(w, "actor"), 1, "one-way lands from above");
      require(state(w, "actor")["touching"]["down"], "one-way grounded");
    }
    {
      auto sensor = entity("sensor", 2, 0);
      sensor["collider2d"]["sensor"] = true;
      World2D w(Json::array({entity("actor", 0, 0, "kinematic"), sensor}));
      velocity(w, "actor", 240, 0);
      w.step(Json::object());
      near(x(w, "actor"), 4, "sensor never blocks");
      require(w.contacts().size() == 1 && w.contacts()[0]["sensor"],
              "swept sensor contact");
      sensor["collider2d"]["mask"] = 0;
      World2D masked(Json::array({entity("actor", 0, 0, "kinematic"), sensor}));
      velocity(masked, "actor", 240, 0);
      masked.step(Json::object());
      require(masked.contacts().empty(), "mask suppresses contacts");
    }
    {
      auto platform = entity("platform", 0, 0, "static", 4, 1);
      World2D w(Json::array({entity("actor", 0, 1, "kinematic"), platform}));
      velocity(w, "platform", 60, 0);
      w.step(Json::object());
      near(x(w, "actor"), 1, "platform carries rider");
      auto saved = w.snapshot();
      for (int i = 0; i < 10; ++i) {
        w.step(Json::object());
      }
      auto end = w.snapshot();
      w.restore(saved);
      for (int i = 0; i < 10; ++i) {
        w.step(Json::object());
      }
      require(end == w.snapshot(),
              "midpoint replay identical including contacts");
    }
    {
      World2D w(Json::array({entity("actor", 1.5, 0, "kinematic"),
                             entity("platform", 0, 0), entity("wall", 3, 0)}));
      velocity(w, "platform", 120, 0);
      w.step(Json::object());
      near(x(w, "actor"), 2, "platform push stops at wall during crush");
      require(w.contacts().size() == 2,
              "crush retains wall and platform contacts");
    }
    {
      Json tiles = Json::array();
      for (int i = 0; i < 20000; ++i) {
        tiles.push_back(
            {{"x", i}, {"y", 0}, {"width", 1}, {"height", 1}, {"solid", true}});
      }
      Json map = {{"id", "tiles"},
                  {"transform", {{"x", 0}, {"y", 0}}},
                  {"tilemap", {{"tiles", tiles}}}};
      World2D w(Json::array({entity("actor", 0, 1, "kinematic"), map}));
      velocity(w, "actor", 600, 0);
      w.step(Json::object());
      near(x(w, "actor"), 10, "tile seams do not block sliding");
      require(state(w, "actor")["touching"]["down"], "tile grounding");
      auto result = w.query({{"queryId", "ray"},
                             {"origin", {{"x", 10}, {"y", 4}}},
                             {"direction", {{"x", 0}, {"y", -1}}},
                             {"maxDistance", 10}});
      require(result["hit"], "2D ray hit");
    }
    {
      Json bodies = Json::array();
      for (int i = 0; i < 10000; ++i) {
        auto e =
            entity(("a" + std::to_string(i)).c_str(), i * 4, 0, "kinematic");
        bodies.push_back(e);
      }
      World2D w(bodies);
      w.step(Json::object());
      require(w.contacts().empty(), "large separated actor set");
    }
    {
      Json parent = {{"id", "parent"}, {"transform", {{"x", 10}, {"y", 3}}}};
      auto wall = entity("wall", 2, 0);
      wall["parentId"] = "parent";
      auto actor = entity("actor", 0, 0, "kinematic");
      actor["parentId"] = "parent";
      World2D w(Json::array({actor, wall, parent}));
      velocity(w, "actor", 240, 0);
      w.step(Json::object());
      near(x(w, "actor"), 1,
           "translated parent keeps local output and world collisions");
      auto ray = w.query({{"queryId", "parent-ray"},
                          {"origin", {{"x", 10}, {"y", 3}}},
                          {"direction", {{"x", 1}, {"y", 0}}},
                          {"maxDistance", 5}});
      require(ray["hit"], "parented ray uses world coordinates");
      w.command({{"kind", "setPosition"},
                 {"entityId", "actor"},
                 {"position", {{"x", -2}, {"y", 0}}}});
      near(x(w, "actor"), -2, "parented command accepts local position");
      auto saved = w.snapshot();
      w.restore(saved);
      require(saved == w.snapshot(),
              "parented restore retains local positions");
      for (auto field : {"rotation", "scaleX", "scaleY"}) {
        auto bad = parent;
        bad["transform"][field] = 2;
        bool rejected = false;
        try {
          World2D invalid(Json::array({actor, wall, bad}));
        } catch (const Error &) {
          rejected = true;
        }
        require(rejected,
                "rotated/scaled physics ancestry rejects before execution");
      }
    }
    {
      Json crowded = Json::array();
      for (int i = 0; i < 8200; ++i) {
        crowded.push_back(entity(("dense" + std::to_string(i)).c_str(), 0, 0));
      }
      crowded.push_back(entity("actor", 0, 0, "kinematic"));
      bool rejected = false;
      try {
        World2D invalid(crowded);
        invalid.step(Json::object());
      } catch (const Error &e) {
        rejected = e.code == "resource_limit";
      }
      require(rejected, "dense broadphase rejects bounded candidate overflow");
    }
    std::cout << "2D spatial tests passed\n";
    return 0;
  } catch (const std::exception &e) {
    std::cerr << e.what() << '\n';
    return 1;
  }
}
