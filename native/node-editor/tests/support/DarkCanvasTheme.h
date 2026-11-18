#pragma once
#include "graph/EditorScene.h"

namespace nodetool::test {
// A complete dark CanvasTheme for tests that build an EditorScene without the QML presentation map.
// CanvasTheme has no defaults, so a scene that never receives setTheme paints with invalid colors.
// These values mirror the dark column of Ui.Theme and are test-only.
inline CanvasTheme darkCanvasTheme() {
  return CanvasTheme::fromRoles({
      {"canvas", QColor("#08090a")}, {"grid", QColor("#1f2126")}, {"node", QColor("#0d0e10")},
      {"reroutePaper", QColor("#101113")}, {"rerouteBorder", QColor("#808590")},
      {"divider", QColor(0xff, 0xff, 0xff, 0x14)}, {"field", QColor(0xff, 0xff, 0xff, 0x08)},
      {"text", QColor("#f7f8f8")}, {"secondary", QColor("#8a8f98")}, {"checker", QColor(0xff, 0xff, 0xff, 0x06)},
      {"subgraphAccent", QColor("#7c3aed")}, {"primary", QColor("#3d68a8")}, {"progress", QColor("#e879f9")},
      {"success", QColor("#50fa7b")}, {"warning", QColor("#ffb86c")}, {"controlWire", QColor("#f59e0b")},
      {"groupHeader", QColor("#2a2d33")}, {"groupFill", QColor(0x22, 0x22, 0x22, 0x8c)},
      {"zoomedTitle", QColor("#b4b7bd")}, {"previewSelected", QColor("#d4d6db")}, {"outputSelected", QColor("#4adbf1")},
      {"shadow", QColor(0, 0, 0, 77)}, {"mediaScrim", QColor(0, 0, 0, 153)}, {"mediaScrimInk", QColor("#d4d6db")},
      {"alphaBase", QColor("#1e1e1e")}, {"alphaChecker", QColor("#2a2a2a")}, {"sans", QString("Inter")}});
}
}  // namespace nodetool::test
