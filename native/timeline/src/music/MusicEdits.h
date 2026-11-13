#pragma once

// The document edits of music mode (docs/MUSIC-MODE.md sections 9.1 to 9.3,
// MD3, MD14, MD15, TK-2, TK-5, TK-6). Each is registered through
// registerEdit, so each is one undo step through TimelineModel::applyEdit.
// `music.insertPlaceholder` and `music.applyResult` are denied to the
// assistant (src/aiassist/AssistantCommandTable.cpp).
//
// `music.insertPlaceholder` payload: {"clip": <placeholderClip(...)>}.
// It refuses (returns the document unchanged) when the track is missing,
// locked or not an audio track, when the clip id exists, or when an audio
// clip on the track overlaps the range. Overlap is compared in frames
// (msToFrame), as the planner compares it.
//
// `music.applyResult` payload:
//   {"clipId", "task": "text2music" | "repaint" | "lego", "requestId",
//    "jobId", "provider", "model", "prompt", "createdAt",
//    "takes": [{"assetId", "candidate", "segment", "record"}],
//    "insertClip"?: <clip>}
// It writes the takes in order and activates the first new one. A generated
// clip (text2music, lego) gets `status: "generated"`. A repaint names as its
// parent the take of the record's `splice.parentAssetId` (the clip's current
// asset when the record has none), records that asset and the clip's current
// asset as baseline takes when no take holds them, and keeps the clip's
// position, source window, gain and fades. A take whose asset the
// clip already holds is skipped, so applying a result twice adds nothing. No
// take and no asset is removed (TK-5). With `insertClip`, a missing clip is
// inserted first under the placeholder rules (placing an orphaned result).
//
// `music.recordPrompt` payload: {"prompt"}. It puts the trimmed prompt first
// in `music.promptHistory`, drops its older copies and keeps the newest
// kPromptHistoryCap (MD3, TK-6). It refuses an empty prompt, a sequence with
// no `music` object, and a prompt that already leads the history.
//
// `music.selectTake` payload: {"clipId", "takeId"}. It makes the take active
// through nt::ai::applyTake, the take selection the number keys use (TK-2),
// and keeps the clip's `status`: music takes carry no dependency hash, so
// applyTake's "stale" would misreport a generated clip.
//
// `music.deleteTake` payload: {"clipId", "takeId"}. It removes the take from
// the clip's `versions` through nt::ai::deleteTake, which refuses the active
// take. The asset stays in the asset store (TK-5).
//
// The two take edits refuse a locked clip or track.
//
// Take labels follow the music mode mockup: a letter per candidate and a
// number per segment when the result has several ("Take A", "Take B2"), and
// "Repaint A · bars 3–4" for a repaint.
//
// Music takes carry no `sourceMapping` and no `variationIndex`: every take of
// a clip shares one asset layout (MD14, MF3), and the candidate and segment
// live in `musicGeneration.candidateIndex` and `segmentIndex`.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include <QJsonObject>
#include <QString>

#include <cstdint>

namespace nt::music {

inline constexpr double kPlaceholderFadeMs = 5.0;
// MAX_MUSIC_PROMPT_HISTORY in packages/protocol/src/api-schemas/timeline.ts.
inline constexpr int kPromptHistoryCap = 50;

// A clip with `status: "queued"` over [startFrame, endFrame) at 48 kHz on
// `trackId`: `audioRole: "music"`, 5 ms fades at both edges, `inPointMs: 0`
// and `outPointMs` equal to its duration (GN-7, AL-3, MD14).
[[nodiscard]] QJsonObject placeholderClip(const QString& clipId, const QString& trackId, std::int64_t startFrame,
                                          std::int64_t endFrame, const QString& prompt, const QString& provider,
                                          const QString& model);

[[nodiscard]] QJsonObject insertPlaceholder(QJsonObject raw, const QJsonObject& payload);
[[nodiscard]] QJsonObject applyResult(QJsonObject raw, const QJsonObject& payload);
[[nodiscard]] QJsonObject recordPrompt(QJsonObject raw, const QJsonObject& payload);
[[nodiscard]] QJsonObject selectTake(QJsonObject raw, const QJsonObject& payload);
[[nodiscard]] QJsonObject deleteTake(QJsonObject raw, const QJsonObject& payload);

// The id a take of `requestId` with `assetId` gets: stable, so a repeated
// placement finds it.
[[nodiscard]] QString musicTakeId(const QString& requestId, const QString& assetId);

} // namespace nt::music
