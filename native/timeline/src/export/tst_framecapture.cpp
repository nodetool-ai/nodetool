#include "export/FrameCapture.h"
#include "export/FrameImage.h"
#include "model/TimelineJson.h"
#include "preview/FfmpegSource.h"
#include "preview/hw/HwWindow.h"
#include <QElapsedTimer>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QProcess>
#include <QProcessEnvironment>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QSignalSpy>
#include <QQuickRenderControl>
#include <QQuickRenderTarget>
#include <QQuickWindow>
#include <QScopeGuard>
#include <rhi/qrhi.h>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include <QtTest>
#include <cmath>
#include <limits>
#include <map>

namespace {
QString media(const QString& name) { return QStringLiteral(NT_EXPORT_FIXTURES) + "/media/" + name; }
QJsonObject document(const QString& path, int width = 640, int height = 360, double fps = 30,
                     double inPoint = 0, const QString& type = "video") {
    return {{"width", width}, {"height", height}, {"fps", fps}, {"durationMs", 3000},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"visible", true}}}},
        {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", type},
            {"sourceType", "imported"}, {"status", "generated"}, {"startMs", 0}, {"durationMs", 3000},
            {"inPointMs", inPoint}, {"width", width}, {"height", height}, {"mediaPath", path}}}}};
}
QJsonObject fixture() {
    auto raw = document(media("seek-360p30.mp4"));
    raw.insert("fps", 30000.0 / 1001);
    auto clips = raw.value("clips").toArray();
    auto clip = clips[0].toObject();
    clip.insert("currentAssetId", QString(32, u'a'));
    clip.insert("originalMediaPath", clip.value("mediaPath"));
    clip.insert("effects", QJsonArray{QJsonObject{{"id", "grade"}, {"type", "color"},
        {"enabled", true}, {"brightness", 0.12}}});
    clip.insert("caption", QJsonObject{{"words", QJsonArray{QJsonObject{{"word", "Frame capture"},
        {"startMs", 0}, {"endMs", 3000}}}}});
    clips[0] = clip;
    raw.insert("clips", clips);
    return raw;
}
double psnr(const QImage& a, const QImage& b) {
    if (a.isNull() || a.size() != b.size()) return 0;
    const auto x = a.convertToFormat(QImage::Format_RGB888);
    const auto y = b.convertToFormat(QImage::Format_RGB888);
    double sum = 0;
    for (int row = 0; row < x.height(); ++row) {
        for (int col = 0; col < x.width() * 3; ++col) {
            const double delta = double(x.constScanLine(row)[col]) - y.constScanLine(row)[col];
            sum += delta * delta;
        }
    }
    return sum == 0 ? std::numeric_limits<double>::infinity()
                    : 10 * std::log10(255.0 * 255 * x.width() * x.height() * 3 / sum);
}
bool load(TimelineModel& model, const QJsonObject& raw) {
    auto parsed = nt::parseTimeline(raw);
    if (!parsed.timeline) return false;
    model.setTimeline(std::move(*parsed.timeline));
    return true;
}
QImage render(QQuickItem& root) {
    QQuickRenderControl control;
    QQuickWindow window(&control);
    nt::hw::prepareWindow(&window);
    const QSize size(200, 120);
    window.resize(size);
    window.setColor(Qt::transparent);
    if (!control.initialize()) return {};
    auto* rhi = control.rhi();
    std::unique_ptr<QRhiTexture> texture(rhi->newTexture(QRhiTexture::RGBA8, size, 1,
        QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    std::unique_ptr<QRhiRenderBuffer> depth(rhi->newRenderBuffer(QRhiRenderBuffer::DepthStencil, size));
    if (!texture->create() || !depth->create()) return {};
    QRhiTextureRenderTargetDescription description{QRhiColorAttachment(texture.get())};
    description.setDepthStencilBuffer(depth.get());
    std::unique_ptr<QRhiTextureRenderTarget> target(rhi->newTextureRenderTarget(description));
    std::unique_ptr<QRhiRenderPassDescriptor> pass(target->newCompatibleRenderPassDescriptor());
    target->setRenderPassDescriptor(pass.get());
    if (!target->create()) return {};
    window.setRenderTarget(QQuickRenderTarget::fromRhiRenderTarget(target.get()));
    root.setParentItem(window.contentItem());
    const auto detach = qScopeGuard([&] {
        root.setParentItem(nullptr);
        window.setRenderTarget({});
    });
    QImage image;
    QRhiReadbackResult readback;
    readback.completed = [&] {
        image = QImage(reinterpret_cast<const uchar*>(readback.data.constData()), size.width(), size.height(),
            QImage::Format_RGBA8888_Premultiplied).copy();
        if (rhi->isYUpInFramebuffer()) image = image.flipped(Qt::Vertical);
    };
    control.polishItems();
    control.beginFrame();
    control.sync();
    control.render();
    auto* updates = rhi->nextResourceUpdateBatch();
    updates->readBackTexture({texture.get()}, &readback);
    control.commandBuffer()->resourceUpdate(updates);
    control.endFrame();
    rhi->finish();
    return image;
}

}

class FrameCaptureTest : public QObject {
    Q_OBJECT
    QTemporaryDir m_dir;
    int m_serial = 0;
    QString stills(const QJsonObject& raw, const QString& frames) {
        const QString base = m_dir.filePath(QString::number(++m_serial));
        QFile file(base + ".json");
        if (!file.open(QIODevice::WriteOnly)) return {};
        file.write(QJsonDocument(raw).toJson());
        file.close();
        QProcess process;
        auto env = QProcessEnvironment::systemEnvironment();
        env.remove("QT_QUICK_BACKEND");
        process.setProcessEnvironment(env);
        process.start(QStringLiteral(NT_EXPORT_BINARY), {file.fileName(), "--stills", base,
            "--still-frames", frames, "--decode", "sw"});
        if (!process.waitForFinished(60000) || process.exitStatus() != QProcess::NormalExit || process.exitCode() != 0) {
            qWarning().noquote() << process.readAllStandardError();
            return {};
        }
        return base;
    }
    QImage still(const QString& directory, int frame) {
        return QImage(directory + QStringLiteral("/frame_%1.png").arg(frame, 6, 10, QLatin1Char('0')));
    }
    void configure(FrameCapture& capture, TimelineModel* model = nullptr) {
        capture.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        capture.setTimeline(model);
    }
private slots:
    void sequencePixelsAndResponsiveness() {
        QVERIFY(m_dir.isValid());
        TimelineModel model;
        const auto raw = fixture();
        QVERIFY(load(model, raw));
        const auto reference = stills(raw, "3,30,60");
        QVERIFY(!reference.isEmpty());
        FrameCapture capture;
        configure(capture, &model);
        const auto before = model.documentJson();
        const int undo = model.undoStack()->index();
        QElapsedTimer total, call;
        total.start();
        qint64 last = 0, largest = 0;
        QTimer heartbeat;
        connect(&heartbeat, &QTimer::timeout, this, [&] {
            const auto now = total.elapsed();
            largest = std::max(largest, now - last);
            last = now;
        });
        heartbeat.start(5);
        FrameCaptureResult result;
        bool done = false;
        qint64 completedAt = 0;
        call.start();
        capture.captureSequence(3 * 1000.0 / model.fps(), [&](const auto& r) {
            result = r; completedAt = total.elapsed(); done = true;
        });
        const auto callMs = call.nsecsElapsed() / 1000000.0;
        QVERIFY2(callMs < 10, qPrintable(QString::number(callMs)));
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        const auto cold = completedAt;
        largest = std::max(largest, cold - last);
        heartbeat.stop();
        QVERIFY2(result.ok(), qPrintable(result.error));
        qInfo() << "cold ms" << cold << "call ms" << callMs << "largest GUI timer gap ms" << largest;
        QVERIFY(cold >= 50);
        QVERIFY(largest < 250);
        QVERIFY(largest * 2 < cold);
        for (int frame : {3, 30, 60}) {
            if (frame != 3) {
                done = false;
                total.restart();
                capture.captureSequence(frame * 1000.0 / model.fps(), [&](const auto& r) {
                    result = r; completedAt = total.elapsed(); done = true;
                });
                QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
                qInfo() << "warm ms" << completedAt;
            }
            QVERIFY2(result.ok(), qPrintable(result.error));
            QCOMPARE(result.image.format(), QImage::Format_RGBA8888);
            const auto score = psnr(result.image, still(reference, frame));
            qInfo() << "sequence frame" << frame << "PSNR dB" << score;
            QVERIFY(score >= 60);
        }
        const auto wrong = psnr(result.image, still(reference, 3));
        qInfo() << "wrong-time PSNR dB" << wrong;
        QVERIFY(wrong < 40);
        // The fixture's effect and caption reach the picture, so the match above covers them.
        auto plain = raw;
        auto plainClips = plain.value("clips").toArray();
        auto plainClip = plainClips[0].toObject();
        plainClip.remove("effects");
        plainClips[0] = plainClip;
        plain.insert("clips", plainClips);
        const auto noEffect = psnr(result.image, still(stills(plain, "60"), 60));
        qInfo() << "without the effect PSNR dB" << noEffect;
        QVERIFY(noEffect < 40);
        plainClip = raw.value("clips").toArray()[0].toObject();
        plainClip.remove("caption");
        plainClips[0] = plainClip;
        plain.insert("clips", plainClips);
        const auto noCaption = psnr(result.image, still(stills(plain, "60"), 60));
        qInfo() << "without the caption PSNR dB" << noCaption;
        QVERIFY(noCaption < 60);
        QCOMPARE(model.documentJson(), before);
        QCOMPARE(model.undoStack()->index(), undo);
        QCOMPARE(capture.pending(), 0);
    }
    void sourcePixelsAndErrors() {
        FrameCapture capture;
        configure(capture);
        const QString path = media("seek-360p30.mp4");
        const auto facts = nt::probeMedia(path.toStdString());
        QVERIFY(facts.usable());
        const auto reference = stills(document(path, facts.width, facts.height, facts.frameRate), "24");
        QVERIFY(!reference.isEmpty());
        FrameCaptureResult result;
        bool done = false;
        capture.captureSource(path, 24 * 1000.0 / facts.frameRate, [&](const auto& r) { result = r; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        QVERIFY2(result.ok(), qPrintable(result.error));
        const auto score = psnr(result.image, still(reference, 24));
        qInfo() << "source video PSNR dB" << score;
        QVERIFY(score >= 60);
        QImage image(80, 60, QImage::Format_RGBA8888);
        image.fill(QColor(17, 90, 210));
        const auto imagePath = m_dir.filePath("source.png");
        QVERIFY(image.save(imagePath));
        const auto imageReference = stills(document(imagePath, 80, 60, 30, 0, "image"), "0");
        QVERIFY(!imageReference.isEmpty());
        done = false;
        capture.captureSource(imagePath, 999999, [&](const auto& r) { result = r; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        QVERIFY2(result.ok(), qPrintable(result.error));
        const auto imageScore = psnr(result.image, still(imageReference, 0));
        qInfo() << "source image PSNR dB" << imageScore;
        QVERIFY(imageScore >= 60);
        QSignalSpy failures(&capture, &FrameCapture::frameFailed);
        capture.captureSource(m_dir.filePath("missing.mp4"), 0);
        capture.captureSource(media("tone-440-48k-mono.wav"), 0);
        QTRY_COMPARE_WITH_TIMEOUT(failures.size(), 2, 65000);
        QCOMPARE(capture.pending(), 0);
        const auto pid = capture.processId();
        done = false;
        capture.captureSource(path, 1000, [&](const auto& r) { result = r; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(capture.processId(), pid);
        // The same loaded source at another time shows that other frame.
        const int later = qRound(1000 * facts.frameRate / 1000);
        const auto laterReference = stills(document(path, facts.width, facts.height, facts.frameRate), QString::number(later));
        QVERIFY(!laterReference.isEmpty());
        const auto laterScore = psnr(result.image, still(laterReference, later));
        qInfo() << "second source time PSNR dB" << laterScore;
        QVERIFY(laterScore >= 60);
        QVERIFY(psnr(result.image, still(reference, 24)) < 40);
        // A time past the end gives the last frame at once rather than waiting out a timeout.
        const double duration = facts.durationSec * 1000;
        QVERIFY(duration > 0);
        const double lastFrameMs = duration - 1000 / facts.frameRate;
        const auto lastReference = stills(document(path, facts.width, facts.height, facts.frameRate, lastFrameMs), "0");
        QVERIFY(!lastReference.isEmpty());
        done = false;
        QElapsedTimer pastEnd;
        pastEnd.start();
        capture.captureSource(path, duration + 60000, [&](const auto& r) { result = r; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QVERIFY2(pastEnd.elapsed() < 10000, qPrintable(QString::number(pastEnd.elapsed())));
        const auto lastScore = psnr(result.image, still(lastReference, 0));
        qInfo() << "past the end PSNR dB" << lastScore;
        QVERIFY(lastScore >= 60);
    }
    void snapshotAfterEdit() {
        TimelineModel model;
        QVERIFY(load(model, fixture()));
        FrameCapture capture;
        configure(capture, &model);
        FrameCaptureResult first, second;
        bool a = false, b = false;
        capture.captureSequence(1000, [&](const auto& r) { first = r; a = true; });
        QVERIFY(model.moveClip("c", 1500));
        const auto edited = model.documentJson();
        const auto undo = model.undoStack()->index();
        capture.captureSequence(1000, [&](const auto& r) { second = r; b = true; });
        QTRY_VERIFY_WITH_TIMEOUT(a && b, 65000);
        QVERIFY2(first.ok(), qPrintable(first.error));
        QVERIFY2(second.ok(), qPrintable(second.error));
        QVERIFY(psnr(first.image, second.image) < 40);
        QCOMPARE(model.documentJson(), edited);
        QCOMPARE(model.undoStack()->index(), undo);
    }
    void originalPixelsAndUnavailableOriginal() {
        auto raw = fixture();
        const auto reference = stills(raw, "30");
        QVERIFY(!reference.isEmpty());
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("originalMediaPath", clip.value("mediaPath"));
        clip.insert("mediaPath", media("colorbars-bt709-full.mp4"));
        clip.insert("currentAssetId", QString(32, u'a'));
        clips[0] = clip;
        raw.insert("clips", clips);
        TimelineModel model;
        QVERIFY(load(model, raw));
        FrameCapture capture;
        configure(capture, &model);
        FrameCaptureResult result;
        bool done = false;
        capture.captureSequence(1001, [&](const auto& r) { result = r; done = true; });
        QTRY_VERIFY_WITH_TIMEOUT(done, 65000);
        QVERIFY2(result.ok(), qPrintable(result.error));
        QCOMPARE(result.image.size(), QSize(640, 360));
        const auto score = psnr(result.image, still(reference, 30));
        qInfo() << "original instead of proxy PSNR dB" << score;
        QVERIFY(score >= 60);
        clip.remove("originalMediaPath");
        clips[0] = clip;
        raw.insert("clips", clips);
        QVERIFY(load(model, raw));
        QSignalSpy failures(&capture, &FrameCapture::frameFailed);
        capture.captureSequence(0);
        QCOMPARE(failures.size(), 0);
        QTRY_COMPARE_WITH_TIMEOUT(failures.size(), 1, 10000);
        QCOMPARE(failures[0][1].toString(), QString("The original media for c is unavailable. Reconnect and reload the timeline before exporting."));
        clip.insert("originalMediaPath", m_dir.filePath("missing-original.mp4"));
        clips[0] = clip;
        raw.insert("clips", clips);
        QVERIFY(load(model, raw));
        capture.captureSequence(0);
        QTRY_COMPARE_WITH_TIMEOUT(failures.size(), 2, 10000);
        QCOMPARE(failures[1][1].toString(), QString("The original media for c is missing from the cache. Reconnect and reload the timeline before exporting."));
    }
    void lifecycle() {
        TimelineModel model;
        QVERIFY(load(model, fixture()));
        FrameCapture capture;
        configure(capture, &model);
        std::map<int, int> results;
        const auto record = [&](const auto& r) {
            QCOMPARE(QThread::currentThread(), qApp->thread());
            ++results[r.requestId];
        };
        QSignalSpy ready(&capture, &FrameCapture::frameReady);
        QSignalSpy cancelled(&capture, &FrameCapture::frameCancelled);
        QSignalSpy failed(&capture, &FrameCapture::frameFailed);
        const int before = capture.captureSequence(0, record);
        capture.cancel(before);
        const int during = capture.captureSequence(1000, record);
        QTRY_VERIFY_WITH_TIMEOUT(capture.processId() > 0, 10000);
        QTest::qWait(20);
        capture.cancel(during);
        QTRY_COMPARE(cancelled.size(), 2);
        const int next = capture.captureSequence(2000, record);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 1, 65000);
        QVERIFY(before > 0 && during > before && next > during);
        capture.cancel(next);
        const int killed = capture.captureSequence(500, record);
        capture.killChildForTest();
        QTRY_COMPARE_WITH_TIMEOUT(failed.size(), 1, 10000);
        const int recovered = capture.captureSequence(1000, record);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 2, 65000);
        const int detached = capture.captureSequence(2000, record);
        capture.setTimeline(nullptr);
        QTRY_COMPARE_WITH_TIMEOUT(cancelled.size(), 3, 10000);
        QTRY_COMPARE(capture.pending(), 0);
        QTest::qWait(200);
        for (int id : {before, during, next, killed, recovered, detached}) QCOMPARE(results[id], 1);
        bool called = false;
        {
            FrameCapture doomed;
            configure(doomed, &model);
            doomed.captureSequence(0, [&](const auto&) { called = true; });
        }
        QTest::qWait(50);
        QVERIFY(!called);
        {
            FrameCapture doomed;
            configure(doomed, &model);
            doomed.captureSequence(0, [&](const auto&) { called = true; });
            QTRY_VERIFY_WITH_TIMEOUT(doomed.processId() > 0, 10000);
        }
        QTest::qWait(50);
        QVERIFY(!called);
        auto dyingModel = std::make_unique<TimelineModel>();
        QVERIFY(load(*dyingModel, fixture()));
        capture.setTimeline(dyingModel.get());
        capture.captureSequence(100);
        dyingModel.reset();
        QTRY_COMPARE(cancelled.size(), 4);
        QCOMPARE(capture.timeline(), nullptr);
    }
    void idleRestart() {
        FrameCapture capture;
        configure(capture);
        capture.setIdleInterval(200);
        QSignalSpy ready(&capture, &FrameCapture::frameReady);
        capture.captureSource(media("seek-360p30.mp4"), 0);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 1, 65000);
        QVERIFY(capture.processId() > 0);
        QTRY_VERIFY_WITH_TIMEOUT(capture.processId() == 0, 10000);
        capture.captureSource(media("seek-360p30.mp4"), 1000);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 2, 65000);
    }
    void cancelledBeforeStartStillCloses() {
        FrameCapture capture;
        configure(capture);
        capture.setIdleInterval(200);
        QSignalSpy cancelled(&capture, &FrameCapture::frameCancelled);
        const int id = capture.captureSource(media("seek-360p30.mp4"), 0);
        QTRY_VERIFY_WITH_TIMEOUT(capture.processId() > 0, 10000);
        capture.cancel(id);
        QTRY_COMPARE(cancelled.size(), 1);
        // A child started for nothing goes away after the idle time like any other.
        QTRY_VERIFY_WITH_TIMEOUT(capture.processId() == 0, 10000);
    }
    void failedSnapshotIsRetried() {
        const auto original = m_dir.filePath("late-original.mp4");
        auto raw = fixture();
        auto clips = raw.value("clips").toArray();
        auto clip = clips[0].toObject();
        clip.insert("originalMediaPath", original);
        clips[0] = clip;
        raw.insert("clips", clips);
        TimelineModel model;
        QVERIFY(load(model, raw));
        FrameCapture capture;
        configure(capture, &model);
        QSignalSpy failures(&capture, &FrameCapture::frameFailed);
        QSignalSpy ready(&capture, &FrameCapture::frameReady);
        capture.captureSequence(0);
        QTRY_COMPARE_WITH_TIMEOUT(failures.size(), 1, 10000);
        // The cache has the file now, with no change to the document.
        QVERIFY(QFile::copy(media("seek-360p30.mp4"), original));
        capture.captureSequence(0);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 1, 65000);
        QCOMPARE(failures.size(), 1);
    }
    void largeDocumentRequestStaysQuick() {
        auto raw = fixture();
        auto clips = raw.value("clips").toArray();
        const auto base = clips[0].toObject();
        clips = {};
        for (int i = 0; i < 2000; ++i) {
            auto clip = base;
            clip.insert("id", QStringLiteral("c%1").arg(i));
            clip.insert("startMs", i * 3000);
            clips.append(clip);
        }
        raw.insert("clips", clips);
        TimelineModel model;
        QVERIFY(load(model, raw));
        FrameCapture capture;
        configure(capture, &model);
        QSignalSpy ready(&capture, &FrameCapture::frameReady);
        QElapsedTimer call;
        call.start();
        capture.captureSequence(0);
        const auto first = call.nsecsElapsed() / 1000000.0;
        call.restart();
        capture.captureSequence(0);
        const auto second = call.nsecsElapsed() / 1000000.0;
        qInfo() << "2000 clip request ms: first" << first << "same document" << second;
        QVERIFY2(first < 100, qPrintable(QString::number(first)));
        QVERIFY2(second < 1, qPrintable(QString::number(second)));
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 2, 65000);
    }
    void asynchronousErrors() {
        FrameCapture capture;
        configure(capture);
        QSignalSpy failures(&capture, &FrameCapture::frameFailed);
        const int noTimeline = capture.captureSequence(0);
        const int negative = capture.captureSource("file", -1);
        const int nan = capture.captureSource("file", std::numeric_limits<double>::quiet_NaN());
        const int infinity = capture.captureSequence(std::numeric_limits<double>::infinity());
        const int empty = capture.captureSource({}, 0);
        QCOMPARE(failures.size(), 0);
        QVERIFY(noTimeline > 0 && negative > noTimeline && nan > negative && infinity > nan && empty > infinity);
        QTRY_COMPARE(failures.size(), 5);
        QCOMPARE(capture.pending(), 0);
        capture.setExecutable(m_dir.filePath("no-executable"));
        capture.captureSource(media("seek-360p30.mp4"), 0);
        QTRY_COMPARE_WITH_TIMEOUT(failures.size(), 6, 10000);
        configure(capture);
        QSignalSpy ready(&capture, &FrameCapture::frameReady);
        capture.captureSource(media("seek-360p30.mp4"), 0);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 1, 65000);
    }
    void cancelBeforeQueuedErrorDelivery() {
        FrameCapture capture;
        QSignalSpy failures(&capture, &FrameCapture::frameFailed);
        QSignalSpy cancelled(&capture, &FrameCapture::frameCancelled);
        const int id = capture.captureSource({}, 0);
        capture.cancel(id);
        QCOMPARE(failures.size(), 0);
        QCOMPARE(cancelled.size(), 0);
        QTRY_COMPARE(cancelled.size(), 1);
        QCOMPARE(failures.size(), 0);
        QCOMPARE(capture.pending(), 0);
    }
    void mountedQml() {
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    width: 200; height: 120
    FrameCapture {
        id: capture; objectName: "capture"
        onFrameReady: (requestId, image, timeMs) => { picture.image = image }
    }
    FrameImage { id: picture; objectName: "picture"; width: 100; height: 100 }
    FrameImage { objectName: "empty"; x: 100; width: 100; height: 100 }
})", QUrl());
        std::unique_ptr<QObject> item(component.create());
        QVERIFY2(item, qPrintable(component.errorString()));
        auto* capture = item->findChild<FrameCapture*>("capture");
        auto* picture = item->findChild<FrameImage*>("picture");
        auto* empty = item->findChild<FrameImage*>("empty");
        QVERIFY(capture && picture && empty);
        configure(*capture);
        QSignalSpy ready(capture, &FrameCapture::frameReady);
        capture->captureSource(media("seek-360p30.mp4"), 500);
        QTRY_COMPARE_WITH_TIMEOUT(ready.size(), 1, 65000);
        QVERIFY(!picture->image().isNull());
        QCOMPARE(picture->implicitWidth(), qreal(picture->image().width()));
        QCOMPARE(picture->implicitHeight(), qreal(picture->image().height()));
        const auto rendered = render(*qobject_cast<QQuickItem*>(item.get()));
        QVERIFY(!rendered.isNull());
        QVERIFY(rendered.pixelColor(50, 50).alpha() > 0);
        QCOMPARE(rendered.pixelColor(50, 0).alpha(), 0);
        QCOMPARE(rendered.pixelColor(150, 50).alpha(), 0);
        QCOMPARE(rendered.pixelColor(50, 110).alpha(), 0);
    }
};
QTEST_MAIN(FrameCaptureTest)
#include "tst_framecapture.moc"
