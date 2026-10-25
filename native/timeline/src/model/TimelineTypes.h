#pragma once

// A subset of the NodeTool timeline sequence (`timelineSequenceResponse`,
// `timelineTrack`, `timelineClip`, `clipTransform` in
// packages/protocol/src/api-schemas/timeline.ts). Field names match the schema.
//
// Each Timeline, Track and Clip keeps its raw JSON object (`raw`). The server
// replaces whole document arrays on save, so a native save must start from
// `raw` and write back only the fields this model owns (DESIGN.md D4).

#include <QJsonObject>

#include <atomic>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
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
    std::string fadeInShape;
    std::string fadeOutShape;
    // Source rate: `speedBaked` media plays at 1, else `speedMultiplier`.
    double speedMultiplier = 1.0;
    bool speedBaked = false;
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
    // The local file that audio reads. A server open (src/server/) sets it to
    // the original even when `mediaPath` is the video proxy, which has no
    // audio track (DESIGN.md F4). Empty: audio reads `mediaPath`.
    std::string audioPath;
    // Groups, animations, repeaters, mattes and the other scene fields,
    // parsed once from `raw` (src/scene/ClipScene.h). Null: none of them.
    std::shared_ptr<const scene::ClipScene> scene;
    QJsonObject raw;

    double endMs() const { return startMs + durationMs; }
};

struct Timeline {
    std::string id;
    std::string name;
    double fps = 30.0;
    int width = 1920;
    int height = 1080;
    double durationMs = 0.0;
    double masterVolumeDb = 0.0;  // `master.volumeDb`
    std::vector<Track> tracks;
    std::vector<Clip> clips;
    // The scene camera (camera2d), parsed from `raw` (src/scene/ClipScene.h).
    std::shared_ptr<const scene::SequenceScene> scene;
    QJsonObject raw;  // the whole sequence object, tracks and clips included
    // Names this snapshot's content: TimelineModel gives every new snapshot a
    // new value from nextTimelineRevision(), so a cache keyed by it (the flex
    // layout's) is never stale. 0: a document no model owns, never cached.
    std::uint64_t revision = 0;

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
    static std::atomic<std::uint64_t> next{1};
    return next.fetch_add(1, std::memory_order_relaxed);
}

}  // namespace nt
