#include "render/Hud3D.h"
#include <QGuiApplication>
#include <fstream>
#include <iostream>
using namespace nodetool::game;
namespace {
void require(bool value, const char *message) {
  if (!value) {
    throw std::runtime_error(message);
  }
}
const Json &box(const Json &boxes, const std::string &id) {
  for (const auto &entry : boxes) {
    if (entry.at("node").at("id") == id) {
      return entry;
    }
  }
  throw std::runtime_error("Missing HUD box: " + id);
}
} // namespace
int main(int argc, char **argv) {
  QGuiApplication app(argc, argv);
  try {
    Json doc = {{"presentation", {{"hudWidth", 1280}, {"hudHeight", 720}}},
                {"ui",
                 {{"nodes", Json::array({{{"kind", "panel"},
                                          {"id", "parent"},
                                          {"anchor", {{"x", 1}, {"y", 1}}},
                                          {"offset", {{"x", -28}, {"y", -26}}},
                                          {"width", 260},
                                          {"height", 74},
                                          {"opacity", .5}},
                                         {{"kind", "bar"},
                                          {"id", "bar"},
                                          {"parent", "parent"},
                                          {"anchor", {{"x", 0}, {"y", 0}}},
                                          {"offset", {{"x", 16}, {"y", 42}}},
                                          {"width", 110},
                                          {"height", 8},
                                          {"value", 9},
                                          {"max", 18},
                                          {"direction", "rightToLeft"},
                                          {"color", "#ffb04a"},
                                          {"background", "#2a2216"}},
                                         {{"kind", "panel"},
                                          {"id", "hidden"},
                                          {"visible", false},
                                          {"width", 100},
                                          {"height", 100}},
                                         {{"kind", "text"},
                                          {"id", "hidden-text"},
                                          {"parent", "hidden"},
                                          {"text", "missing"}}})}}}};
    const auto boxes = layoutHud3D(doc, Json::object(), {});
    require(boxes.size() == 2, "Hidden subtrees omitted");
    const std::string parentId = "parent", barId = "bar";
    const auto &parent = box(boxes, parentId), &bar = box(boxes, barId);
    require(parent.at("x") == 992 && parent.at("y") == 620,
            "Root anchors use HUD dimensions");
    require(bar.at("x") == 1008 && bar.at("y") == 662 &&
                bar.at("opacity") == .5,
            "Child offsets inherit panel placement and opacity");
    const auto image = paintHud3D(doc, Json::object(), QSize(1280, 720), {});
    const auto left = image.pixelColor(1010, 665),
               right = image.pixelColor(1115, 665);
    require(right.red() > left.red(), "Right-to-left bar fills the right edge");
    require(image.pixelColor(0, 0).alpha() == 0,
            "Empty HUD area remains transparent");
    require(paintHud3D(doc, Json::object(), QSize(640, 360), {}).size() ==
                QSize(640, 360),
            "HUD scales to output viewport");
    if (argc == 4) {
      std::ifstream input(argv[1]);
      Json original;
      input >> original;
      Json manifest = Json::array();
      for (const auto &[id, binding] : original.at("assets").items()) {
        if (binding.at("mediaKind") != "font") {
          continue;
        }
        const auto path = binding.at("assetId").get<std::string>() + ".ttf";
        const auto file = std::filesystem::path(argv[2]) / path;
        manifest.push_back({{"id", id},
                            {"kind", "font"},
                            {"path", path},
                            {"size", std::filesystem::file_size(file)},
                            {"digest", binding.at("digest")}});
      }
      PreparedAssets assets(argv[2], manifest);
      const auto fonts = prepareHudFonts3D(assets, manifest);
      require(fonts->families.size() == 2,
              "BLACKSITE fonts load from verified bytes");
      const auto output = std::filesystem::path(argv[3]);
      std::filesystem::create_directories(output);
      require(paintHud3D(original, Json::object(), QSize(1280, 720), fonts)
                  .save(QString::fromStdString(
                      (output / "hud-native.png").string())),
              "HUD screenshot written");
      std::ofstream layout(output / "hud-native-layout.json");
      layout << layoutHud3D(original, Json::object(), fonts).dump(2) << '\n';
      auto combat = original.at("ui");
      for (auto &node : combat.at("nodes")) {
        const auto id = node.at("id").get<std::string>();
        if (id == "ammo-value") {
          node["text"] = "07";
        } else if (id == "ammo-bar") {
          node["value"] = 7;
        } else if (id == "hp-value") {
          node["text"] = "70";
        } else if (id == "hp-bar") {
          node["value"] = 70;
        } else if (id == "damage" || id == "hitmarker") {
          node["visible"] = true;
        } else if (id == "warning") {
          node["visible"] = true;
          node["text"] = "INCOMING FIRE";
        } else if (id == "objective-count") {
          node["text"] = "2 / 5";
        } else if (id == "weapon") {
          node["text"] = "RELOADING";
        }
      }
      const auto combatImage =
          paintHud3D(original, {{"ui", combat}}, QSize(1280, 720), fonts);
      require(combatImage.pixelColor(600, 200).alpha() > 0,
              "Damage overlay uses committed UI visibility");
      require(combatImage.save(QString::fromStdString(
                  (output / "hud-combat-native.png").string())),
              "Combat HUD screenshot written");
      std::ofstream combatState(output / "hud-combat-frame.json");
      combatState << Json{{"ui", combat}}.dump(2) << '\n';
      auto extraction = original.at("ui");
      for (auto &node : extraction.at("nodes")) {
        const auto id = node.at("id").get<std::string>();
        if (id == "banner") {
          node["visible"] = true;
        } else if (id == "banner-title") {
          node["text"] = "SECTOR CLEAR";
        } else if (id == "banner-sub") {
          node["text"] = "EXTRACTION COMPLETE";
        } else if (id == "objective") {
          node["text"] = "OPERATION COMPLETE";
        } else if (id == "objective-count") {
          node["text"] = "";
        } else if (id == "help") {
          node["visible"] = false;
        }
      }
      const auto extractionImage =
          paintHud3D(original, {{"ui", extraction}}, QSize(1280, 720), fonts);
      require(extractionImage.pixelColor(600, 250).alpha() > 0,
              "Extraction banner uses committed UI visibility");
      require(extractionImage.save(QString::fromStdString(
                  (output / "hud-extraction-native.png").string())),
              "Extraction HUD screenshot written");
      std::ofstream extractionState(output / "hud-extraction-frame.json");
      extractionState << Json{{"ui", extraction}}.dump(2) << '\n';
    }
    std::cout << "3D HUD hierarchy, inherited visibility/opacity, bars and "
                 "raster passed\n";
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
