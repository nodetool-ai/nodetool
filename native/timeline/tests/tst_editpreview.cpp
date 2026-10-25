// M4 exit 3: an edit shows in the preview on the next frame. The
// PreviewCompositor renders through QQuickRenderControl on the platform QRhi
// (Metal on macOS), the --screenshot path: no window is ever created. The
// offscreen QPA platform offers no Metal QRhi, so this suite runs on the
// default platform and sets the no-foreground variables main() sets.
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"

#include <QElapsedTimer>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QTest>
#include <QUndoStack>
#include <rhi/qrhi.h>

#include <algorithm>
#include <cmath>
#include <memory>

namespace {

nt::Timeline oneTrack() {
    QJsonArray clips;
    for (int k = 0; k < 3; ++k) {
        clips.append(QJsonObject{{"id", QStringLiteral("c%1").arg(k)},
                                 {"trackId", "v1"},
                                 {"name", "clip"},
                                 {"startMs", k * 1000},
                                 {"durationMs", 800},
                                 {"mediaType", "video"},
                                 {"sourceType", "imported"},
                                 {"status", "generated"},
                                 {"versions", QJsonArray()}});
    }
    const QJsonObject doc{{"id", "p"},
                          {"name", "p"},
                          {"fps", 30},
                          {"width", 1920},
                          {"height", 1080},
                          {"durationMs", 3000},
                          {"tracks", QJsonArray{QJsonObject{{"id", "v1"}, {"name", "V1"}, {"type", "video"}, {"index", 0},
                                                            {"visible", true}, {"locked", false}, {"muted", false}}}},
                          {"clips", clips}};
    nt::ParseResult parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
    if (!parsed.timeline) qFatal("fixture does not parse");
    return *parsed.timeline;
}

}  // namespace

