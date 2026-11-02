// Behaviour ported from FilmCraft (https://github.com/storytold/filmcraft), crates/engine/src/multicam.rs, MIT.
// See licenses/FilmCraft-MIT.txt.
#pragma once

#include "edit/EditActions.h"

#include <QJsonObject>
#include <QString>
#include <QStringList>

// Choosing a clip's take with number keys. Everything here works on the clips
// and changes no model. TakeSwitcher commits the results.
namespace nt::takes {
// A number key picks from these takes of `versions`, in document order: the ones that finished.
QList<QJsonObject> selectableTakes(const QJsonObject& clip);
// The index in selectableTakes of the take the clip shows, or -1.
int activeTakeIndex(const QJsonObject& clip);
QString takeName(const QJsonObject& take, int number);
// "2/4" for a clip with more than one take, otherwise empty.
QString takeBadge(const QJsonObject& clip);
// The source time a take shows at timeline time `timeMs` on this clip.
double takeSourceMs(const QJsonObject& clip, const QString& takeId, double timeMs);

struct Lookup {
    QStringList selection;
    nt::edit::IdSet targetedTracks;
    // Track ids from the top of the picture down.
    QStringList tracksTopDown;
    double timeMs = 0;
};
// The clips a number key switches: the selected clips with takes, or else the
// top clip with takes at the playhead on a targeted track.
QStringList switchTargets(const nt::edit::EditDoc& doc, const Lookup& lookup);
// The clip a cut applies to: a selected clip with takes under the playhead, or else as above.
QString cutTarget(const nt::edit::EditDoc& doc, const Lookup& lookup);

struct TakeEdit {
    nt::edit::ClipList clips;
    QString error;
    // The clip now showing the take: a new id when the edit split the clip.
    QString resultId;
    bool changed = false;
};
// Applies take `index` of selectableTakes to one clip. Timing, transform, effects and fades stay.
TakeEdit switchTake(const nt::edit::EditDoc& doc, const QString& clipId, int index);
// Splits the clip at `timeMs` and shows take `index` after the split. At the
// clip's start it switches the whole clip. With `splitSameTake` false, asking for
// the take the clip already shows changes nothing, so a second press adds no edit.
TakeEdit cutToTake(const nt::edit::EditDoc& doc, const QString& clipId, double timeMs, int index, bool splitSameTake);
}
