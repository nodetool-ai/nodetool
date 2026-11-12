#pragma once

// What the clean-up command removes (docs/MUSIC-MODE.md TK-5, MR8, MR10).
//
// An unused take is an inactive music take: a `versions` entry with a
// `musicGeneration` record that is neither the clip's `activeTakeId` nor its
// `currentAssetId`. A context bounce is a server asset whose metadata says
// `generation_context: "music"` and names this sequence in `sequence_id`.
//
// The plan removes every unused take from its clip and deletes its audio,
// except a take whose audio something still needs: a locked clip or track,
// any other part of the document (another clip, an active take, a take that
// stays, a generation record's splice parent), or a job in the job list.
// It deletes every context bounce of the sequence that no remaining part of
// the document names and no job holds. Takes are kept by asset: when one
// take of an asset stays, every take of that asset stays.
//
// `music.removeTakes` is the edit: one undo step that removes the named
// takes, never an active one and never one on a locked clip or track.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include <QJsonArray>
#include <QJsonObject>
#include <QList>
#include <QSet>
#include <QString>
#include <QStringList>

namespace nt::music {

struct CleanupTake {
    QString clipId;
    QString clipName;
    QString takeId;
    QString label;
    QString assetId;
    QString keptReason;  // empty: removed and its audio deleted
};

struct CleanupContext {
    QString assetId;
    QString name;
    QString keptReason;  // empty: deleted
};

struct CleanupPlan {
    QList<CleanupTake> takes;  // every unused take, removed or kept
    QList<CleanupContext> contexts;
    QStringList deleteAssetIds;  // unique, take audio first, in document order
    // The `music.removeTakes` payload: `{takes: [{clipId, takeId}]}`.
    [[nodiscard]] QJsonObject removal() const;
};

// `contextAssets` are server asset rows (`assets.search`); rows that are not
// context bounces of this sequence are ignored. `protectedAssetIds` are the
// assets the job list still holds.
[[nodiscard]] CleanupPlan planTakeCleanup(const QJsonObject& rawSequence, const QJsonArray& contextAssets,
                                          const QSet<QString>& protectedAssetIds);
[[nodiscard]] bool isContextAssetOf(const QJsonObject& asset, const QString& sequenceId);
// The members of `ids` that `value` names: as a whole string, or as a
// 32-character hex run inside one (an `asset://` URI or a URL).
[[nodiscard]] QSet<QString> namedAssetIds(const QJsonValue& value, const QSet<QString>& ids);
// The `music.removeTakes` edit.
[[nodiscard]] QJsonObject removeTakes(QJsonObject raw, const QJsonObject& payload);

}  // namespace nt::music
