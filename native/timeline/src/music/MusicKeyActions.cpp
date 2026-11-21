// The music key actions (docs/MUSIC-MODE.md MD11, TK-2). Their keys come from
// the keyboard preset (KeymapOverlay.h): P for the Range tool in every layout,
// and in the Music layout's context R, V, L, [ and ]. The shortcut sheet
// lists them. Compiled into the QML module, so every editor host has them.

#include "edit/ClipGestureController.h"
#include "model/TimelineModel.h"
#include "music/MusicSelection.h"
#include "music/MusicTime.h"
#include "wiring/KeyActions.h"

#include <QJsonArray>

namespace {
// The audio clip on the range's track that holds the whole range, as the music panel's take list finds it.
QJsonObject clipUnderRange(const QJsonObject& raw, const MusicSelection& range) {
    for (const auto& value : raw.value(u"clips").toArray()) {
        const auto clip = value.toObject();
        const double start = clip.value(u"startMs").toDouble();
        const auto first = nt::music::msToFrame(start);
        const auto last = nt::music::msToFrame(start + clip.value(u"durationMs").toDouble());
        if (clip.value(u"trackId").toString() == range.trackId() && clip.value(u"mediaType").toString() == u"audio" &&
            first <= range.startFrame() && last >= range.endFrame()) {
            return clip;
        }
    }
    return {};
}

// Makes the next (`step` 1) or previous (-1) take of the clip under the music
// range active through `music.selectTake`, one undo step. The live audio
// follows the edit, so the step is heard while the range loops.
bool stepTake(ClipGestureController& gestures, int step) {
    auto* timeline = gestures.timeline();
    auto* range = gestures.musicSelection();
    if (!timeline || !range || !range->active()) return false;
    const auto clip = clipUnderRange(timeline->timeline().raw, *range);
    const auto versions = clip.value(u"versions").toArray();
    if (versions.size() < 2) return false;
    // The take the clip plays: its activeTakeId when that take holds its asset, else the take that does.
    const auto asset = clip.value(u"currentAssetId").toString();
    qsizetype at = -1;
    for (qsizetype i = 0; i < versions.size(); ++i) {
        const auto take = versions[i].toObject();
        if (take.value(u"assetId").toString() != asset) continue;
        if (at < 0 || take.value(u"id").toString() == clip.value(u"activeTakeId").toString()) at = i;
    }
    if (at < 0) at = 0;
    const auto next = versions[(at + step + versions.size()) % versions.size()].toObject();
    return timeline->applyEdit(QStringLiteral("music.selectTake"),
                               {{"clipId", clip.value(u"id")}, {"takeId", next.value(u"id")}}) != 0;
}

const bool rangeTool = nt::wiring::registerKeyAction({QStringLiteral("rangeTool"),
    QStringLiteral("Range tool (choose bars on a track to generate)"), {},
    [](ClipGestureController& gestures, const QVariantMap&) {
        gestures.setActiveTool(QStringLiteral("range"));
        return true;
    },
    QStringLiteral("Tools")});

const bool loopRange = nt::wiring::registerKeyAction({QStringLiteral("loopMusicRange"),
    QStringLiteral("Loop the music range"), {},
    [](ClipGestureController& gestures, const QVariantMap& context) {
        if (context.value(QStringLiteral("autoRepeat")).toBool()) return gestures.musicSelection()->active();
        return gestures.loopMusicSelection();
    },
    QStringLiteral("Playback")});

const bool previousTake = nt::wiring::registerKeyAction({QStringLiteral("previousMusicTake"),
    QStringLiteral("Previous take of the clip under the music range"), {},
    [](ClipGestureController& gestures, const QVariantMap&) { return stepTake(gestures, -1); },
    QStringLiteral("Editing")});

const bool nextTake = nt::wiring::registerKeyAction({QStringLiteral("nextMusicTake"),
    QStringLiteral("Next take of the clip under the music range"), {},
    [](ClipGestureController& gestures, const QVariantMap&) { return stepTake(gestures, 1); },
    QStringLiteral("Editing")});
} // namespace
