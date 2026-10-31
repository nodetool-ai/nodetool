#pragma once

// The version of a local media file: its path, size and modification time.
// A cache of anything decoded from a file (preview pictures, probed lengths)
// keys on it, so a file replaced in place is decoded again (review F4, F10).

#include <QDateTime>
#include <QFileInfo>
#include <QString>

namespace nt::ui {

inline QString mediaVersionKey(const QString& path) {
    if (path.isEmpty()) return {};
    const QFileInfo info(path);
    if (!info.exists()) return path + QStringLiteral("|missing");
    return path + u'|' + QString::number(info.size()) + u'|' +
           QString::number(info.lastModified(QTimeZone::UTC).toMSecsSinceEpoch());
}

}  // namespace nt::ui
