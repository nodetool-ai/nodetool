#pragma once
#include <QString>

namespace nodetool {

// The SVG path of a Material icon by its ui_primitives name, or empty when the
// editor has none. Static data, so any thread may call it.
QString iconPath(const QString &name);

}  // namespace nodetool
