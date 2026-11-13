#pragma once
#include <QColor>
#include <QString>

namespace nodetool {

// Port colors from web/src/config/data_types.ts. Static data, so any thread
// may call these.
QColor typeColor(const QString &type);
// The catalog and card icon name for a type.
QString typeIcon(const QString &type);

}  // namespace nodetool
