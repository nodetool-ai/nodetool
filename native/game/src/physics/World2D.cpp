#include "World2D.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <map>
#include <optional>
#include <set>
#include <tuple>
#include <vector>
namespace nodetool::game {
namespace {
constexpr double touchEpsilon = .001;
constexpr std::size_t capacity = 200000;
struct Box {
  double x = 0, y = 0, w = 0, h = 0;
};
struct Hit {
  double time = 0, x = 0, y = 0;
};
double sign(double n) { return (n > 0) - (n < 0); }
unsigned face(Hit h) {
  return h.x < 0 ? 1 : h.x > 0 ? 2 : h.y < 0 ? 4 : h.y > 0 ? 8 : 0;
}
bool intersects(Box a, Box b) {
  return std::abs(a.x - b.x) <= a.w + b.w && std::abs(a.y - b.y) <= a.h + b.h;
}
Box swept(Box b, double x, double y) {
  return {b.x + x / 2, b.y + y / 2, b.w + std::abs(x) / 2,
          b.h + std::abs(y) / 2};
}
std::optional<Hit> sweep(Box a, Box b, double dx, double dy, bool sensor) {
  const double hx = a.w + b.w, hy = a.h + b.h, ox = b.x - a.x, oy = b.y - a.y;
  if (std::abs(ox) < hx && std::abs(oy) < hy) {
    const bool x = hx - std::abs(ox) <= hy - std::abs(oy);
    Hit h{0, x ? (ox == 0 ? -sign(dx) : sign(-ox)) : 0,
          x ? 0 : (oy == 0 ? -sign(dy) : sign(-oy))};
    if (dx * h.x + dy * h.y >= 0 && !sensor) {
      return {};
    }
    return h;
  }
  if ((dx == 0 && std::abs(ox) >= hx) || (dy == 0 && std::abs(oy) >= hy)) {
    return {};
  }
  const double inf = std::numeric_limits<double>::infinity();
  const double xe = dx > 0 ? (ox - hx) / dx : dx < 0 ? (ox + hx) / dx : -inf;
  const double xx = dx > 0 ? (ox + hx) / dx : dx < 0 ? (ox - hx) / dx : inf;
  const double ye = dy > 0 ? (oy - hy) / dy : dy < 0 ? (oy + hy) / dy : -inf;
  const double yx = dy > 0 ? (oy + hy) / dy : dy < 0 ? (oy - hy) / dy : inf;
  const double entry = std::max(xe, ye);
  if (entry > std::min(xx, yx) || entry < 0 || entry > 1) {
    return {};
  }
  return xe >= ye ? Hit{entry, -sign(dx), 0} : Hit{entry, 0, -sign(dy)};
}
double number(const Json &j, const char *key, double fallback = 0) {
  const double n = j.value(key, fallback);
  if (!std::isfinite(n) || std::abs(n) > 1000000) {
    throw Error("validation_error",
                "2D spatial value exceeds finite world bounds");
  }
  return n;
}
struct Grid {
  static constexpr double size = 4;
  std::map<std::pair<int, int>, std::set<std::size_t>> cells;
  std::set<std::size_t> large;
  std::map<std::size_t, Box> boxes;
  static std::array<int, 4> range(Box b) {
    return {int(std::floor((b.x - b.w) / size)),
            int(std::floor((b.y - b.h) / size)),
            int(std::floor((b.x + b.w) / size)),
            int(std::floor((b.y + b.h) / size))};
  }
  static bool huge(const std::array<int, 4> &r) {
    return double(r[2] - r[0] + 1) * double(r[3] - r[1] + 1) > 4096;
  }
  void erase(std::size_t i) {
    auto it = boxes.find(i);
    if (it == boxes.end()) {
      return;
    }
    auto r = range(it->second);
    if (huge(r)) {
      large.erase(i);
    } else {
      for (int x = r[0]; x <= r[2]; ++x) {
        checkCancellation();
        for (int y = r[1]; y <= r[3]; ++y) {
          auto c = cells.find({x, y});
          if (c != cells.end()) {
            c->second.erase(i);
            if (c->second.empty()) {
              cells.erase(c);
            }
          }
        }
      }
    }
    boxes.erase(it);
  }
  void insert(std::size_t i, Box b) {
    erase(i);
    boxes[i] = b;
    auto r = range(b);
    if (huge(r)) {
      large.insert(i);
      return;
    }
    for (int x = r[0]; x <= r[2]; ++x) {
      for (int y = r[1]; y <= r[3]; ++y) {
        cells[{x, y}].insert(i);
      }
    }
  }
  std::vector<std::size_t> query(Box b) const {
    std::set<std::size_t> result;
    auto r = range(b);
    if (huge(r)) {
      for (auto [i, a] : boxes) {
        checkCancellation();
        if (intersects(a, b)) {
          result.insert(i);
        }
      }
    } else {
      for (int x = r[0]; x <= r[2]; ++x) {
        checkCancellation();
        for (int y = r[1]; y <= r[3]; ++y) {
          auto c = cells.find({x, y});
          if (c != cells.end()) {
            for (auto i : c->second) {
              result.insert(i);
              if (result.size() > 8192) {
                throw Error("resource_limit",
                            "2D broadphase candidate capacity exceeded");
              }
            }
          }
        }
      }
      result.insert(large.begin(), large.end());
    }
    if (result.size() > 8192) {
      throw Error("resource_limit",
                  "2D broadphase candidate capacity exceeded");
    }
    std::vector<std::size_t> out;
    for (auto i : result) {
      if (intersects(boxes.at(i), b)) {
        out.push_back(i);
      }
    }
    return out;
  }
};
} // namespace
struct World2D::Impl {
  struct State {
    Json authored;
    std::string id;
    double x = 0, y = 0, vx = 0, vy = 0, parentX = 0, parentY = 0;
    bool hasPhysicalDescendant = false;
    bool actor = false, active = true;
    Box box() const {
      auto c = authored.value("collider2d", Json::object());
      return {x, y, c.value("width", 0.) / 2, c.value("height", 0.) / 2};
    }
  };
  struct Obstacle {
    std::size_t owner = 0;
    Box local;
    bool solid = false, sensor = false, oneWay = false;
    unsigned internal = 0;
    std::uint32_t category = 1, mask = 0xffffffffU;
  };
  std::vector<State> states;
  std::map<std::string, std::size_t> ids;
  std::vector<Obstacle> obstacles;
  std::vector<std::vector<std::size_t>> owned;
  Grid grid;
  Grid actorIndex;
  Json contactList = Json::array();
  std::map<std::pair<std::string, std::string>, Json> pairs;
  Json gravity;
  double dt;
  explicit Impl(const Json &entities, Json g, double rate)
      : gravity(std::move(g)), dt(1 / rate) {
    if (!std::isfinite(rate) || rate < 1 || rate > 1000) {
      throw Error("validation_error", "Invalid 2D tick rate");
    }
    number(gravity, "x");
    number(gravity, "y");
    if (entities.size() > 20000) {
      throw Error("resource_limit", "2D entity capacity exceeded");
    }
    for (const auto &e : entities) {
      checkCancellation();
      State s;
      s.authored = e;
      s.id = e.at("id");
      auto t = e.at("transform");
      s.x = number(t, "x");
      s.y = number(t, "y");
      if (e.contains("collider2d")) {
        const auto &c = e["collider2d"];
        if (number(c, "width") <= 0 || number(c, "height") <= 0) {
          throw Error("validation_error", "Invalid 2D collider dimensions");
        }
      }
      s.active = e.value("active", true);
      auto body = e.value("body2d", Json::object());
      number(body, "gravityScale", 1.);
      s.actor = body.value("type", std::string()) == "kinematic";
      auto v =
          e.value("velocity", body.value("velocity", Json{{"x", 0}, {"y", 0}}));
      s.vx = number(v, "x");
      s.vy = number(v, "y");
      if ((e.contains("body2d") || e.contains("collider2d") ||
           e.contains("tilemap")) &&
          (t.value("rotation", 0.) != 0 || t.value("scaleX", 1.) != 1 ||
           t.value("scaleY", 1.) != 1)) {
        throw Error("validation_error",
                    "2D physics requires identity rotation and scale");
      }
      if (!ids.emplace(s.id, states.size()).second) {
        throw Error("validation_error", "Duplicate 2D entity identity");
      }
      states.push_back(std::move(s));
    }
    // Resolve ancestry once so a deep grouped level does not require quadratic
    // walks.
    std::vector<std::optional<std::size_t>> parents(states.size());
    std::vector<unsigned> visited(states.size());
    std::vector<std::size_t> order;
    for (std::size_t i = 0; i < states.size(); ++i) {
      checkCancellation();
      if (states[i].authored.contains("parentId")) {
        auto it =
            ids.find(states[i].authored.at("parentId").get<std::string>());
        if (it == ids.end()) {
          throw Error("validation_error", "Missing 2D parent");
        }
        parents[i] = it->second;
      }
    }
    for (std::size_t i = 0; i < states.size(); ++i) {
      checkCancellation();
      std::vector<std::size_t> path;
      auto current = std::optional<std::size_t>(i);
      while (current && visited[*current] == 0) {
        visited[*current] = 1;
        path.push_back(*current);
        current = parents[*current];
      }
      if (current && visited[*current] == 1) {
        throw Error("validation_error", "Cyclic 2D hierarchy");
      }
      for (auto it = path.rbegin(); it != path.rend(); ++it) {
        visited[*it] = 2;
        order.push_back(*it);
      }
    }
    std::vector<bool> unsafe(states.size()), moving(states.size());
    for (auto i : order) {
      checkCancellation();
      auto &state = states[i];
      auto t = state.authored.at("transform");
      unsafe[i] = t.value("rotation", 0.) != 0 || t.value("scaleX", 1.) != 1 ||
                  t.value("scaleY", 1.) != 1;
      moving[i] = state.actor || state.vx != 0 || state.vy != 0;
      if (parents[i]) {
        auto p = *parents[i];
        const auto &parent = states[p];
        state.parentX = parent.x;
        state.parentY = parent.y;
        bool physical = state.authored.contains("body2d") ||
                        state.authored.contains("collider2d") ||
                        state.authored.contains("tilemap");
        if (physical && (unsafe[p] || moving[p])) {
          throw Error(
              "validation_error",
              "2D physics ancestors require fixed identity rotation and scale");
        }
        unsafe[i] = unsafe[i] || unsafe[p];
        moving[i] = moving[i] || moving[p];
      }
      state.x += state.parentX;
      state.y += state.parentY;
      number(Json{{"x", state.x}, {"y", state.y}}, "x");
      number(Json{{"x", state.x}, {"y", state.y}}, "y");
    }
    for (auto it = order.rbegin(); it != order.rend(); ++it) {
      auto i = *it;
      bool physical = states[i].authored.contains("body2d") ||
                      states[i].authored.contains("collider2d") ||
                      states[i].authored.contains("tilemap");
      if (parents[i] && (physical || states[i].hasPhysicalDescendant)) {
        states[*parents[i]].hasPhysicalDescendant = true;
      }
    }
    owned.resize(states.size());
    for (std::size_t i = 0; i < states.size(); ++i) {
      checkCancellation();
      build(i);
      if (states[i].active && states[i].actor &&
          states[i].authored.contains("collider2d")) {
        actorIndex.insert(i, states[i].box());
      }
    }
  }
  Box box(std::size_t i) const {
    auto b = obstacles[i].local;
    const auto &s = states[obstacles[i].owner];
    b.x += s.x;
    b.y += s.y;
    return b;
  }
  void add(Obstacle o) {
    if (obstacles.size() >= capacity) {
      throw Error("resource_limit", "2D obstacle capacity exceeded");
    }
    if (o.local.w <= 0 || o.local.h <= 0 || !std::isfinite(o.local.w) ||
        !std::isfinite(o.local.h) || o.local.w > 1000000 ||
        o.local.h > 1000000) {
      throw Error("validation_error", "Invalid 2D collision dimensions");
    }
    auto i = obstacles.size();
    owned[o.owner].push_back(i);
    obstacles.push_back(o);
    grid.insert(i, box(i));
  }
  void build(std::size_t i) {
    const auto &s = states[i];
    if (!s.active || s.actor) {
      return;
    }
    const auto &e = s.authored;
    if (e.contains("collider2d")) {
      const auto &c = e["collider2d"];
      add({i,
           {0, 0, number(c, "width") / 2, number(c, "height") / 2},
           e.value("body2d", Json::object()).value("type", std::string()) ==
               "static",
           c.value("sensor", false),
           c.value("oneWay", false),
           0,
           c.value("category", 1U),
           c.value("mask", 0xffffffffU)});
    }
    if (!e.contains("tilemap")) {
      return;
    }
    const auto &t = e["tilemap"];
    const auto start = obstacles.size();
    for (const auto &tile : t.at("tiles")) {
      checkCancellation();
      if (tile.value("solid", t.value("solid", false))) {
        add({i,
             {number(tile, "x"), number(tile, "y"), number(tile, "width") / 2,
              number(tile, "height") / 2},
             true,
             false,
             tile.value("oneWay", false),
             0,
             t.value("category", 1U),
             t.value("mask", 0xffffffffU)});
      }
    }
    for (auto j = start; j < obstacles.size(); ++j) {
      checkCancellation();
      auto &a = obstacles[j];
      if (a.oneWay) {
        continue;
      }
      auto b = box(j);
      auto grown = b;
      grown.w += 1e-6;
      grown.h += 1e-6;
      for (auto k : grid.query(grown)) {
        const auto &o = obstacles[k];
        if (k == j || k < start || o.owner != i || o.oneWay) {
          continue;
        }
        auto c = box(k);
        bool spansY =
            c.y - c.h <= b.y - b.h + 1e-6 && c.y + c.h >= b.y + b.h - 1e-6;
        bool spansX =
            c.x - c.w <= b.x - b.w + 1e-6 && c.x + c.w >= b.x + b.w - 1e-6;
        if (spansY && std::abs(c.x - c.w - b.x - b.w) <= 1e-6) {
          a.internal |= 2;
        }
        if (spansY && std::abs(c.x + c.w - b.x + b.w) <= 1e-6) {
          a.internal |= 1;
        }
        if (spansX && std::abs(c.y - c.h - b.y - b.h) <= 1e-6) {
          a.internal |= 8;
        }
        if (spansX && std::abs(c.y + c.h - b.y + b.h) <= 1e-6) {
          a.internal |= 4;
        }
      }
    }
  }
  bool collide(std::size_t s, const Obstacle &o) const {
    const auto &a = states[s];
    if (!a.active || o.owner == s || !a.authored.contains("collider2d")) {
      return false;
    }
    auto c = a.authored["collider2d"];
    return (c.value("mask", 0xffffffffU) & o.category) != 0 &&
           (o.mask & c.value("category", 1U)) != 0;
  }
  void record(std::size_t a, std::size_t b, Hit h, bool sensor) {
    auto key = std::minmax(states[a].id, states[b].id);
    if (!pairs.contains(key)) {
      if (pairs.size() >= 10000) {
        throw Error("resource_limit", "2D contact capacity exceeded");
      }
      pairs[key] = {{"a", states[a].id},
                    {"b", states[b].id},
                    {"sensor", sensor},
                    {"normalX", h.x},
                    {"normalY", h.y}};
    }
  }
  Hit move(std::size_t i, double dx, double dy,
           std::optional<std::size_t> exclude = {}) {
    auto &s = states[i];
    if (!s.authored.contains("collider2d")) {
      s.x += dx;
      s.y += dy;
      return {};
    }
    Hit blocked;
    const bool sensor = s.authored["collider2d"].value("sensor", false);
    for (int pass = 0; pass < 2 && (dx != 0 || dy != 0); ++pass) {
      struct Found {
        std::size_t i;
        Hit h;
        bool blocks;
      };
      std::vector<Found> hits;
      for (auto j : grid.query(swept(s.box(), dx, dy))) {
        const auto &o = obstacles[j];
        if ((exclude && o.owner == *exclude) || !collide(i, o)) {
          continue;
        }
        auto b = box(j);
        auto h = sweep(s.box(), b, dx, dy, sensor || o.sensor);
        if (!h) {
          continue;
        }
        bool blocks = o.solid && !sensor && !o.sensor;
        if (blocks &&
            ((o.internal & face(*h)) ||
             (o.oneWay &&
              !(h->y > 0 && s.y - s.box().h >= b.y + b.h - touchEpsilon)))) {
          continue;
        }
        hits.push_back({j, *h, blocks});
      }
      std::stable_sort(
          hits.begin(), hits.end(), [&](const auto &a, const auto &b) {
            return std::tuple(a.h.time, states[obstacles[a.i].owner].id, a.i) <
                   std::tuple(b.h.time, states[obstacles[b.i].owner].id, b.i);
          });
      auto solid = std::find_if(hits.begin(), hits.end(),
                                [](const auto &h) { return h.blocks; });
      const double travel = solid == hits.end() ? 1 : solid->h.time;
      for (const auto &h : hits) {
        if (h.h.time > travel) {
          break;
        }
        if (!h.blocks || (solid != hits.end() && &h == &*solid)) {
          record(i, obstacles[h.i].owner, h.h, sensor || obstacles[h.i].sensor);
        }
      }
      s.x += dx * travel;
      s.y += dy * travel;
      if (solid == hits.end()) {
        break;
      }
      if (solid->h.x != 0) {
        blocked.x = solid->h.x;
      }
      if (solid->h.y != 0) {
        blocked.y = solid->h.y;
      }
      dx = solid->h.x == 0 ? dx * (1 - travel) : 0;
      dy = solid->h.y == 0 ? dy * (1 - travel) : 0;
    }
    return blocked;
  }
  Json touching(std::size_t i) const {
    Json out = {
        {"down", false}, {"up", false}, {"left", false}, {"right", false}};
    const auto &s = states[i];
    if (!s.authored.contains("collider2d") ||
        s.authored["collider2d"].value("sensor", false)) {
      return out;
    }
    auto a = s.box(), grown = a;
    grown.w += touchEpsilon;
    grown.h += touchEpsilon;
    for (auto j : grid.query(grown)) {
      auto &o = obstacles[j];
      if (!o.solid || o.sensor || !collide(i, o)) {
        continue;
      }
      auto b = box(j);
      auto x = std::min(a.x + a.w, b.x + b.w) - std::max(a.x - a.w, b.x - b.w),
           y = std::min(a.y + a.h, b.y + b.h) - std::max(a.y - a.h, b.y - b.h);
      if (x > touchEpsilon && std::abs(a.y - a.h - b.y - b.h) <= touchEpsilon) {
        out["down"] = true;
      }
      if (o.oneWay) {
        continue;
      }
      if (x > touchEpsilon && std::abs(a.y + a.h - b.y + b.h) <= touchEpsilon) {
        out["up"] = true;
      }
      if (y > touchEpsilon && !(o.internal & 2) &&
          std::abs(a.x - a.w - b.x - b.w) <= touchEpsilon) {
        out["left"] = true;
      }
      if (y > touchEpsilon && !(o.internal & 1) &&
          std::abs(a.x + a.w - b.x + b.w) <= touchEpsilon) {
        out["right"] = true;
      }
    }
    return out;
  }
};
World2D::World2D(const Json &entities, Json gravity, double tickRate)
    : impl_(std::make_unique<Impl>(entities, std::move(gravity), tickRate)) {}
World2D::~World2D() = default;
void World2D::step(const Json &intents) {
  auto &w = *impl_;
  w.pairs.clear();
  std::vector<std::size_t> actors;
  auto &actorGrid = w.actorIndex;
  std::vector<Box> starts(w.states.size());
  for (std::size_t i = 0; i < w.states.size(); ++i) {
    auto &s = w.states[i];
    starts[i] = s.box();
    if (s.actor && s.active) {
      actors.push_back(i);
      auto in = intents.value(s.id, Json::object());
      if (in.contains("move")) {
        const auto &m = in["move"];
        s.vx = number(m, "x");
        s.vy = number(m, "y");
      }
      const double scale = number(s.authored["body2d"], "gravityScale", 1.);
      s.vx += number(w.gravity, "x") * scale * w.dt;
      s.vy += number(w.gravity, "y") * scale * w.dt;
      number(Json{{"x", s.vx}, {"y", s.vy}}, "x");
      number(Json{{"x", s.vx}, {"y", s.vy}}, "y");
      if (s.authored.contains("collider2d")) {
        actorGrid.insert(i, s.box());
      }
    }
  }
  struct Carry {
    double x, y;
    std::size_t platform;
  };
  std::map<std::size_t, Carry> carries;
  for (std::size_t p = 0; p < w.states.size(); ++p) {
    auto &platform = w.states[p];
    if (!platform.active || platform.actor ||
        platform.authored.value("body2d", Json::object())
                .value("type", std::string()) != "static" ||
        (platform.vx == 0 && platform.vy == 0)) {
      continue;
    }
    checkCancellation();
    const double dx = platform.vx * w.dt, dy = platform.vy * w.dt;
    std::set<std::size_t> candidates;
    for (auto o : w.owned[p]) {
      auto area = swept(w.box(o), dx, dy);
      area.w += .02;
      area.h += .02;
      for (auto i : actorGrid.query(area)) {
        candidates.insert(i);
      }
    }
    for (auto i : candidates) {
      const auto a = w.states[i].box();
      if (carries.contains(i) ||
          w.states[i].authored["collider2d"].value("sensor", false)) {
        continue;
      }
      auto nearby = a;
      nearby.w += .02;
      nearby.h += .02;
      for (auto o : w.grid.query(nearby)) {
        const auto &obstacle = w.obstacles[o];
        if (obstacle.owner != p) {
          continue;
        }
        const auto b = w.box(o);
        if (obstacle.solid && !obstacle.sensor && w.collide(i, obstacle) &&
            std::min(a.x + a.w, b.x + b.w) - std::max(a.x - a.w, b.x - b.w) >
                touchEpsilon &&
            std::abs(a.y - a.h - b.y - b.h) <= .02) {
          carries[i] = {dx, dy, p};
          break;
        }
      }
    }
    platform.x += dx;
    platform.y += dy;
    number(Json{{"x", platform.x}, {"y", platform.y}}, "x");
    number(Json{{"x", platform.x}, {"y", platform.y}}, "y");
    for (auto o : w.owned[p]) {
      w.grid.insert(o, w.box(o));
    }
    for (auto i : candidates) {
      auto &s = w.states[i];
      if ((carries.contains(i) && carries.at(i).platform == p) ||
          s.authored["collider2d"].value("sensor", false)) {
        continue;
      }
      for (auto o : w.grid.query(swept(s.box(), dx, dy))) {
        const auto &obstacle = w.obstacles[o];
        if (obstacle.owner != p || !obstacle.solid || obstacle.sensor ||
            obstacle.oneWay || !w.collide(i, obstacle)) {
          continue;
        }
        const auto b = w.box(o);
        auto start = b;
        start.x -= dx;
        start.y -= dy;
        auto hit = sweep(s.box(), start, -dx, -dy, false);
        if (!hit || (obstacle.internal & face(*hit))) {
          continue;
        }
        w.record(i, p, *hit, false);
        const auto a = s.box();
        w.move(i, hit->x * std::max(0., (b.x - s.x) * hit->x + b.w + a.w),
               hit->y * std::max(0., (b.y - s.y) * hit->y + b.h + a.h), p);
        actorGrid.insert(i, s.box());
      }
    }
  }
  for (auto i : actors) {
    auto &s = w.states[i];
    if (carries.contains(i)) {
      auto c = carries.at(i);
      w.move(i, c.x, c.y, c.platform);
    }
    auto blocked = w.move(i, s.vx * w.dt, s.vy * w.dt);
    if (blocked.x * s.vx < 0) {
      s.vx = 0;
    }
    if (blocked.y * s.vy < 0) {
      s.vy = 0;
    }
    number(Json{{"x", s.x}}, "x");
    number(Json{{"y", s.y}}, "y");
    if (s.authored.contains("collider2d")) {
      actorGrid.insert(i, s.box());
    }
  }
  // Swept actor envelopes index relative contacts without actor all-pairs
  // scans.
  Grid motion;
  for (auto i : actors) {
    if (w.states[i].authored.contains("collider2d")) {
      motion.insert(i, swept(starts[i], w.states[i].x - starts[i].x,
                             w.states[i].y - starts[i].y));
    }
  }
  for (auto i : actors) {
    auto &s = w.states[i];
    if (!s.authored.contains("collider2d")) {
      continue;
    }
    const auto a = s.box();
    for (auto j : motion.query(motion.boxes.at(i))) {
      if (j <= i) {
        continue;
      }
      const auto &b = w.states[j];
      const auto ac = s.authored["collider2d"], bc = b.authored["collider2d"];
      if (!(ac.value("mask", 0xffffffffU) & bc.value("category", 1U)) ||
          !(bc.value("mask", 0xffffffffU) & ac.value("category", 1U))) {
        continue;
      }
      bool sensor = ac.value("sensor", false) || bc.value("sensor", false);
      auto h =
          sweep(starts[i], starts[j], s.x - starts[i].x - b.x + starts[j].x,
                s.y - starts[i].y - b.y + starts[j].y, sensor);
      if (h) {
        w.record(i, j, *h, sensor);
      } else if (std::abs(a.x - b.x) < a.w + b.box().w &&
                 std::abs(a.y - b.y) < a.h + b.box().h) {
        bool x = std::abs(a.x - b.x) - a.w - b.box().w >=
                 std::abs(a.y - b.y) - a.h - b.box().h;
        w.record(i, j, {0, x ? sign(a.x - b.x) : 0, x ? 0 : sign(a.y - b.y)},
                 sensor);
      }
    }
    for (auto j : w.grid.query(a)) {
      const auto &o = w.obstacles[j];
      if (!w.collide(i, o)) {
        continue;
      }
      const auto b = w.box(j);
      const double gx = std::abs(a.x - b.x) - a.w - b.w,
                   gy = std::abs(a.y - b.y) - a.h - b.h;
      if ((gx < 0 && gy < 0) || (gx <= 0 && gy <= 0 && o.solid && !o.sensor)) {
        const bool x = gx >= gy;
        w.record(i, o.owner,
                 {0, x ? sign(a.x - b.x) : 0, x ? 0 : sign(a.y - b.y)},
                 o.sensor || s.authored["collider2d"].value("sensor", false));
      }
    }
    checkCancellation();
  }
  w.contactList = Json::array();
  for (const auto &[key, c] : w.pairs) {
    (void)key;
    w.contactList.push_back(c);
  }
}
void World2D::command(const Json &c) {
  auto &w = *impl_;
  const auto id = c.at("entityId").get<std::string>();
  auto it = w.ids.find(id);
  if (it == w.ids.end()) {
    throw Error("command_error", "Unknown 2D entity: " + id);
  }
  auto &s = w.states[it->second];
  const auto kind = c.at("kind").get<std::string>();
  if (kind == "setPosition") {
    const auto &p = c.at("position");
    if (s.hasPhysicalDescendant) {
      throw Error("command_error",
                  "Moving 2D physics ancestors are unsupported");
    }
    s.x = number(p, "x") + s.parentX;
    s.y = number(p, "y") + s.parentY;
    number(Json{{"x", s.x}, {"y", s.y}}, "x");
    number(Json{{"x", s.x}, {"y", s.y}}, "y");
    if (s.active && s.actor && s.authored.contains("collider2d")) {
      w.actorIndex.insert(it->second, s.box());
    }
    for (auto o : w.owned[it->second]) {
      w.grid.insert(o, w.box(o));
    }
  } else if (kind == "setVelocity") {
    if (!s.authored.contains("body2d")) {
      throw Error("command_error", "2D velocity requires a body");
    }
    if (s.hasPhysicalDescendant) {
      throw Error("command_error",
                  "Moving 2D physics ancestors are unsupported");
    }
    const auto &v = c.at("velocity");
    s.vx = number(v, "x");
    s.vy = number(v, "y");
  } else {
    throw Error("command_error", "Unsupported 2D spatial command: " + kind);
  }
}
Json World2D::entities() const {
  Json out = Json::array();
  const auto &w = *impl_;
  for (std::size_t i = 0; i < w.states.size(); ++i) {
    const auto &s = w.states[i];
    auto e = s.authored;
    e["transform"]["x"] = s.x - s.parentX;
    e["transform"]["y"] = s.y - s.parentY;
    e["velocity"] = {{"x", s.vx}, {"y", s.vy}};
    e["touching"] = w.touching(i);
    e["grounded"] = e["touching"]["down"];
    out.push_back(std::move(e));
  }
  return out;
}
Json World2D::contacts() const { return impl_->contactList; }
Json World2D::query(const Json &c) const {
  const auto &w = *impl_;
  const auto &origin = c.at("origin");
  const auto &direction = c.at("direction");
  const double x = number(origin, "x"), y = number(origin, "y"),
               vx = number(direction, "x"), vy = number(direction, "y"),
               length = std::hypot(vx, vy),
               distance = number(c, "maxDistance", 100);
  if (length == 0 || distance < 0) {
    throw Error("command_error", "Invalid 2D ray");
  }
  double dx = vx / length * distance, dy = vy / length * distance, best = 2;
  std::string id;
  auto test = [&](Box b, const std::string &name) {
    double low = 0, high = 1;
    for (auto [p, v, lo, hi] : {std::tuple(x, dx, b.x - b.w, b.x + b.w),
                                std::tuple(y, dy, b.y - b.h, b.y + b.h)}) {
      if (v == 0) {
        if (p < lo || p > hi) {
          return;
        }
      } else {
        double a = (lo - p) / v, z = (hi - p) / v;
        if (a > z) {
          std::swap(a, z);
        }
        low = std::max(low, a);
        high = std::min(high, z);
        if (low > high) {
          return;
        }
      }
    }
    if (low < best || (low == best && name < id)) {
      best = low;
      id = name;
    }
  };
  for (auto j : w.grid.query(swept({x, y, 0, 0}, dx, dy))) {
    const auto &o = w.obstacles[j];
    if ((o.category & c.value("mask", 0xffffffffU)) != 0) {
      test(w.box(j), w.states[o.owner].id);
    }
  }
  for (auto i : w.actorIndex.query(swept({x, y, 0, 0}, dx, dy))) {
    const auto &s = w.states[i];
    if (s.active && s.actor && s.authored.contains("collider2d") &&
        (s.authored["collider2d"].value("category", 1U) &
         c.value("mask", 0xffffffffU))) {
      test(s.box(), s.id);
    }
  }
  Json out = {{"queryId", c.at("queryId")}, {"hit", best <= 1}};
  if (best <= 1) {
    out["entityId"] = id;
    out["fraction"] = best;
    out["position"] = {{"x", x + dx * best}, {"y", y + dy * best}};
  }
  return out;
}
Json World2D::snapshot() const {
  return {{"dimension", "2d"},
          {"entities", entities()},
          {"contacts", impl_->contactList},
          {"gravity", impl_->gravity},
          {"tickRate", 1 / impl_->dt}};
}
void World2D::restore(const Json &saved) {
  if (saved.at("dimension") != "2d") {
    throw Error("snapshot_error", "Invalid 2D spatial snapshot");
  }
  auto next = std::make_unique<Impl>(saved.at("entities"), saved.at("gravity"),
                                     saved.at("tickRate"));
  next->contactList = saved.at("contacts");
  impl_ = std::move(next);
}
void World2D::reconcile(const Json &entities) {
  auto next = std::make_unique<Impl>(entities, impl_->gravity, 1 / impl_->dt);
  for (auto &s : next->states) {
    auto old = impl_->ids.find(s.id);
    if (old != impl_->ids.end()) {
      const auto &before = impl_->states[old->second];
      s.x = before.x;
      s.y = before.y;
      s.vx = before.vx;
      s.vy = before.vy;
    }
  }
  for (std::size_t i = 0; i < next->obstacles.size(); ++i) {
    next->grid.insert(i, next->box(i));
  }
  for (std::size_t i = 0; i < next->states.size(); ++i) {
    auto &s = next->states[i];
    if (s.active && s.actor && s.authored.contains("collider2d")) {
      next->actorIndex.insert(i, s.box());
    }
  }
  next->contactList = impl_->contactList;
  impl_ = std::move(next);
}
} // namespace nodetool::game
