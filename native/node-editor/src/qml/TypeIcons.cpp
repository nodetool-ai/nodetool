#include "TypeIcons.h"

#include "graph/IconPaths.h"

namespace nodetool::node_editor::qml {

TypeIcons::TypeIcons(QObject *parent) : QObject(parent) {}

TypeIcons::~TypeIcons() = default;

QString TypeIcons::path(const QString &name) const { return nodetool::iconPath(name); }

}  // namespace nodetool::node_editor::qml
