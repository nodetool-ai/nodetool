#pragma once

// Audio roles (issue #7080): the vocabulary and the document edits behind
// Match loudness and Duck music. A role is the optional clip field `audioRole`
// (`dialogue`, `music`, `sfx`, `ambience`). Everything these features write is
// ordinary document data, so the mixer, the exporter and the web editor play
// it with no special case:
//   - the role is a clip field;
//   - a loudness match sets the clip's `volumeDb`;
//   - ducking writes points of the track's mixer `volumeDb` automation lane.
// This header has no GUI or audio dependency. The edits are registered in
// AudioRoleEdits.cpp.

#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QStringList>

namespace nt::audioroles {

inline const QStringList& roles() {
    static const QStringList value{QStringLiteral("dialogue"), QStringLiteral("music"), QStringLiteral("sfx"),
                                   QStringLiteral("ambience")};
    return value;
}
QString roleLabel(const QString& role);
bool isRole(const QString& role);

// The role of a clip given as its raw object. An unset role on a generated voice
// reads as Dialogue and on generated music as Music, so documents made before
// roles existed still level. Empty when the clip has no role.
QString effectiveRole(const QJsonObject& clip);

// Default loudness target of a role in LUFS (the values Premiere's Auto-Match uses).
double defaultTargetLufs(const QString& role);

// Whether a clip carries sound that a role or a gain applies to.
bool soundingType(const QString& mediaType);

// One ducking edit: the points that replace the track's volume lane in [fromMs, toMs). The points are
// [{timeMs, value}] in document time, sorted, inside [fromMs, toMs - 1 ms]. `baseDb` is the level between the dips.
struct DuckEntry {
    QString trackId;
    double fromMs = 0;
    double toMs = 0;
    QJsonArray points;
    double baseDb = 0;
};
QJsonObject duckPayload(const QList<DuckEntry>& entries);

}  // namespace nt::audioroles