class TestEditPreview : public QObject {
    Q_OBJECT

private slots:
    // M4 exit 3: the preview composites an edit on the very next frame. The
    // compositor renders through QQuickRenderControl on a Metal QRhi: no
    // window is created.
    void previewShowsAnEditOnTheNextFrame() {
        TimelineModel doc;
        PlaybackClock playback;
        doc.setTimeline(oneTrack());  // c0 covers 0-800
        playback.setDurationMs(doc.contentEndMs());
        playback.seek(400);
        {
            QQuickRenderControl control;
            QQuickWindow window(&control);
            const QSize size(320, 180);
            window.resize(size);
            auto* compositor = new PreviewCompositor();
            compositor->setTimeline(&doc);
            compositor->setClock(&playback);
            compositor->setParentItem(window.contentItem());
            compositor->setSize(QSizeF(size));
            QVERIFY2(control.initialize(), "no Metal QRhi for the render control");
            QRhi* rhi = control.rhi();
            std::unique_ptr<QRhiTexture> target(rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
            QVERIFY(target->create());
            std::unique_ptr<QRhiRenderBuffer> ds(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
            QVERIFY(ds->create());
            QRhiTextureRenderTargetDescription desc{QRhiColorAttachment(target.get())};
            desc.setDepthStencilBuffer(ds.get());
            std::unique_ptr<QRhiTextureRenderTarget> rt(rhi->newTextureRenderTarget(desc));
            std::unique_ptr<QRhiRenderPassDescriptor> rp(rt->newCompatibleRenderPassDescriptor());
            rt->setRenderPassDescriptor(rp.get());
            QVERIFY(rt->create());
            window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(rt.get()));
            compositor->setCollectFrameStats(true);
            const auto renderFrame = [&]() {
                compositor->update();
                QCoreApplication::processEvents();
                control.polishItems();
                control.beginFrame();
                control.sync();
                control.render();
                control.endFrame();
            };
            for (int i = 0; i < 4; ++i) renderFrame();
            // A frame's stats arrive at the next frame's synchronize.
            const size_t n = compositor->frameStats().size();
            QVERIFY(n > 0);
            QCOMPARE(compositor->frameStats().back().layers, 1);

            // Delete the clip under the playhead: the frame after the edit
            // has no layer.
            QJsonArray clips = doc.clipsJson();
            clips.removeAt(0);
            QVERIFY(doc.commitEdit("Delete", doc.clipsJson(), clips));
            renderFrame();  // the first frame after the edit
            renderFrame();  // delivers its stats
            QCOMPARE(compositor->frameStats().size(), n + 2);
            QCOMPARE(compositor->frameStats()[n].layers, 1);      // the last frame before
            QCOMPARE(compositor->frameStats()[n + 1].layers, 0);  // the next frame
            // Undo shows on the next frame too.
            doc.undoStack()->undo();
            renderFrame();
            renderFrame();
            QCOMPARE(compositor->frameStats()[n + 3].layers, 1);
            delete compositor;
        }
    }

    // The cost of one live gesture update on the M2 bench document (200
    // tracks, 2000 clips): the clips array replaced and the model re-derived.
    void liveEditCostOnALargeDocument() {
        nt::ParseResult loaded = nt::loadTimelineFile(QStringLiteral(NT_FIXTURES_DIR "/generated/ui-200tracks.json"));
        if (!loaded.timeline) QSKIP("run scripts/make-ui-fixture.mjs first");
        TimelineModel doc;
        doc.setTimeline(*loaded.timeline);
        QJsonArray clips = doc.clipsJson();
        std::vector<double> ms;
        for (int i = 0; i < 60; ++i) {
            QJsonObject c = clips.at(10).toObject();
            c.insert("startMs", c.value("startMs").toDouble() + 10);
            clips.replace(10, c);
            QElapsedTimer t;
            t.start();
            QVERIFY(doc.replaceClips(clips));
            ms.push_back(t.nsecsElapsed() / 1e6);
        }
        std::sort(ms.begin(), ms.end());
        qInfo("replaceClips on %d clips: p50 %.2f ms, p95 %.2f ms, max %.2f ms", int(clips.size()), ms[30], ms[57],
              ms.back());
        QVERIFY2(ms[57] < 16.0, "a live update must fit in a 60 Hz frame");
    }

    // The incremental re-derive (replaceClips) gives the typed clips a whole
    // parse of the edited document gives.
    void incrementalUpdateEqualsAFullParse() {
        const QString path = QStringLiteral(NT_FIXTURES_DIR "/overlaps.json");
        nt::ParseResult loaded = nt::loadTimelineFile(path);
        QVERIFY(loaded.timeline);
        TimelineModel doc;
        doc.setTimeline(*loaded.timeline);
        QJsonArray clips = doc.clipsJson();
        // Move one, retime another, drop a third, add a copy with a new id.
        QJsonObject a = clips.at(0).toObject();
        a.insert("startMs", a.value("startMs").toDouble() + 250);
        clips.replace(0, a);
        QJsonObject b = clips.at(1).toObject();
        b.insert("durationMs", b.value("durationMs").toDouble() / 2);
        b.insert("fadeInMs", 120);
        clips.replace(1, b);
        QJsonObject copy = clips.at(2).toObject();
        copy.insert("id", "copy-of-2");
        clips.removeAt(3);
        clips.append(copy);
        QVERIFY(doc.replaceClips(clips));

        nt::ParseResult full = nt::parseTimelineJson(doc.documentJson(), QFileInfo(path).absolutePath());
        QVERIFY(full.timeline);
        const auto& got = doc.timeline().clips;
        const auto& want = full.timeline->clips;
        QCOMPARE(got.size(), want.size());
        for (size_t i = 0; i < got.size(); ++i) {
            QCOMPARE(got[i].id, want[i].id);
            QCOMPARE(got[i].trackId, want[i].trackId);
            QCOMPARE(got[i].startMs, want[i].startMs);
            QCOMPARE(got[i].durationMs, want[i].durationMs);
            QCOMPARE(got[i].inPointMs, want[i].inPointMs);
            QCOMPARE(got[i].opacity, want[i].opacity);
            QCOMPARE(got[i].fadeInMs, want[i].fadeInMs);
            QCOMPARE(got[i].fadeOutMs, want[i].fadeOutMs);
            QCOMPARE(got[i].hidden, want[i].hidden);
            QCOMPARE(got[i].transitionIn.has_value(), want[i].transitionIn.has_value());
            QCOMPARE(got[i].mediaPath, want[i].mediaPath);
            QCOMPARE(got[i].raw, want[i].raw);
        }
        QCOMPARE(doc.timeline().raw, full.timeline->raw);
    }

    // F2: a clip deleted and brought back by undo keeps the media its load
    // resolved, both a relative path the loader resolved against the fixture
    // folder and a path a server open set outside the raw JSON.
    void undoKeepsResolvedMedia() {
        const QString path = QStringLiteral(NT_FIXTURES_DIR "/media-tracks.json");
        nt::ParseResult loaded = nt::loadTimelineFile(path);
        QVERIFY(loaded.timeline);
        // As a server open does: picture and audio paths that are not in the JSON.
        loaded.timeline->clips[1].audioPath = "/cache/assets/pip-a-original.mp4";
        TimelineModel doc;
        doc.setTimeline(*loaded.timeline);
        const std::vector<nt::Clip> before = doc.timeline().clips;
        const QJsonArray all = doc.clipsJson();
        for (int victim = 0; victim < all.size(); ++victim) {
            QJsonArray without = all;
            without.removeAt(victim);
            QVERIFY(doc.commitEdit("Delete", all, without));
            doc.undoStack()->undo();
            QCOMPARE(doc.timeline().clips.size(), before.size());
            for (size_t i = 0; i < before.size(); ++i) {
                QCOMPARE(doc.timeline().clips[i].mediaPath, before[i].mediaPath);
                QCOMPARE(doc.timeline().clips[i].audioPath, before[i].audioPath);
            }
        }
        // Against a full load with the original resolver (the fixture folder).
        nt::ParseResult full = nt::parseTimelineJson(doc.documentJson(), QFileInfo(path).absolutePath());
        QVERIFY(full.timeline);
        for (size_t i = 0; i < before.size(); ++i) {
            QCOMPARE(doc.timeline().clips[i].mediaPath, full.timeline->clips[i].mediaPath);
        }
        // A split's halves keep the media of the clip they came from.
        QJsonArray split = all;
        QJsonObject left = all.at(1).toObject();
        QJsonObject right = left;
        left.insert("id", "left-half");
        left.insert("durationMs", left.value("durationMs").toDouble() / 2);
        right.insert("id", "right-half");
        split.replace(1, left);
        split.insert(2, right);
        QVERIFY(doc.replaceClips(split));
        QCOMPARE(doc.timeline().clips[1].mediaPath, before[1].mediaPath);
        QCOMPARE(doc.timeline().clips[2].audioPath, before[1].audioPath);
    }

    // D4 and undo on a document as a person or another tool wrote it: keys in
    // their own order, and numbers spelled 1.0, -0, with more digits than a
    // double holds, and past 2^53. Undo gives back the bytes the model had
    // before the edit; against the original text, the values survive and the
    // spelling and key order do not (the model holds parsed JSON, as the
    // server does).
    void undoKeepsBytesAndValuesOfAWrittenDocument() {
        const QByteArray original = R"({"name":"hand written","id":"seq","fps":30,"width":1920,"height":1080,"durationMs":3000.0,
"tracks":[{"type":"video","id":"v1","name":"V1","index":0,"visible":true,"locked":false,"muted":false}],
"clips":[{"trackId":"v1","id":"c0","startMs":1.0,"durationMs":800,"mediaType":"video","opacity":0.30000000000000004,
"zeta":-0,"precise":1.00000000000000001234,"huge":12345678901234567890,"name":"a","sourceType":"imported",
"status":"generated","versions":[]},
{"id":"c1","trackId":"v1","name":"b","startMs":1000,"durationMs":800,"mediaType":"video","sourceType":"imported",
"status":"generated","versions":[],"nested":{"b":2,"a":[1.5,-0.0,1e-7]}}],"zzz":{"y":1,"x":2.50}})";
        nt::ParseResult parsed = nt::parseTimelineJson(original);
        QVERIFY(parsed.timeline);
        TimelineModel doc;
        doc.setTimeline(*parsed.timeline);
        const QByteArray loaded = doc.documentJson();
        QJsonArray clips = doc.clipsJson();
        QJsonObject moved = clips.at(1).toObject();
        moved.insert("startMs", 1500);
        clips.replace(1, moved);
        QVERIFY(doc.commitEdit("Move", doc.clipsJson(), clips));
        QVERIFY(doc.documentJson() != loaded);
        doc.undoStack()->undo();
        QCOMPARE(doc.documentJson(), loaded);  // byte for byte against the model's own form
        doc.undoStack()->redo();
        doc.undoStack()->undo();
        QCOMPARE(doc.documentJson(), loaded);

