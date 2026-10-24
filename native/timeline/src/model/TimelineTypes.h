#pragma once

// A subset of the NodeTool timeline sequence (`timelineSequenceResponse`,
// `timelineTrack`, `timelineClip`, `clipTransform` in
// packages/protocol/src/api-schemas/timeline.ts). Field names match the schema.
//
// Each Timeline, Track and Clip keeps its raw JSON object (`raw`). The server
// replaces whole document arrays on save, so a native save must start from
// `raw` and write back only the fields this model owns (DESIGN.md D4).

#include <QJsonObject>

#include <optional>
#include <string>
#include <vector>

namespace nt {

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
    std::optional<ClipTransform> transform;
    // Absent: the clip dissolves in across its head overlap with an earlier
    // clip on the same track (the web's auto cross-fade).
    std::optional<ClipTransitionIn> transitionIn;
    // Prototype-only, not in the schema: a local media file for the decoder
    // step. A real document references `currentAssetId` instead.
    std::string mediaPath;
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
    std::vector<Track> tracks;
    std::vector<Clip> clips;
    QJsonObject raw;  // the whole sequence object, tracks and clips included

    const Track* findTrack(const std::string& trackId) const {
        for (const auto& t : tracks) {
            if (t.id == trackId) {
                return &t;
            }
        }
        return nullptr;
    }
};

}  // namespace nt
