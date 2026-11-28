#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QStringList>
#include <cmath>
struct StressStats {
    int tracks = 0;
    int clips = 0;
    int midiNotes = 0;
    int markers = 0;
    QString heroMidiClipId;
    QString heroVideoClipId;
    qint64 jsonBytes = 0;
};

QJsonObject buildStressDocument(StressStats& stats) {
    constexpr int kVideoTracks = 8;
    constexpr int kAudioTracks = 16;
    constexpr int kMidiTracks = 40;
    constexpr int kTotalMarkers = 500;
    constexpr double kDurationMs = 180000.0;

    QJsonArray tracks;
    QStringList videoTrackIds, audioTrackIds, midiTrackIds;

    auto makeAutomationLanes = [](const QString& prefix) {
        QJsonArray lanes;
        QJsonArray pts;
        for (int p = 0; p < 16; ++p) {
            pts.append(QJsonObject{
                {"id", QStringLiteral("%1-pt-%2").arg(prefix).arg(p)},
                {"timeMs", p * 10000.0},
                {"value", 0.5 + 0.3 * std::sin(p * 0.7)},
                {"easing", "linear"},
            });
        }
        lanes.append(QJsonObject{
            {"id", prefix + "-vol"},
            {"target", QJsonObject{{"kind", "track"}, {"param", "volume"}}},
            {"enabled", true},
            {"points", pts},
        });
        return lanes;
    };

    // Video rows 0..7, MIDI rows 8..47 (hero at 8), audio rows 48..63.
    int idx = 0;
    for (int i = 0; i < kVideoTracks; ++i, ++idx) {
        const QString id = QStringLiteral("track-v-%1").arg(i);
        videoTrackIds.append(id);
        tracks.append(QJsonObject{
            {"id", id}, {"name", QStringLiteral("Video %1").arg(i + 1)},
            {"type", "video"}, {"index", idx}, {"visible", true},
            {"locked", false}, {"muted", false}, {"heightPx", 56.0},
            {"color", "#4A90D9"},
        });
    }
    for (int i = 0; i < kMidiTracks; ++i, ++idx) {
        const QString id = QStringLiteral("track-m-%1").arg(i);
        midiTrackIds.append(id);
        tracks.append(QJsonObject{
            {"id", id}, {"name", QStringLiteral("MIDI %1").arg(i + 1)},
            {"type", "midi"}, {"index", idx}, {"visible", true},
            {"locked", false}, {"muted", false}, {"heightPx", 52.0},
            {"volume", 0.8}, {"pan", 0.0}, {"color", "#9F7AEA"},
            {"automationMode", "read"},
            {"automation", makeAutomationLanes(id)},
        });
    }
    for (int i = 0; i < kAudioTracks; ++i, ++idx) {
        const QString id = QStringLiteral("track-a-%1").arg(i);
        audioTrackIds.append(id);
        tracks.append(QJsonObject{
            {"id", id}, {"name", QStringLiteral("Audio %1").arg(i + 1)},
            {"type", "audio"}, {"index", idx}, {"visible", true},
            {"locked", false}, {"muted", false}, {"heightPx", 52.0},
            {"volume", 0.85}, {"pan", 0.0}, {"color", "#38B2AC"},
            {"automationMode", "read"},
            {"automation", makeAutomationLanes(id)},
        });
    }

    QJsonArray clips;
    int totalNotes = 0;

    auto makeAnimations = []() {
        auto makeCurve = [](const QString& prop, double v0, double v1) {
            QJsonArray kfs;
            for (int k = 0; k < 8; ++k) {
                kfs.append(QJsonObject{
                    {"timeMs", k * 600.0},
                    {"value", (k % 2 == 0) ? v0 : v1},
                    {"easing", "easeInOut"},
                });
            }
            return QJsonObject{{"property", prop}, {"keyframes", kfs}};
        };
        QJsonArray curves;
        curves.append(makeCurve("opacity", 0.5, 1.0));
        curves.append(makeCurve("scaleX", 0.9, 1.1));
        curves.append(makeCurve("scaleY", 0.9, 1.1));
        curves.append(makeCurve("x", -40.0, 40.0));
        curves.append(makeCurve("y", -20.0, 20.0));
        curves.append(makeCurve("rotation", -15.0, 15.0));
        return QJsonArray{QJsonObject{
            {"id", "kf-custom"},
            {"preset", "custom"},
            {"role", "emphasis"},
            {"delayMs", 0.0},
            {"durationMs", 4800.0},
            {"params", QJsonObject{{"keyframed", true}}},
            {"custom", QJsonObject{{"curves", curves}}},
        }};
    };

    // 8 * 32 = 256 video clips
    for (int t = 0; t < kVideoTracks; ++t) {
        const QString& tid = videoTrackIds[t];
        for (int c = 0; c < 32; ++c) {
            const QString cid = QStringLiteral("clip-v-%1-%2").arg(t).arg(c);
            const double startMs = c * 5500.0;
            QJsonObject clip{
                {"id", cid}, {"trackId", tid}, {"mediaType", "video"},
                {"name", QStringLiteral("V%1 Clip %2").arg(t + 1).arg(c + 1)},
                {"startMs", startMs}, {"durationMs", 4800.0},
                {"inPointMs", 0.0}, {"outPointMs", 4800.0},
                {"opacity", 1.0}, {"fadeInMs", (c % 4 == 0) ? 200.0 : 0.0},
                {"fadeOutMs", (c % 4 == 0) ? 200.0 : 0.0},
            };
            if (t == 0 && c == 0) {
                clip.insert("animations", makeAnimations());
                stats.heroVideoClipId = cid;
            } else if (c % 8 == 0) {
                clip.insert("animations", makeAnimations());
            }
            if (c > 0 && c % 5 == 0) {
                clip.insert("transition", QJsonObject{{"type", "crossfade"}, {"durationMs", 400.0}});
            }
            clips.append(clip);
        }
    }

    // 16 * 31 = 496 audio clips
    for (int t = 0; t < kAudioTracks; ++t) {
        const QString& tid = audioTrackIds[t];
        for (int c = 0; c < 31; ++c) {
            const QString cid = QStringLiteral("clip-a-%1-%2").arg(t).arg(c);
            const double startMs = c * 5600.0;
            clips.append(QJsonObject{
                {"id", cid}, {"trackId", tid}, {"mediaType", "audio"},
                {"name", QStringLiteral("A%1 Clip %2").arg(t + 1).arg(c + 1)},
                {"startMs", startMs}, {"durationMs", 4900.0},
                {"inPointMs", 0.0}, {"outPointMs", 4900.0},
                {"volume", 0.9}, {"fadeInMs", 150.0}, {"fadeOutMs", 150.0},
            });
        }
    }

    // 1248 MIDI clips -> 20,000 MIDI notes total (hero clip has 2,000 notes)
    const int heroNotes = 2000;
    const int otherMidiClips = 1247;
    const int remainingNotesTarget = 20000 - heroNotes;
    const int basePerClip = remainingNotesTarget / otherMidiClips;
    const int extraClips = remainingNotesTarget % otherMidiClips;

    int midiClipOrdinal = 0;
    for (int t = 0; t < kMidiTracks; ++t) {
        const QString& tid = midiTrackIds[t];
        const int count = (t < 8) ? 32 : 31;
        for (int c = 0; c < count; ++c) {
            const bool isHero = (t == 0 && c == 0);
            const QString cid = isHero ? QStringLiteral("clip-midi-hero")
                                       : QStringLiteral("clip-m-%1-%2").arg(t).arg(c);
            const int nNotes = isHero ? heroNotes
                                      : (basePerClip + (midiClipOrdinal - 1 < extraClips ? 1 : 0));
            const double startMs = isHero ? 0.0 : (c * 5600.0 + (t == 0 ? 60000.0 : 0.0));
            const double durMs = isHero ? 60000.0 : 4800.0;
            QJsonArray notes;
            for (int n = 0; n < nNotes; ++n) {
                const int startTick = isHero ? ((n / 2) * 110) : (n * 480);
                const int pitch = 48 + ((n * 7 + t * 3) % 36);
                const int vel = 60 + ((n * 13) % 64);
                notes.append(QJsonObject{
                    {"id", QStringLiteral("%1-n%2").arg(cid).arg(n)},
                    {"pitch", pitch},
                    {"velocity", vel},
                    {"startTick", startTick},
                    {"durationTick", isHero ? 240 : 360},
                });
                ++totalNotes;
            }
            QJsonObject clip{
                {"id", cid}, {"trackId", tid}, {"mediaType", "midi"},
                {"name", isHero ? QStringLiteral("Hero Piano 2k Notes")
                                : QStringLiteral("M%1 Clip %2").arg(t + 1).arg(c + 1)},
                {"startMs", startMs}, {"durationMs", durMs},
                {"inPointMs", 0.0}, {"outPointMs", durMs},
                {"notes", notes},
            };
            if (isHero) {
                QJsonArray ccPts;
                for (int k = 0; k < 64; ++k) {
                    ccPts.append(QJsonObject{
                        {"id", QStringLiteral("cc-%1").arg(k)},
                        {"tick", k * 1800},
                        {"value", 40 + (k * 7) % 80},
                    });
                }
                clip.insert("controllers", QJsonArray{QJsonObject{
                    {"id", "lane-mod"}, {"kind", "cc"}, {"controller", 1},
                    {"interpolation", "linear"}, {"points", ccPts},
                }});
                stats.heroMidiClipId = cid;
            }
            clips.append(clip);
            ++midiClipOrdinal;
        }
    }

    QJsonArray markers;
    const QStringList colors = {"#F56565", "#ED8936", "#ECC94B", "#48BB78", "#4299E1", "#9F7AEA"};
    for (int m = 0; m < kTotalMarkers; ++m) {
        QJsonObject mk{
            {"id", QStringLiteral("mk-%1").arg(m)},
            {"timeMs", m * (kDurationMs / kTotalMarkers)},
            {"label", QStringLiteral("Marker %1").arg(m + 1)},
            {"color", colors[m % colors.size()]},
            {"note", QStringLiteral("Cue note for marker %1").arg(m + 1)},
        };
        if (m % 2 == 0) mk.insert("durationMs", 180.0);
        markers.append(mk);
    }

    QJsonObject doc{
        {"id", "f5-stress-timeline"},
        {"name", "F5 Stress Document"},
        {"fps", 30.0},
        {"width", 1920},
        {"height", 1080},
        {"durationMs", kDurationMs},
        {"tempo", QJsonObject{
            {"bpm", 120.0},
            {"offsetMs", 0.0},
            {"timeSignature", QJsonObject{{"beatsPerBar", 4}, {"beatUnit", 4}}},
            {"key", QJsonObject{{"tonic", "C"}, {"mode", "major"}}},
        }},
        {"tracks", tracks},
        {"clips", clips},
        {"markers", markers},
    };

    stats.tracks = tracks.size();
    stats.clips = clips.size();
    stats.midiNotes = totalNotes;
    stats.markers = markers.size();
    return doc;
}

