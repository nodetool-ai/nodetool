#include "edit/trim/TrimModel.h"

#include <QElapsedTimer>
#include <QTest>

#include <algorithm>
#include <cmath>

using namespace nt::edit;
using namespace nt::edit::trim;

namespace {
constexpr double FPS = 24;
double frame(double n, double fps = FPS) { return n * 1000 / fps; }
QJsonObject clip(const QString& id, const QString& track, double start, double duration = 2000,
                 const QString& link = {}) {
    return {{"id", id}, {"trackId", track}, {"mediaType", track.startsWith('A') ? "audio" : "video"},
            {"startMs", start}, {"durationMs", duration}, {"inPointMs", 2000}, {"outPointMs", 2000 + duration},
            {"linkId", link}, {"name", id}, {"keep", QJsonObject{{"custom", 17}}}};
}
EditDoc fixture() {
    return {{clip("v0", "V1", 0, 2000, "L0"), clip("a0", "A1", 0, 2000, "L0"),
             clip("v1", "V1", 2000, 2000, "L1"), clip("a1", "A1", 2000, 2000, "L1")},
            {{"V1", "video", false}, {"A1", "audio", false}}, {}, {}};
}
Env environment() {
    Env env;
    env.fps = FPS;
    env.sourceDuration = [](const QJsonObject&) { return std::optional<double>(100000); };
    return env;
}
const QJsonObject& get(const ClipList& clips, const QString& id) {
    const auto it = std::ranges::find_if(clips, [&](const auto& c) { return clipId(c) == id; });
    Q_ASSERT(it != clips.end());
    return *it;
}
EditDoc withClips(EditDoc doc, ClipList clips) { doc.clips = std::move(clips); return doc; }
void valid(const ClipList& clips, double fps = FPS) {
    QHash<QString, std::vector<QJsonObject>> tracks;
    for (const auto& c : clips) {
        if (isGroupClip(c)) { continue; }
        QVERIFY(clipDurationMs(c) + 1 + 1e-3 >= frame(1, fps));
        QVERIFY(clipStartMs(c) >= 0);
        QVERIFY(c.value("inPointMs").toDouble() >= 0);
        tracks[clipTrackId(c)].push_back(c);
    }
    for (auto& track : tracks) {
        std::ranges::sort(track, {}, clipStartMs);
        for (size_t i = 1; i < track.size(); ++i) {
            QVERIFY(clipEndMs(track[i - 1]) <= clipStartMs(track[i]) + 1e-3);
        }
    }
}
}

