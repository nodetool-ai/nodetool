#pragma once
#include "edit/ClipOps.h"
#include <QJsonArray>
#include <QMap>

namespace nt::edit::clipboard {
int copyClipsToClipboard(const ClipList &clips);
bool hasClipboardClips();
int clipboardClipCount();
std::optional<QJsonObject> firstClipboardClip();
void clearClipClipboard();
ClipList buildPastedClips(const QJsonArray &tracks, double atMs,
                          const std::optional<IdSet> &targetedTrackIds = std::nullopt);
ClipList cloneClips(const ClipList &clips);
ClipList cloneClipsToTrack(const ClipList &clips, const QString &trackId);
QJsonObject makeClip(const QJsonObject &overrides);

QStringList pasteAttributeGroups();
bool attributeGroupApplies(const QString &group, const QJsonObject &target);
using AttributePatch = QMap<QString, QJsonValue>;
AttributePatch attributePatch(const QJsonObject &source, const QJsonObject &target, const IdSet &groups);
struct TrackBounds {
    QString trackId;
    double top = 0;
    double bottom = 0;
};
QStringList marqueeSelection(const ClipList &clips, const std::vector<TrackBounds> &rows, double startMs, double endMs,
                             double top, double bottom, const QStringList &baseSelection = {});
QJsonObject applyClipboardEdit(const QString &name, QJsonObject raw, const QJsonObject &payload);
} // namespace nt::edit::clipboard
