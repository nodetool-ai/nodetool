#pragma once

// The two document edits of music mode (docs/MUSIC-MODE.md sections 9.1 to
// 9.3, MD14, MD15). Both are registered through registerEdit, so each is one
// undo step through TimelineModel::applyEdit, and both are denied to the
// assistant (src/aiassist/AssistantCommandTable.cpp).
//
// `music.insertPlaceholder` payload: {"clip": <placeholderClip(...)>}.
// It refuses (returns the document unchanged) when the track is missing,
// locked or not an audio track, when the clip id exists, or when an audio
// clip on the track overlaps the range.
//
// `music.applyResult` payload:
//   {"clipId", "task": "text2music" | "repaint" | "lego", "requestId",
//    "jobId", "provider", "model", "prompt", "createdAt",
//    "takes": [{"assetId", "candidate", "segment", "record"}],
//    "insertClip"?: <clip>}
// It writes the takes in order and activates the first new one. A generated
// clip (text2music, lego) gets `status: "generated"`. A repaint records the
// clip's current asset as a baseline take when no take holds it, and keeps
// the clip's position, source window, gain and fades. A take whose asset the
// clip already holds is skipped, so applying a result twice adds nothing. No
// take and no asset is removed (TK-5). With `insertClip`, a missing clip is
// inserted first under the placeholder rules (placing an orphaned result).
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

// A clip with `status: "queued"` over [startFrame, endFrame) at 48 kHz on
// `trackId`: `audioRole: "music"`, 5 ms fades at both edges, `inPointMs: 0`
// and `outPointMs` equal to its duration (GN-7, AL-3, MD14).
[[nodiscard]] QJsonObject placeholderClip(const QString& clipId, const QString& trackId, std::int64_t startFrame,
                                          std::int64_t endFrame, const QString& prompt, const QString& provider,
                                          const QString& model);

[[nodiscard]] QJsonObject insertPlaceholder(QJsonObject raw, const QJsonObject& payload);
[[nodiscard]] QJsonObject applyResult(QJsonObject raw, const QJsonObject& payload);

// The id a take of `requestId` with `assetId` gets: stable, so a repeated
// placement finds it.
[[nodiscard]] QString musicTakeId(const QString& requestId, const QString& assetId);

} // namespace nt::music
