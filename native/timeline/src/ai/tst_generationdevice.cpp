#include "ai/GenerationController.h"
#include "model/TimelineJson.h"
#include "assets/AssetWav.h"
#include "audio/AppAudio.h"
#include "audio/LoopbackCapture.h"
#include "preview/PreviewCompositor.h"
#include "../../tests/TestHttpServer.h"
#include <QElapsedTimer>
#include <QFile>
#include <QJsonDocument>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QtTest>
#include <algorithm>
#include <cmath>
#include <memory>
#include <vector>

class TestGenerationDevice : public QObject {
    Q_OBJECT
private slots:
    void candidatePreviewDevice() {
        if (qEnvironmentVariable("NT_CANDIDATE_PREVIEW_DEVICE") != "1") QSKIP("Opt-in device check");
        std::string error;
        const auto devices = nt::audio::listAudioDevices(&error);
        QVERIFY2(!devices.loopback.empty(), "Configure a loopback capture device and route system output to it.");
        nt::audio::LoopbackCapture capture;
        QVERIFY2(capture.start(devices.loopback, 5.0, &error), error.c_str());
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        const auto path = cache.filePath("tone.wav");
        std::vector<float> pcm(48000 * 2 * 2);
        for (int frame = 0; frame < 48000 * 2; ++frame) {
            const float sample = 0.25f * std::sin(2.0 * 3.141592653589793 * 440.0 * frame / 48000.0);
            pcm[2 * frame] = sample;
            pcm[2 * frame + 1] = sample;
        }
        QVERIFY(nt::assets::writeStereoWav(path, pcm));
        QFile fixture(path);
        QVERIFY(fixture.open(QIODevice::ReadOnly));
        const auto bytes = fixture.readAll();
        TestHttpServer server;
        server.setFile("/candidate.wav", ServedFile(bytes));
        const QString assetId(32, QLatin1Char('a'));
        server.setJson([assetId, bytes](const QByteArray&, const QUrl&) {
            const QJsonObject asset{{"id", assetId}, {"name", "tone.wav"}, {"content_type", "audio/wav"},
                                    {"duration", 2}, {"size", bytes.size()}, {"get_url", "/candidate.wav"}};
            return QJsonDocument(QJsonObject{{"result", QJsonObject{{"data", asset}}}}).toJson(QJsonDocument::Compact);
        });
        const auto parsed = nt::parseTimelineJson(R"({"id":"timeline","fps":30,"width":640,"height":360,
            "tracks":[{"id":"a","type":"audio","index":0}],"clips":[{"id":"clip","trackId":"a",
            "startMs":0,"durationMs":2000,"mediaType":"audio","sourceType":"generated","status":"draft","versions":[]}]})");
        QVERIFY(parsed.timeline);
        TimelineModel model;
        model.setTimeline(*parsed.timeline);
        GenerationController controller;
        controller.setTimeline(&model);
        controller.m_target = nt::server::SaveTarget{server.base(), {}, "timeline", cache.path() + "/server/user/timelines"};
        controller.m_candidates = QJsonArray{QJsonObject{{"id", "take"}, {"clipId", "clip"}, {"assetId", assetId},
            {"status", "success"}, {"durationMs", 2000}}};
        controller.previewUrl("clip", "take");
        QTRY_VERIFY_WITH_TIMEOUT(!controller.m_resolving && !controller.m_worker, 10000);
        QVERIFY(!controller.previewUrl("clip", "take").isEmpty());
        QQuickWindow window;
        window.resize(640, 360);
        auto preview = std::make_unique<PreviewCompositor>();
        preview->setParentItem(window.contentItem());
        preview->setWidth(640);
        preview->setHeight(360);
        preview->setTimeline(controller.previewTimeline());
        preview->setClock(controller.previewClock());
        window.show();
        QVERIFY2(QTest::qWaitForWindowExposed(&window), "Preview window was not exposed.");
        controller.setPreviewAudioMode("system");
        controller.playPreview();
        QVERIFY2(controller.m_previewAudio && controller.m_previewAudio->engine(), qPrintable(controller.error()));
        QElapsedTimer elapsed;
        elapsed.start();
        while (elapsed.elapsed() < 2500 && controller.previewClock()->time() < 1900) {
            controller.previewClock()->tick();
            QTest::qWait(16);
        }
        const auto stats = controller.m_previewAudio->engine()->stats();
        controller.stopPreview();
        capture.stop();
        QVERIFY(stats.callbacks > 0);
        QVERIFY(stats.sourcesOpened > 0);
        QVERIFY(stats.playedFrames > 0);
        QVERIFY2(stats.openFailures == 0 && stats.decodeErrors == 0, "Candidate audio failed to decode.");
        const auto samples = capture.samples();
        QVERIFY(samples.size() >= 4096);
        double strongest = 0;
        for (std::size_t start = 0; start + 4096 <= samples.size(); start += 2048) {
            double real = 0, imaginary = 0;
            for (std::size_t i = 0; i < 4096; ++i) {
                const double phase = 2.0 * 3.141592653589793 * 440.0 * i / capture.sampleRate();
                real += samples[start + i] * std::cos(phase);
                imaginary += samples[start + i] * std::sin(phase);
            }
            strongest = std::max(strongest, std::hypot(real, imaginary) * 2 / 4096);
        }
        QVERIFY2(strongest > 0.01, "Loopback did not capture the candidate's 440 Hz tone.");
        preview->setParentItem(nullptr);
    }
};
QTEST_MAIN(TestGenerationDevice)
#include "tst_generationdevice.moc"