        // Against the original text: the same JSON values.
        const QJsonObject before = QJsonDocument::fromJson(original).object();
        const QJsonObject after = QJsonDocument::fromJson(loaded).object();
        QCOMPARE(after, before);
        // What the bytes keep and lose, for the report.
        const QJsonObject c0 = after.value("clips").toArray().at(0).toObject();
        QCOMPARE(c0.value("startMs").toDouble(), 1.0);
        // -0 reads as the integer 0 in Qt: the sign is lost, as the server's
        // JSON.stringify drops it on save. Recorded, not hidden.
        QCOMPARE(c0.value("zeta").toDouble(), 0.0);
        QVERIFY(!std::signbit(c0.value("zeta").toDouble()));
        QCOMPARE(c0.value("opacity").toDouble(), 0.30000000000000004);
        qInfo("original key order kept: %s", loaded.startsWith(R"({"name")") ? "yes" : "no (keys sorted)");
        qInfo("model form of the odd numbers: %s", QJsonDocument(QJsonObject{
                                                       {"startMs", c0.value("startMs")},
                                                       {"zeta", c0.value("zeta")},
                                                       {"precise", c0.value("precise")},
                                                       {"huge", c0.value("huge")},
                                                       {"opacity", c0.value("opacity")}})
                                                       .toJson(QJsonDocument::Compact)
                                                       .constData());
    }
};

int main(int argc, char** argv) {
    // Never a window, never the foreground (as main.cpp does for --screenshot).
    qputenv("QT_MAC_DISABLE_FOREGROUND_APPLICATION_TRANSFORM", "1");
    qputenv("QT_MAC_SET_RAISE_PROCESS", "0");
    QGuiApplication app(argc, argv);
    TestEditPreview test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_editpreview.moc"
