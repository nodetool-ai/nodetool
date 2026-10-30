#pragma once
#include "assets/PreparedAssets.h"
#include "document/Schema.h"
#include <QImage>
#include <QSize>
#include <QString>
#include <map>
#include <memory>
#include <vector>

namespace nodetool::game {
struct RenderFonts {
  std::map<std::string, QString> families;
  std::map<std::string, QString> styles;
  std::map<std::string, int> weights;
  std::map<std::string, double> baselineRatios;
  std::vector<int> handles;
  ~RenderFonts();
  RenderFonts() = default;
  RenderFonts(const RenderFonts &) = delete;
  RenderFonts &operator=(const RenderFonts &) = delete;
};
std::shared_ptr<const RenderFonts> prepareHudFonts3D(PreparedAssets &assets,
                                                     const Json &manifest);
Json layoutHud3D(const Json &document, const Json &frame,
                 const std::shared_ptr<const RenderFonts> &fonts);
QImage paintHud3D(const Json &document, const Json &frame, QSize size,
                  const std::shared_ptr<const RenderFonts> &fonts);
} // namespace nodetool::game
