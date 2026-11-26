#pragma once

// A subset of the NodeTool timeline sequence (`timelineSequenceResponse`,
// `timelineTrack`, `timelineClip`, `clipTransform` in
// packages/protocol/src/api-schemas/timeline.ts). Field names match the schema.
//
// Each Timeline, Track and Clip keeps its raw JSON object (`raw`). The server
// replaces whole document arrays on save, so a native save must start from
// `raw` and write back only the fields this model owns (DESIGN.md D4).

#include <QJsonObject>
#include <QString>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

namespace nt {

namespace scene {
struct ClipScene;      // src/scene/ClipScene.h: what SceneEval reads beyond the fields below
struct SequenceScene;
}  // namespace scene

struct Vec2 {
    double x = 0.0;
    double y = 0.0;
};

// `clipTransform`. Position is canvas pixels from the canvas centre (y down),
// scale multiplies the contain-fit base, rotation is radians, anchor is the
// pivot in normalized [0,1] source coordinates.
struct ClipTransform {
    Vec2 position{0.0, 0.0};
    Vec2 scale{1.0, 1.0};
    double rotation = 0.0;
    Vec2 anchor{0.5, 0.5};
    // 2.5D: degrees about the x and y axes, the perspective distance in px,
    // and the depth that orders cards in a track and places them under the
    // scene camera (camera2d).
    std::optional<double> rotationX;
    std::optional<double> rotationY;
    std::optional<double> perspective;
    std::optional<double> depthPx;
};

// `clipTransition` on the incoming clip. Only the fields that set the opacity
// of the two sides are modelled. `easing` is read but not applied yet, so an
// eased cut resolves linearly (see SceneEval).
struct ClipTransitionIn {
    std::string type;  // "crossfade", "dipToColor", ...; unknown types act as crossfade
    double durationMs = 0.0;  // <= 0 is an explicit hard cut
    std::string easing;
};

enum class TrackType { Video, Audio, Overlay, Subtitle, Midi, Chord };
enum class MediaType { Image, Video, Audio, Overlay, Text, Shape, Model3d, Group, Adjustment, Midi };

// One UI writer publishes a bounded return ramp. Render readers copy atomics
// once per block with a sequence check, retaining their preceding copy on contention.
struct MixerReturn {
    static_assert(std::atomic<std::uint64_t>::is_always_lock_free);
    struct Snapshot {
        std::uint64_t generation=0;
        bool untilPlan=false;
        double startMs=std::numeric_limits<double>::quiet_NaN();
        std::array<double,21> values{};
        bool active(double time) const noexcept { return untilPlan || (std::isfinite(startMs) && time>=startMs && time<=startMs+200.); }
        double at(double time) const noexcept {
            if (untilPlan) { return values[0]; }
            const double position=std::clamp((time-startMs)/10.,0.,20.);
            const auto i=static_cast<std::size_t>(position);
            return i==20 ? values[20] : values[i]+(values[i+1]-values[i])*(position-static_cast<double>(i));
        }
    };
    void publish(const Snapshot& next) noexcept {
        sequence.fetch_add(1,std::memory_order_acq_rel);
        untilPlan.store(next.untilPlan,std::memory_order_release);
        startMs.store(next.startMs,std::memory_order_release);
        for (std::size_t i=0;i<values.size();++i) { values[i].store(next.values[i],std::memory_order_release); }
        sequence.fetch_add(1,std::memory_order_release);
    }
    void read(Snapshot& next) const noexcept {
        const auto before=sequence.load(std::memory_order_acquire);
        if (before&1) { return; }
        Snapshot copy;
        copy.untilPlan=untilPlan.load(std::memory_order_acquire);
        copy.startMs=startMs.load(std::memory_order_acquire);
        for (std::size_t i=0;i<values.size();++i) { copy.values[i]=values[i].load(std::memory_order_acquire); }
        // Keep every payload load before the closing sequence check on weakly ordered CPUs.
        std::atomic_thread_fence(std::memory_order_acquire);
        if (before==sequence.load(std::memory_order_relaxed)) { copy.generation=before; next=copy; }
    }
    std::uint64_t generation() const noexcept { return sequence.load(std::memory_order_acquire); }
private:
    std::atomic<std::uint64_t> sequence{0};
    std::atomic<bool> untilPlan{false};
    std::atomic<double> startMs{std::numeric_limits<double>::quiet_NaN()};
    std::array<std::atomic<double>,21> values{};
};
// UI writes atomics, audio reads them. Shared by immutable mix plans so an old
// plan can finish after the model releases its reference. NaN releases a target.
struct MixerOverride {
    static_assert(std::atomic<double>::is_always_lock_free);
    std::atomic<double> volumeDb{std::numeric_limits<double>::quiet_NaN()};
    std::atomic<double> pan{std::numeric_limits<double>::quiet_NaN()};
    MixerReturn volumeReturn, panReturn;
};
// Immutable parameter address/base, shared atomic handoff owned by the model and plans.
struct DeviceParameter {
    std::string deviceId;
    std::string name;
    double base = 0;
    std::shared_ptr<MixerOverride> state;
    std::shared_ptr<std::atomic<std::uint64_t>> revision;
    std::uint64_t generation=0;
};
struct Track {
    std::string id;
    std::string name;
    TrackType type = TrackType::Video;
    int index = 0;  // UI row. Index 0 is the top row and draws on top.
    bool visible = true;
    bool locked = false;
    bool muted = false;
    // The mix (DESIGN.md D25): `solo` groups audio and midi tracks, the fader
    // in dB, and the stereo pan in [-1, 1].
    bool solo = false;
    double volumeDb = 0.0;
    double pan = 0.0;
    QJsonObject raw;
    // Runtime only. Model and mix plans share the atomic handoff lifetime.
    std::shared_ptr<MixerOverride> mixerOverride;
    std::vector<DeviceParameter> deviceParameters;
};

struct TimeRemapKeyframe {
    double t = 0.0;
    double sourceMs = 0.0;
    std::string easing;
};
struct ClipTimeRemap {
    std::vector<TimeRemapKeyframe> keyframes;
};

struct Clip {
    std::string id;
    std::string trackId;
    std::string name;
    double startMs = 0.0;
    double durationMs = 0.0;
    double inPointMs = 0.0;
    MediaType mediaType = MediaType::Video;
    std::optional<int> width;
    std::optional<int> height;
    bool hidden = false;
    bool muted = false;
    double opacity = 1.0;
    // Picture fades (`fadeInMs`/`fadeOutMs`, shapes "linear", "sCurve",
    // "plus3dB", "minus3dB"; anything else reads as linear).
    double fadeInMs = 0.0;
    double fadeOutMs = 0.0;
    // A stored zero disables the automatic fade on that edge.
    bool hasFadeInMs = false;
    bool hasFadeOutMs = false;
    std::string fadeInShape;
    std::string fadeOutShape;
    // Source rate: `speedBaked` media plays at 1, else `speedMultiplier`.
    double speedMultiplier = 1.0;
    bool speedBaked = false;
    std::optional<ClipTimeRemap> timeRemap;
    // The mix (D25): clip gain in dB, the link to an extracted-audio partner,
    // and the generation status (`effectiveAssetId` in clipAudio.ts).
    double volumeDb = 0.0;
    std::string linkId;
    std::string status;
    std::optional<ClipTransform> transform;
    // Absent: the clip dissolves in across its head overlap with an earlier
    // clip on the same track (the web's auto cross-fade).
    std::optional<ClipTransitionIn> transitionIn;
    // Prototype-only, not in the schema: a local media file for the decoder
    // step. A real document references `currentAssetId` instead.
    std::string mediaPath;
    // The full-quality picture source. Preview may read a proxy at mediaPath;
    // export must use this original when it is resolved. Session-only.
    std::string originalMediaPath;
    // The local file that audio reads. A server open (src/server/) sets it to
    // the original even when `mediaPath` is the video proxy, which has no
    // audio track (DESIGN.md F4). Empty: audio reads `mediaPath`.
    std::string audioPath;
    // Resolved for this session only; never serialized into the document.
    std::string generatedMattePath;
    // Groups, animations, repeaters, mattes and the other scene fields,
    // parsed once from `raw` (src/scene/ClipScene.h). Null: none of them.
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<const scene::ClipScene> scene;
    QJsonObject raw;

