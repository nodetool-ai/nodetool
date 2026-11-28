#pragma once

// The music planner and tempo rules (docs/MUSIC-MODE.md section 8, MD6, MD9).
// The port of packages/timeline/src/music/plan.ts and tempoRules.ts, held to
// them by the music oracle (music-oracle.test.ts): same operations, windows,
// refusal codes and messages.
//
// Every frame counts 48 kHz frames. Selection frames are timeline positions.
// `segments` and `region` count from the window start, and `splice` counts
// frames in the clip's active take asset.
//
// Thread affinity: pure functions with no state, callable from any thread.

#include "music/MusicTime.h"

#include <QJsonObject>
#include <QString>

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace nt::music {

enum class MusicTask { Text2Music, Repaint, Lego };
inline constexpr std::array<MusicTask, 3> kMusicTasks{MusicTask::Text2Music, MusicTask::Repaint, MusicTask::Lego};

[[nodiscard]] std::string_view taskName(MusicTask task);   // "text2music", "repaint", "lego"
[[nodiscard]] std::string_view taskLabel(MusicTask task);  // "Generate", "Regenerate", "Add instrument"
[[nodiscard]] std::optional<MusicTask> parseTask(std::string_view name);

struct MusicKey {
    std::string tonic;
    std::string mode;
};

struct PlanTempo : MusicTempo {
    std::optional<MusicKey> key;
};

struct PlanTrack {
    std::string id;
    std::string type;  // "audio", "midi", "video", ...
    bool muted = false;
    bool solo = false;
    std::string musicRole;  // empty: no role
};

struct PlanClip {
    std::string id;
    std::string trackId;
    double startMs = 0;
    double durationMs = 0;
    std::string mediaType;
    double inPointMs = 0;
    bool muted = false;
    double speedMultiplier = 1;
    bool speedBaked = false;
    bool timeRemap = false;
    std::string currentAssetId;  // empty: no asset
    std::string status;          // the clip's `status`; empty when absent
};

// The generation target. Doubles, so a selection off whole frames can be refused.
struct Selection {
    std::string trackId;
    double startFrame = 0;
    double endFrame = 0;
};

struct PlanInput {
    PlanTempo tempo;
    Selection selection;
    std::vector<PlanTrack> tracks;
    std::vector<PlanClip> clips;  // every media type; only audio clips take part
    std::optional<MusicTask> operation;
};

struct FrameRange {
    std::int64_t startFrame = 0;
    std::int64_t endFrame = 0;
};

struct Splice {
    std::string parentAssetId;
    std::int64_t startFrame = 0;
    std::int64_t endFrame = 0;
};

struct MusicPlan {
    std::optional<MusicTask> inferred;
    std::vector<MusicTask> valid;
    std::optional<MusicTask> operation;
    std::string reason;
    std::string refusal;  // empty: a request can be built
    Selection target;
    double bpm = 0;
    double beatsPerBar = 0;
    double beatUnit = 0;
    std::optional<MusicKey> key;
    std::optional<std::int64_t> windowStartFrame;
    std::optional<std::int64_t> requestFrames;
    std::optional<std::int64_t> beatPhaseFrames;
    std::optional<std::vector<FrameRange>> segments;
    std::optional<FrameRange> region;
    std::optional<std::string> clipId;
    std::optional<Splice> splice;
    std::optional<std::string> trackRole;
};

inline constexpr std::int64_t kMinWindowFrames = 10 * kSampleRate;
inline constexpr std::int64_t kMaxWindowFrames = 600 * kSampleRate;
inline constexpr int kMaxPrerollBars = 2;

[[nodiscard]] MusicPlan planMusicOperation(const PlanInput& input);

// Tempo rules (tempoRules.ts). Empty string: allowed.
inline constexpr std::string_view kMusicTempoBpmMessage = "A music project needs a whole-number tempo from 30 to 300 BPM.";
inline constexpr std::string_view kMusicTempoSignatureMessage = "A music project uses 2/4, 3/4, 4/4 or 6/8.";
inline constexpr std::string_view kTempoLockedMessage =
    "The tempo cannot change while the sequence holds an audio clip, because the audio would leave the bar grid.";

[[nodiscard]] std::string musicTempoRefusal(const MusicTempo& tempo);
// MD6: the raw sequence holds a clip with mediaType "audio".
[[nodiscard]] bool isTempoLocked(const QJsonObject& rawSequence);
// The refusal of a tempo edit of the raw sequence to `nextTempo` (raw tempo
// JSON): the lock when the timing changes, then MD9 for a music sequence.
[[nodiscard]] QString tempoChangeRefusal(const QJsonObject& rawSequence, const QJsonObject& nextTempo);

// JSON forms used by the oracle and by callers that hold raw documents.
[[nodiscard]] PlanInput planInputFromJson(const QJsonObject& value);
[[nodiscard]] QJsonObject planToJson(const MusicPlan& plan);
[[nodiscard]] MusicTempo tempoFromJson(const QJsonObject& rawTempo);

} // namespace nt::music