class TestTrimModel : public QObject {
    Q_OBJECT
private slots:
    void linked_edit_point_selection_and_shift_toggle_data() {
        QTest::addColumn<int>("kind");
        QTest::addColumn<bool>("out");
        for (auto k : {Kind::Trim, Kind::Ripple, Kind::Roll}) {
            for (bool out : {false, true}) {
                QTest::newRow(qPrintable(QString::number(static_cast<int>(k)) + (out ? "-out" : "-in")))
                    << static_cast<int>(k) << out;
            }
        }
    }
    void linked_edit_point_selection_and_shift_toggle() {
        QFETCH(int, kind);
        QFETCH(bool, out);
        const auto doc = fixture();
        auto env = environment();
        EditPoint p{out ? "v0" : "v1", out, static_cast<Kind>(kind)};
        const auto points = select(doc, {}, p, false, env);
        QCOMPARE(points, (EditPoints{p, {out ? "a0" : "a1", out, p.kind}}));
        QVERIFY(select(doc, points, {out ? "a0" : "a1", out, p.kind}, true, env).empty());
        env.linked = false;
        QCOMPARE(select(doc, {}, p, false, env), EditPoints{p});
    }
    void trim_mode_roll_moves_linked_audio_once_data() {
        QTest::addColumn<bool>("out");
        QTest::newRow("in") << false;
        QTest::newRow("out") << true;
    }
    void trim_mode_roll_moves_linked_audio_once() {
        QFETCH(bool, out);
        const auto doc = fixture();
        const auto before = doc.clips;
        const auto env = environment();
        const auto points = linkedPoints(doc, {out ? "v0" : "v1", out, Kind::Roll}, env);
        const auto r = nudgeFrames(doc, points, 3, env);
        QCOMPARE(r.appliedFrames, 3);
        QVERIFY(!r.atLimit);
        for (const auto& id : {"v0", "a0"}) { QCOMPARE(clipEndMs(get(r.clips, id)), frame(51)); }
        for (const auto& id : {"v1", "a1"}) { QCOMPARE(clipStartMs(get(r.clips, id)), frame(51)); }
        QCOMPARE(doc.clips, before);
        valid(r.clips);
    }
    void selected_linked_regular_and_ripple_edges_move_once_data() {
        QTest::addColumn<int>("kind");
        QTest::addColumn<bool>("out");
        for (auto k : {Kind::Trim, Kind::Ripple}) {
            for (bool out : {false, true}) {
                QTest::newRow(qPrintable(QString::number(static_cast<int>(k)) + (out ? "-out" : "-in")))
                    << static_cast<int>(k) << out;
            }
        }
    }
    void selected_linked_regular_and_ripple_edges_move_once() {
        QFETCH(int, kind);
        QFETCH(bool, out);
        const auto doc = fixture();
        const auto k = static_cast<Kind>(kind);
        const auto r = nudgeFrames(doc, {{out ? "v0" : "v1", out, k}, {out ? "a0" : "a1", out, k}},
                                   out ? -3 : 3, environment());
        QCOMPARE(r.appliedFrames, out ? -3 : 3);
        for (const auto& id : out ? QStringList{"v0", "a0"} : QStringList{"v1", "a1"}) {
            QCOMPARE(clipStartMs(get(r.clips, id)), frame(out ? 0 : k == Kind::Ripple ? 48 : 51));
            QCOMPARE(clipEndMs(get(r.clips, id)), frame(out ? 45 : k == Kind::Ripple ? 93 : 96));
        }
        if (out) {
            for (const auto& id : {"v1", "a1"}) {
                QCOMPARE(clipStartMs(get(r.clips, id)), frame(k == Kind::Ripple ? 45 : 48));
            }
        }
        valid(r.clips);
    }
    void nearest_linked_roll_and_dynamic_trim() {
        const auto doc = fixture();
        auto env = environment();
        env.targeting.untargetedTrackIds.insert("A1");
        const auto points = selectNearest(doc, 2000, Kind::Roll, env);
        QCOMPARE(points, (EditPoints{{"v0", true, Kind::Roll}, {"a0", true, Kind::Roll}}));
        env.targeting.untargetedTrackIds.clear();
        QCOMPARE(selectNearest(doc, 2000, Kind::Roll, env), points);
        DynamicTrim dynamic(doc, points, env);
        QCOMPARE(dynamic.shuttle(1, 0), 1.0);
        QVERIFY(dynamic.tick(250));
        QCOMPARE(dynamic.offsetFrames(), 6);
        QCOMPARE(clipEndMs(get(dynamic.clips(), "a0")), 2250.0);
        QCOMPARE(dynamic.baseClips(), doc.clips);
    }
    void linked_trim_roll_uses_the_shortest_handle() {
        auto doc = fixture();
        doc.clips[3].insert("inPointMs", std::ceil(frame(2)));
        auto r = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, -10, environment());
        QCOMPARE(r.appliedFrames, -2);
        QVERIFY(r.atLimit);
        for (const auto& id : {"v0", "a0"}) { QCOMPARE(clipEndMs(get(r.clips, id)), 1916.0); }
        for (const auto& id : {"v1", "a1"}) { QCOMPARE(clipStartMs(get(r.clips, id)), 1916.0); }
        valid(r.clips);
        doc = fixture();
        auto env = environment();
        env.sourceDuration = [](const QJsonObject& c) -> std::optional<double> {
            return clipId(c) == "a0" ? 4000 + frame(2) : 100000;
        };
        r = nudgeFrames(doc, {{"v1", false, Kind::Roll}}, 10, env);
        QCOMPARE(r.appliedFrames, 2);
        QVERIFY(r.atLimit);
        for (const auto& id : {"v0", "a0"}) { QCOMPARE(clipEndMs(get(r.clips, id)), 2083.0); }
        valid(r.clips);
    }
    void linked_trim_respects_locked_tracks() {
        for (auto k : {Kind::Trim, Kind::Ripple, Kind::Roll}) {
            auto doc = fixture();
            doc.tracks[1].locked = true;
            const auto env = environment();
            const auto points = linkedPoints(doc, {"v0", true, k}, env);
            QCOMPARE(points, (EditPoints{{"v0", true, k}}));
            QVERIFY(linkedPoints(doc, {"a0", true, k}, env).empty());
            const auto r = nudgeFrames(doc, points, -3, env);
            QCOMPARE(r.appliedFrames, -3);
            QCOMPARE(clipEndMs(get(r.clips, "v0")), 1875.0);
            QCOMPARE(get(r.clips, "a0"), doc.clips[1]);
            QCOMPARE(get(r.clips, "a1"), doc.clips[3]);
            QCOMPARE(nudgeFrames(doc, {{"a0", true, k}}, -3, env).clips, doc.clips);
        }
    }
    void split_edit_preserves_offset_and_disabled_links_leave_audio() {
        auto doc = fixture();
        auto env = environment();
        env.linked = false;
        doc.clips = nudgeFrames(doc, {{"a0", true, Kind::Roll}}, -4, env).clips;
        QCOMPARE(clipEndMs(doc.clips[1]), 1833.0);
        const auto unlinked = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, 3, env);
        QCOMPARE(unlinked.clips[1], doc.clips[1]);
        QCOMPARE(unlinked.clips[3], doc.clips[3]);
        env.linked = true;
        const auto r = nudgeFrames(doc, linkedPoints(doc, {"v0", true, Kind::Roll}, env), 3, env);
        QCOMPARE(clipEndMs(get(r.clips, "v0")), 2125.0);
        QCOMPARE(clipEndMs(get(r.clips, "a0")), 1958.0);
        QCOMPARE(clipStartMs(get(r.clips, "a1")), 1958.0);
        valid(r.clips);
    }
    void sync_locks() {
        auto doc = fixture();
        doc.tracks.push_back({"V2", "video", false});
        doc.clips.push_back(clip("later", "V2", 4000));
        for (auto k : {Kind::Trim, Kind::Ripple, Kind::Roll}) {
            for (bool off : {false, true}) {
                auto env = environment();
                if (off) { env.targeting.syncLockOffTrackIds.insert("V2"); }
                const auto r = nudgeFrames(doc, {{"v0", true, k}}, -3, env);
                QCOMPARE(r.appliedFrames, -3);
                QCOMPARE(clipStartMs(get(r.clips, "later")), k == Kind::Ripple && !off ? 3875.0 : 4000.0);
            }
        }
    }
    void clamping_data() {
        QTest::addColumn<QString>("id");
        QTest::addColumn<bool>("out");
        QTest::addColumn<int>("kind");
        QTest::addColumn<int>("wanted");
        QTest::addColumn<int>("applied");
        QTest::newRow("ripple-minimum") << QString("v0") << true << 1 << -10000 << -47;
        QTest::newRow("out-neighbour") << QString("v0") << true << 0 << 10 << 0;
        QTest::newRow("in-neighbour") << QString("v1") << false << 0 << -10 << 0;
        QTest::newRow("source-start") << QString("v1") << false << 0 << -100 << -48;
        QTest::newRow("source-end") << QString("v1") << true << 0 << 100 << 2;
        QTest::newRow("roll-left-minimum") << QString("v0") << true << 2 << -100 << -47;
        QTest::newRow("roll-right-minimum") << QString("v1") << false << 2 << 100 << 47;
    }
    void clamping() {
        QFETCH(QString, id);
        QFETCH(bool, out);
        QFETCH(int, kind);
        QFETCH(int, wanted);
        QFETCH(int, applied);
        auto doc = fixture();
        auto env = environment();
        env.linked = kind == static_cast<int>(Kind::Ripple);
        if (QString(QTest::currentDataTag()) == "source-start") { doc.clips.erase(doc.clips.begin()); }
        if (QString(QTest::currentDataTag()) == "source-end") {
            env.sourceDuration = [](const QJsonObject&) { return std::optional<double>(4000 + frame(2)); };
        }
        const EditPoints points{{id, out, static_cast<Kind>(kind)}};
        const auto r = nudgeFrames(doc, points, wanted, env);
        QCOMPARE(r.appliedFrames, applied);
        QVERIFY(r.atLimit);
        QCOMPARE(r.appliedMs, frameEdgeMs(*editTimeMs(doc, points[0]), applied, FPS) - *editTimeMs(doc, points[0]));
        valid(r.clips);
        const auto back = nudgeFrames(withClips(doc, r.clips), points, wanted > 0 ? -1 : 1, env);
        QCOMPARE(back.appliedFrames, wanted > 0 ? -1 : 1);
        QVERIFY(!back.atLimit);
    }
    void each_linked_group_clamps_once() {
        const auto doc = fixture();
        for (auto k : {Kind::Trim, Kind::Ripple, Kind::Roll}) {
            auto env = environment();
            int calls = 0;
            env.edit = [&](const EditDoc& d, const EdgeRequest& r) {
                ++calls;
                return plainEdgeEdit(d, r, env.targeting);
            };
            const auto r = nudgeFrames(doc, {{"v0", true, k}, {"a0", true, k}}, -3, env);
            QCOMPARE(r.appliedFrames, -3);
            QCOMPARE(calls, 1);
            calls = 0;
            const auto limit = nudgeFrames(doc, {{"v0", true, k}, {"a0", true, k}}, -1000000, env);
            QVERIFY(limit.atLimit);
            QVERIFY(calls <= 22);
        }
    }
    void multipoint_trim_by_frames() {
        const auto doc = fixture();
        auto env = environment();
        env.linked = false;
        const auto r = nudgeFrames(doc, {{"v0", true, Kind::Trim}, {"v1", true, Kind::Trim}}, -1, env);
        QCOMPARE(clipEndMs(get(r.clips, "v0")), 1958.0);
        QCOMPARE(clipEndMs(get(r.clips, "v1")), 3958.0);
        QCOMPARE(get(r.clips, "a0"), doc.clips[1]);
        QCOMPARE(get(r.clips, "a1"), doc.clips[3]);
        QCOMPARE(doc.clips, fixture().clips);
    }
    void extend_to_playhead_moves_each_unequal_out_point_to_the_playhead() {
        auto doc = fixture();
        doc.tracks.push_back({"V2", "video", false});
        doc.clips.push_back(clip("overlay", "V2", 0, 1500));
        auto env = environment();
        env.linked = false;
        const auto r = extendToPlayhead(doc, {{"v0", true, Kind::Trim}, {"overlay", true, Kind::Trim}}, 1000, env);
        QCOMPARE(clipEndMs(get(r.clips, "v0")), 1000.0);
        QCOMPARE(clipEndMs(get(r.clips, "overlay")), 1000.0);
        QCOMPARE(r.appliedFrames, -24);
    }
    void roll_without_neighbour_trims_into_gap() {
        auto doc = fixture();
        doc.clips[2].insert("startMs", 2500);
        doc.clips[3].insert("startMs", 2500);
        const auto r = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, 3, environment());
        QCOMPARE(r.appliedFrames, 3);
        QCOMPARE(clipEndMs(get(r.clips, "a0")), 2125.0);
        QCOMPARE(get(r.clips, "v1"), doc.clips[2]);
        QCOMPARE(get(r.clips, "a1"), doc.clips[3]);
    }
    void toggle_kind_and_retarget_for_drag() {
        const auto doc = fixture();
        const auto env = environment();
        const auto points = linkedPoints(doc, {"v1", false, Kind::Roll}, env);
        QCOMPARE(points.size(), size_t(2));
        QCOMPARE(toggleKind(points)[0].kind, Kind::Trim);
        QCOMPARE(toggleKind(toggleKind(points))[0].kind, Kind::Ripple);
        QCOMPARE(toggleKind(toggleKind(toggleKind(points))), points);
        QCOMPARE(retargetForDrag(doc, points, DragSide::Outgoing, env),
                 (EditPoints{{"v0", true, Kind::Ripple}, {"a0", true, Kind::Ripple}}));
        QCOMPARE(retargetForDrag(doc, points, DragSide::Incoming, env),
                 (EditPoints{{"v1", false, Kind::Ripple}, {"a1", false, Kind::Ripple}}));
        const auto between = retargetForDrag(doc, points, DragSide::Between, env);
        QCOMPARE(between.size(), size_t(2));
        QVERIFY(sameEdge(doc, between[0], points[0]));
        QCOMPARE(between[0].kind, Kind::Roll);
        const EditPoints start{{"v0", false, Kind::Trim}};
        QCOMPARE(retargetForDrag(doc, start, DragSide::Outgoing, env), start);
        const EditPoints multiple{{"v0", true, Kind::Trim}, {"v1", true, Kind::Trim}};
        QCOMPARE(retargetForDrag(doc, multiple, DragSide::Incoming, env), multiple);
    }
    void trim_monitor_sides_and_shift_counters() {
        const auto doc = fixture();
        const auto env = environment();
        for (auto k : {Kind::Trim, Kind::Ripple, Kind::Roll}) {
            const EditPoint p{"v1", false, k};
            const auto info = monitorInfo(doc, p, FPS);
            QVERIFY(info.outgoing);
            QVERIFY(info.incoming);
            QCOMPARE(info.outgoing->clipId, QString("v0"));
            QCOMPARE(info.incoming->clipId, QString("v1"));
            QCOMPARE(info.outgoing->frameTimeMs, frame(47));
            QCOMPARE(info.incoming->frameTimeMs, frame(48));
            QCOMPARE(info.outgoing->sourceTimeMs, 2000 + frame(47));
            QCOMPARE(info.incoming->sourceTimeMs, 2000.0);
            QCOMPARE(info.outgoing->name, QString("v0"));
            QCOMPARE(info.incomingMoves, true);
            QCOMPARE(info.outgoingMoves, k == Kind::Roll);
            const auto anchor = shiftAnchor(doc, p);
            const auto r = nudgeFrames(doc, {p}, 3, env);
            QCOMPARE(shiftFrom(withClips(doc, r.clips), anchor, FPS), (Shift{k == Kind::Roll ? 3 : 0, 3}));
            QCOMPARE(shiftFrom(doc, anchor, FPS), Shift{});
        }
        const auto gap = monitorInfo(doc, {"v1", true, Kind::Roll}, FPS);
        QVERIFY(gap.outgoing);
        QVERIFY(!gap.incoming);
        QVERIFY(!monitorInfo(doc, {"missing", true, Kind::Trim}, FPS).outgoing);
        const auto start = monitorInfo(doc, {"v0", false, Kind::Trim}, FPS);
        QVERIFY(!start.outgoing);
        QVERIFY(start.incoming);
    }
    void every_point_holds_where_the_first_stopped() {
        auto env = environment();
        env.linked = false;
        // v0 has 12 frames left in its source and v1 has plenty.
        env.sourceDuration = [](const QJsonObject& c) {
            return std::optional<double>(clipId(c) == "v0" ? 4000 + std::ceil(frame(12)) : 100000);
        };
        auto doc = fixture();
        doc.clips[2].insert("startMs", 6000);
        doc.clips[3].insert("startMs", 6000);
        DynamicTrim dynamic(doc, {{"v0", true, Kind::Trim}, {"v1", true, Kind::Trim}}, env);
        dynamic.shuttle(1, 0);
        QVERIFY(dynamic.tick(frame(14)));
        QVERIFY(dynamic.atLimit());
        QCOMPARE(dynamic.offsetFrames(), 12);
        const double second = clipEndMs(get(dynamic.clips(), "v1"));
        QCOMPARE(second, frameEdgeMs(8000, 12, FPS));
        // The next press never moves the second point back.
        dynamic.shuttle(1, frame(14));
        dynamic.tick(frame(15));
        QVERIFY(clipEndMs(get(dynamic.clips(), "v1")) >= second);
        QCOMPARE(dynamic.commit(), std::optional<QString>("Dynamic trim"));
    }
    void nothing_moves_when_the_first_point_has_no_room() {
        auto env = environment();
        env.linked = false;
        env.sourceDuration = [](const QJsonObject& c) {
            return std::optional<double>(clipId(c) == "v0" ? 4000 : 100000);
        };
        auto doc = fixture();
        doc.clips[2].insert("startMs", 6000);
        doc.clips[3].insert("startMs", 6000);
        DynamicTrim dynamic(doc, {{"v0", true, Kind::Trim}, {"v1", true, Kind::Trim}}, env);
        dynamic.shuttle(1, 0);
        QVERIFY(!dynamic.tick(500));
        QVERIFY(dynamic.atLimit());
        QCOMPARE(dynamic.clips(), doc.clips);
        QCOMPARE(dynamic.commit(), std::nullopt);
    }
    void zero_frames_leaves_an_edge_off_the_grid_alone() {
        auto doc = fixture();
        doc.clips[0].insert("durationMs", 2042);
        doc.clips[1].insert("durationMs", 2042);
        doc.clips[2].insert("startMs", 2042);
        doc.clips[3].insert("startMs", 2042);
        const auto r = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, 0, environment());
        QCOMPARE(r.clips, doc.clips);
        QVERIFY(!r.atLimit);
    }
    void a_shifted_clip_keeps_its_only_frame() {
        // At 24 fps [125, 166) holds frame 3, and [167, 208) would hold none.
        EditDoc doc;
        doc.tracks.push_back({"V1", "video", false});
        doc.clips = {clip("a", "V1", 0, 41), clip("b", "V1", 125, 41)};
        auto env = environment();
        env.linked = false;
        const auto r = nudgeFrames(doc, {{"a", true, Kind::Ripple}}, 1, env);
        const auto& b = get(r.clips, "b");
        const double first = std::ceil(clipStartMs(b) / frame(1) - 1e-9);
        QVERIFY2(first * frame(1) < clipEndMs(b), "the shifted clip holds no frame");
    }
    void a_roll_still_moves_a_cut_under_a_transition() {
        // A transition extended v0 and a0 by 500 ms under v1 and a1.
        auto doc = fixture();
        doc.clips[0].insert("durationMs", 2500);
        doc.clips[0].insert("outPointMs", 4500);
        doc.clips[1].insert("durationMs", 2500);
        doc.clips[1].insert("outPointMs", 4500);
        const auto env = environment();
        for (const EditPoint point : {EditPoint{"v0", true, Kind::Roll}, EditPoint{"v1", false, Kind::Roll}}) {
            QVERIFY(rollPair(doc, point).has_value());
            QCOMPARE(rollPair(doc, point)->first, QString("v0"));
            QCOMPARE(rollPair(doc, point)->second, QString("v1"));
            const auto info = monitorInfo(doc, point, FPS);
            QCOMPARE(info.outgoing->clipId, QString("v0"));
            QCOMPARE(info.incoming->clipId, QString("v1"));
            for (const int frames : {-3, 3}) {
                const auto r = nudgeFrames(doc, {point}, frames, env);
                QCOMPARE(r.appliedFrames, frames);
                QVERIFY(!r.atLimit);
                const double overlap = clipEndMs(get(r.clips, "v0")) - clipStartMs(get(r.clips, "v1"));
                QVERIFY2(std::abs(overlap - 500) <= 1, "the overlap stays");
                // The linked audio cut moves with it, and the total length stays.
                QCOMPARE(clipStartMs(get(r.clips, "a1")), clipStartMs(get(r.clips, "v1")));
                QCOMPARE(clipEndMs(get(r.clips, "a0")), clipEndMs(get(r.clips, "v0")));
                QCOMPARE(clipEndMs(get(r.clips, "v1")), 4000.0);
            }
        }
        // Clips that only sit on one track with a real gap are still not a cut.
        QVERIFY(!rollPair(fixture(), {"v0", false, Kind::Roll}).has_value());
    }
    void a_trim_keeps_a_frame_on_screen() {
        // At 24 fps 41 ms from 2042 holds no frame: 49 is at 2041.67 and 50 at 2083.33.
        auto doc = fixture();
        doc.clips[2].insert("startMs", 2042);
        doc.clips[2].insert("durationMs", 1958);
        auto env = environment();
        env.linked = false;
        const auto r = nudgeFrames(doc, {{"v1", true, Kind::Trim}}, -500, env);
        QVERIFY(r.atLimit);
        const auto& kept = get(r.clips, "v1");
        const double first = std::ceil(clipStartMs(kept) / frame(1) - 1e-9);
        QVERIFY2(first * frame(1) < clipEndMs(kept), "the clip holds no frame");
    }
    void ripple_in_nudges_stay_on_the_grid_and_undo_exactly() {
        for (double fps : {24.0, 30.0, 30000.0 / 1001}) {
            auto env = environment();
            env.fps = fps;
            env.linked = false;
            auto doc = fixture();
            // The clip's end on the grid: a first step from elsewhere also snaps to it.
            doc.clips[2].insert("durationMs", frameEdgeMs(4000, 0, fps) - 2000);
            const double base = clipDurationMs(doc.clips[2]);
            const EditPoints point{{"v1", false, Kind::Ripple}};
            auto current = doc;
            // A step and its opposite put the clip back.
            current = withClips(current, nudgeFrames(current, point, 1, env).clips);
            const double one = clipDurationMs(get(current.clips, "v1"));
            QVERIFY(one < base);
            current = withClips(current, nudgeFrames(current, point, -1, env).clips);
            QCOMPARE(clipDurationMs(get(current.clips, "v1")), base);
            // Many steps add up to the same frames as one large step.
            auto stepped = doc;
            for (int i = 0; i < 24; ++i) { stepped = withClips(stepped, nudgeFrames(stepped, point, 1, env).clips); }
            const auto once = nudgeFrames(doc, point, 24, env);
            QCOMPARE(clipDurationMs(get(stepped.clips, "v1")), clipDurationMs(get(once.clips, "v1")));
            QVERIFY(std::abs(clipDurationMs(get(stepped.clips, "v1")) - (base - frame(24, fps))) <= 1);
        }
    }
    void a_nudge_puts_the_cut_exactly_on_its_frame() {
        for (double fps : {24.0, 30.0, 30000.0 / 1001}) {
            auto env = environment();
            env.fps = fps;
            for (int frames : {-7, -2, -1, 1, 2, 3, 5, 11, 29}) {
                auto doc = fixture();
                const double cut = frameEdgeMs(0, 60, fps);
                doc.clips[0].insert("durationMs", cut);
                doc.clips[1].insert("durationMs", cut);
                doc.clips[2].insert("startMs", cut);
                doc.clips[3].insert("startMs", cut);
                const auto r = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, frames, env);
                QCOMPARE(r.appliedFrames, frames);
                const auto info = monitorInfo(withClips(doc, r.clips), {"v0", true, Kind::Roll}, fps);
                // Frame index i is at i * 1000 / fps, and the compositor shows start <= t < end.
                QCOMPARE(info.outgoing->frameTimeMs, frame(59 + frames, fps));
                QCOMPARE(info.incoming->frameTimeMs, frame(60 + frames, fps));
            }
        }
    }
    void rounded_frame_edges_in_monitor() {
        for (double fps : {24.0, 30000.0 / 1001}) {
            auto doc = fixture();
            const double cut = frameStepMs(0, 49, fps);
            doc.clips[0].insert("durationMs", cut);
            doc.clips[2].insert("startMs", cut);
            const auto info = monitorInfo(doc, {"v0", true, Kind::Roll}, fps);
            QVERIFY(info.outgoing);
            QVERIFY(info.incoming);
            // 2042 ms at 24 fps and 1635 ms at NTSC both lie after frame 49.
            QCOMPARE(info.outgoing->frameTimeMs, frame(49, fps));
            QCOMPARE(info.incoming->frameTimeMs, frame(50, fps));
            doc.clips[0].insert("durationMs", frameStepMs(0, 50, fps));
            const auto last = monitorInfo(doc, {"v0", true, Kind::Trim}, fps);
            QVERIFY(last.outgoing);
            QCOMPARE(last.outgoing->frameTimeMs, frame(49, fps));
        }
    }
    void source_rate_and_missing_out_point_counters() {
        auto doc = fixture();
        doc.clips[0].remove("outPointMs");
        doc.clips[0].insert("speedMultiplier", 2);
        const EditPoint p{"v0", true, Kind::Trim};
        const auto anchor = shiftAnchor(doc, p);
        QCOMPARE(anchor.outgoingSourceOutMs, 6000.0);
        const auto r = nudgeFrames(doc, {p}, -3, environment());
        QCOMPARE(shiftFrom(withClips(doc, r.clips), anchor, FPS).outFrames, -3);
        auto gone = doc;
        gone.clips.clear();
        QCOMPARE(shiftFrom(gone, anchor, FPS), Shift{});
    }
    void select_nearest_prefers_cut_and_falls_back_to_edge() {
        auto doc = fixture();
        auto env = environment();
        env.linked = false;
        env.targeting.untargetedTrackIds.insert("A1");
        QCOMPARE(selectNearest(doc, 1, Kind::Trim, env), (EditPoints{{"v0", true, Kind::Trim}}));
        doc.clips.erase(doc.clips.begin() + 2);
        QCOMPARE(selectNearest(doc, 1, Kind::Roll, env), (EditPoints{{"v0", false, Kind::Roll}}));
    }
    void edge_identity_marks_pruning_and_refused_points() {
        auto doc = fixture();
        const EditPoint left{"v0", true, Kind::Roll};
        const EditPoint right{"v1", false, Kind::Roll};
        QVERIFY(sameEdge(doc, left, right));
        QCOMPARE(rollPair(doc, right), (std::optional(std::pair{QString("v0"), QString("v1")})));
        QCOMPARE(edgeMarks(doc, {left, right}),
                 (std::vector<EdgeMark>{{"v0", true, Kind::Roll}, {"v1", false, Kind::Roll}}));
        QCOMPARE(prune(doc, {left, {"gone", true, Kind::Trim}}), EditPoints{left});
        QCOMPARE(select(doc, {left}, {"gone", true, Kind::Trim}, false, environment()), EditPoints{left});
        QVERIFY(!editTimeMs(doc, {"gone", false, Kind::Trim}));
        doc.clips[1].insert("locked", true);
        QVERIFY(linkedPoints(doc, {"a0", true, Kind::Trim}, environment()).empty());
        doc.clips[1].insert("mediaType", "group");
        QVERIFY(linkedPoints(doc, {"a0", true, Kind::Trim}, environment()).empty());
        QCOMPARE(linkedPoints(doc, {"v0", true, Kind::Trim}, environment()).size(), size_t(1));
    }
    void dynamic_roll_forward_is_one_undo_step() {
        const auto doc = fixture();
        DynamicTrim d(doc, {{"v0", true, Kind::Roll}}, environment());
        QVERIFY(!d.tick(9000));
        QCOMPARE(d.shuttle(1, 10000), 1.0);
        QVERIFY(d.tick(10500));
        QCOMPARE(d.offsetFrames(), 12);
        QCOMPARE(d.editTime(), std::optional<double>(2500));
        QVERIFY(!d.tick(10500));
        QVERIFY(d.tick(11000));
        QCOMPARE(d.offsetFrames(), 24);
        QCOMPARE(clipEndMs(get(d.clips(), "a1")), 4000.0);
        QCOMPARE(d.baseClips(), doc.clips);
        QCOMPARE(d.commit(), std::optional(QString("Dynamic rolling edit")));
        QVERIFY(!d.commit());
        QVERIFY(!d.tick(12000));
    }
    void pressing_l_again_doubles_speed_and_j_reverses() {
        DynamicTrim d(fixture(), {{"v0", true, Kind::Roll}}, environment());
        QCOMPARE(d.shuttle(1, 0), 1.0);
        QCOMPARE(d.shuttle(1, 500), 2.0);
        QCOMPARE(d.offsetFrames(), 12);
        QVERIFY(d.tick(1000));
        QCOMPARE(d.offsetFrames(), 36);
        QCOMPARE(d.shuttle(-1, 1000), -1.0);
        QVERIFY(d.tick(1250));
        QCOMPARE(d.offsetFrames(), 30);
        QCOMPARE(d.shuttle(1, 1250, true), 0.25);
        QVERIFY(d.tick(2250));
        QCOMPARE(d.offsetFrames(), 36);
        QCOMPARE(d.shuttle(-1, 2250), -1.0);
        QCOMPARE(d.shuttle(-1, 2250), -2.0);
        QCOMPARE(d.shuttle(-1, 2250), -4.0);
        QCOMPARE(d.shuttle(-1, 2250), -8.0);
        QCOMPARE(d.shuttle(-1, 2250), -8.0);
        QVERIFY(d.tick(2437.5));
        QCOMPARE(d.offsetFrames(), 0);
        QCOMPARE(d.clips(), d.baseClips());
        QVERIFY(!d.commit());
    }
    void dynamic_ripple_backward_shortens_and_stops_at_a_limit() {
        const auto doc = fixture();
        DynamicTrim d(doc, {{"v0", true, Kind::Ripple}}, environment());
        QCOMPARE(d.shuttle(-1, 0), -1.0);
        QVERIFY(d.tick(250));
        QCOMPARE(d.offsetFrames(), -6);
        QCOMPARE(clipEndMs(get(d.clips(), "v1")), 3750.0);
        QVERIFY(d.tick(600000));
        QCOMPARE(d.offsetFrames(), -47);
        QCOMPARE(clipDurationMs(get(d.clips(), "v0")), 41.0);
        QVERIFY(d.atLimit());
        QCOMPARE(d.speed(), 0.0);
        QVERIFY(!d.tick(601000));
        QCOMPARE(d.shuttle(-1, 601000), -1.0);
        QVERIFY(!d.tick(602000));
        QVERIFY(d.atLimit());
        QCOMPARE(d.shuttle(1, 602000), 1.0);
        QVERIFY(d.tick(602250));
        QCOMPARE(d.offsetFrames(), -41);
        QCOMPARE(d.commit(), std::optional(QString("Dynamic ripple trim")));
        QVERIFY(!d.commit());
        QCOMPARE(d.baseClips(), doc.clips);
    }
    void dynamic_no_movement_and_regular_commit() {
        const auto doc = fixture();
        DynamicTrim empty(doc, {}, environment());
        QVERIFY(!empty.commit());
        DynamicTrim d(doc, {{"v0", true, Kind::Trim}}, environment());
        QCOMPARE(d.shuttle(-1, 8000), -1.0);
        QVERIFY(!d.tick(8010));
        QVERIFY(d.tick(8250));
        QCOMPARE(d.offsetFrames(), -6);
        QCOMPARE(d.commit(), std::optional(QString("Dynamic trim")));
        QVERIFY(!d.commit());
        DynamicTrim still(doc, {{"v0", true, Kind::Roll}}, environment());
        still.shuttle(1, 1000);
        QVERIFY(!still.commit());
    }
    void play_around() {
        auto span = playAround(2000, 1000, 500, 4000, FPS);
        QCOMPARE(span.startMs, 1000.0);
        QCOMPARE(span.endMs, 2500.0);
        span = playAround(250, 1000, 500, 500, FPS);
        QCOMPARE(span.startMs, 0.0);
        QCOMPARE(span.endMs, 500.0);
        span = playAround(4000, 0, 1000, 4000, FPS);
        QCOMPARE(span.startMs, 4000.0);
        QVERIFY(std::abs(span.endMs - frame(97)) < 1e-6);
        for (double fps : {24.0, 30000.0 / 1001}) {
            span = playAround(1635, 357, 921, 2300, fps);
            QVERIFY(span.startMs >= 0);
            QVERIFY(span.endMs <= 2300);
            QVERIFY(span.endMs - span.startMs + 1e-6 >= frame(1, fps));
            QVERIFY(std::abs(span.startMs * fps / 1000 - std::round(span.startMs * fps / 1000)) < 1e-9);
            QVERIFY(std::abs(span.endMs * fps / 1000 - std::round(span.endMs * fps / 1000)) < 1e-9);
        }
    }
    void refusal_preserves_order_and_unowned_fields() {
        auto doc = fixture();
        std::ranges::reverse(doc.clips);
        auto env = environment();
        env.edit = [](const EditDoc&, const EdgeRequest&) -> ClipList { throw OpError("refused"); };
        const auto refused = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, 3, env);
        QCOMPARE(refused.clips, doc.clips);
        QVERIFY(refused.atLimit);
        env.edit = {};
        const auto r = nudgeFrames(doc, {{"v0", true, Kind::Roll}}, 3, env);
        QCOMPARE(r.appliedFrames, 3);
        for (size_t i = 0; i < doc.clips.size(); ++i) {
            QCOMPARE(clipId(r.clips[i]), clipId(doc.clips[i]));
            QCOMPARE(r.clips[i].value("keep"), doc.clips[i].value("keep"));
            QCOMPARE(r.clips[i].value("name"), doc.clips[i].value("name"));
        }
    }
    void partial_locked_units_and_group_clips() {
        auto doc = fixture();
        doc.tracks.push_back({"V2", "video", false});
        doc.clips.push_back(clip("third", "V2", 0, 2000, "L0"));
        doc.tracks[1].locked = true;
        const auto env = environment();
        const auto points = linkedPoints(doc, {"v0", true, Kind::Trim}, env);
        QCOMPARE(points.size(), size_t(2));
        const auto regular = nudgeFrames(doc, points, -3, env);
        QCOMPARE(regular.appliedFrames, -3);
        QCOMPARE(clipEndMs(get(regular.clips, "third")), 1875.0);
        QCOMPARE(get(regular.clips, "a0"), doc.clips[1]);
        const auto ripple = nudgeFrames(doc, {{"v0", true, Kind::Ripple}}, -3, env);
        QCOMPARE(ripple.clips, doc.clips);
        QVERIFY(ripple.atLimit);
        doc = fixture();
        doc.clips[1].insert("mediaType", "group");
        const auto trimmed = nudgeFrames(doc, {{"v0", true, Kind::Trim}}, -3, env);
        QCOMPARE(trimmed.appliedFrames, -3);
        QCOMPARE(trimmed.clips[1], doc.clips[1]);
        QCOMPARE(nudgeFrames(doc, {{"a0", true, Kind::Trim}}, -3, env).clips, doc.clips);
    }
    void existing_short_clips_overlap_and_source_overrun_can_shrink() {
        auto doc = fixture();
        auto env = environment();
        env.linked = false;
        doc.clips[0].insert("durationMs", 2100);
        doc.clips[1].insert("durationMs", 10);
        doc.clips[1].insert("outPointMs", 2010);
        env.sourceDuration = [](const QJsonObject&) { return std::optional<double>(3000); };
        const auto r = nudgeFrames(doc, {{"v0", true, Kind::Trim}}, -1, env);
        QCOMPARE(r.appliedFrames, -1);
        QVERIFY(!r.atLimit);
        QCOMPARE(clipEndMs(get(r.clips, "v0")), 2041.0);
        QCOMPARE(get(r.clips, "a0"), doc.clips[1]);
        const auto growth = nudgeFrames(doc, {{"v0", true, Kind::Trim}}, 1, env);
        QCOMPARE(growth.appliedFrames, 0);
        QVERIFY(growth.atLimit);
    }
    void plain_adapter_request_signs_and_zero_movement() {
        const auto doc = fixture();
        auto env = environment();
        int calls = 0;
        EdgeRequest seen;
        env.edit = [&](const EditDoc& d, const EdgeRequest& r) {
            ++calls;
            seen = r;
            return plainEdgeEdit(d, r, env.targeting);
        };
        const auto ripple = nudgeFrames(doc, {{"v1", false, Kind::Ripple}}, 3, env);
        QCOMPARE(ripple.appliedMs, 125.0);
        QCOMPARE(seen.action, QString("rippleTrimClipStart"));
        QCOMPARE(seen.deltaMs, -125.0);
        QCOMPARE(calls, 1);
        const auto roll = nudgeFrames(doc, {{"v1", false, Kind::Roll}}, 3, env);
        QCOMPARE(roll.appliedMs, 125.0);
        QCOMPARE(seen.action, QString("rollClipEdge"));
        QCOMPARE(seen.edge, QString("start"));
        QCOMPARE(seen.deltaMs, 125.0);
        QCOMPARE(seen.maxSourceDurationMs, std::optional<double>(100000));
        const auto none = trimBy(doc, {{"v0", true, Kind::Trim}},
                                 [](const EditDoc&, const EditPoint&) { return 0.0; }, env);
        QCOMPARE(none.clips, doc.clips);
        QCOMPARE(calls, 2);
    }
    void off_grid_nudges_count_requested_frames() {
        auto doc = fixture();
        doc.clips[0].insert("durationMs", 62.5);
        doc.clips[0].insert("outPointMs", 2062.5);
        auto env = environment();
        env.linked = false;
        const EditPoints points{{"v0", true, Kind::Trim}};
        const auto r = nudgeFrames(doc, points, 1, env);
        QCOMPARE(r.appliedMs, 62.5);
        QCOMPARE(r.appliedFrames, 1);
        QVERIFY(!r.atLimit);
        QCOMPARE(clipEndMs(get(r.clips, "v0")), 125.0);
        DynamicTrim dynamic(doc, points, env);
        dynamic.shuttle(1, 0);
        QVERIFY(dynamic.tick(50));
        QCOMPARE(dynamic.offsetFrames(), 1);
        QVERIFY(!dynamic.atLimit());
    }
    void large_nearest_selection_is_not_quadratic() {
        EditDoc doc;
        doc.tracks.push_back({"V1", "video", false});
        doc.clips.reserve(20000);
        for (int i = 0; i < 20000; ++i) { doc.clips.push_back(clip(QString::number(i), "V1", i * 2000.0)); }
        QElapsedTimer timer;
        timer.start();
        const auto points = selectNearest(doc, 20000000, Kind::Roll, environment());
        const auto elapsed = timer.elapsed();
        qInfo() << "20000-clip nearest:" << elapsed << "ms";
        QCOMPARE(points.size(), size_t{1});
        QCOMPARE(*editTimeMs(doc, points[0]), 20000000.0);
        QVERIFY(elapsed < 500);
    }
    void large_ripple_nudge_is_not_quadratic() {
        EditDoc doc;
        doc.tracks.push_back({"V1", "video", false});
        doc.clips.reserve(5000);
        for (int i = 0; i < 5000; ++i) { doc.clips.push_back(clip(QString::number(i), "V1", i * 2000.0)); }
        QElapsedTimer timer;
        timer.start();
        const auto r = nudgeFrames(doc, {{"0", true, Kind::Ripple}}, -3, environment());
        const auto elapsed = timer.elapsed();
        QCOMPARE(r.appliedFrames, -3);
        QCOMPARE(clipStartMs(r.clips.back()), 9997875.0);
        QVERIFY2(elapsed < 1000, qPrintable(QString("ripple took %1 ms").arg(elapsed)));
        qInfo() << "5000-clip ripple:" << elapsed << "ms";
    }
};

QTEST_GUILESS_MAIN(TestTrimModel)
#include "tst_trimmodel.moc"