    double endMs() const { return startMs + durationMs; }
};

struct Timeline {
    std::string id;
    std::string name;
    double fps = 30.0;
    bool dropFrame = false;
    int width = 1920;
    int height = 1080;
    double durationMs = 0.0;
    // Shared by the UI model and audio plans for atomic live master preview.
    std::shared_ptr<MixerOverride> masterMixerOverride;
    std::vector<DeviceParameter> masterDeviceParameters;
    double masterVolumeDb = 0.0;  // `master.volumeDb`
    std::vector<Track> tracks;
    std::vector<Clip> clips;
    // The scene camera (camera2d), parsed from `raw` (src/scene/ClipScene.h).
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<const scene::SequenceScene> scene;
    QJsonObject raw;  // the whole sequence object, tracks and clips included
    // Names this snapshot's content: TimelineModel gives every new snapshot a
    // new value from nextTimelineRevision(), so a cache keyed by it (the flex
    // layout's) is never stale. 0: a document no model owns, never cached.
    std::uint64_t revision = 0;
    // Clip id to its index in `clips`, shared by snapshots with the same ids
    // in the same order. Null: not built; findClip then scans.
    std::shared_ptr<const std::unordered_map<std::string, std::size_t>> clipIndex;

    // Viewer-only qualifier matte selection. Never serialized into raw.
    std::string matteClipId, matteEffectId;
    // Local file path when loaded from disk. Never serialized into raw.
    QString sourcePath;

    // Builds `clipIndex` from `clips`. Call it after the ids or their order change.
    void indexClips() {
        auto index = std::make_shared<std::unordered_map<std::string, std::size_t>>();
        index->reserve(clips.size());
        for (std::size_t i = 0; i < clips.size(); ++i) index->emplace(clips[i].id, i);
        clipIndex = std::move(index);
    }

    // A stale index entry (a copy with edited `clips`) falls back to a scan.
    const Clip* findClip(const std::string& clipId) const {
        if (clipIndex) {
            const auto it = clipIndex->find(clipId);
            if (it != clipIndex->end() && it->second < clips.size() && clips[it->second].id == clipId) return &clips[it->second];
        }
        for (const auto& c : clips) {
            if (c.id == clipId) return &c;
        }
        return nullptr;
    }

    const Track* findTrack(const std::string& trackId) const {
        for (const auto& t : tracks) {
            if (t.id == trackId) {
                return &t;
            }
        }
        return nullptr;
    }
};

// A process-wide counter: two snapshots never share a revision.
inline std::uint64_t nextTimelineRevision() {
    // native-rules #14: static mutable revision counter
    static std::atomic<std::uint64_t> next{1};
    return next.fetch_add(1, std::memory_order_relaxed);
}

}  // namespace nt
