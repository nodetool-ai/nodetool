// TimelinePlayer.qml on the platform QRhi (label `render`): a shown window
// draws the loaded document through PreviewCompositor, and the position
// advances while it plays. CI runs it on xcb under Xvfb with Vulkan on
// lavapipe, on Cocoa with Metal and on Windows with D3D11 on WARP.
#include "FakeTimelineLoader.h"

#include "model/StaticTimelineSource.h"
#include "playback/PlaybackClock.h"
#include "player/TimelinePlayerController.h"
#include "preview/PreviewCompositor.h"
#include "preview/StandardHooks.h"
#include "preview/SourcePool.h"
#include "preview/StillImageSource.h"
#include "server/AssetCache.h"
#include "preview/SyntheticSource.h"
#include "preview/hw/HwWindow.h"

#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QQuickItem>
#include <QQuickView>
#include <QPointer>
#include <QScopeGuard>
#include <QTemporaryDir>
#include <QTest>
#include <QTimer>

#include <atomic>
#include <cstdlib>
#include <semaphore>
#include <utility>

namespace {

// Answers on the next event-loop turn, as a real loader does.
class DeferredLoader final : public nt::TimelineDocumentLoader {
    Q_OBJECT

public:
    std::shared_ptr<void> nextLeases;

    void load(const QString& timelineId, const QUuid& request) override {
        const QPointer self(this);
        QTimer::singleShot(0, this, [self, timelineId, request, leases = std::exchange(nextLeases, {})] {
            if (self) {
                emit self->loaded(timelineId, request, FakeTimelineLoader::document(timelineId), leases);
            }
        });
    }
    void cancel() override {}
};

// The test and worker share this barrier until a failed assertion or the
// normal test path releases the worker to finish reading.
struct ReadBarrier {
    std::atomic<bool> entered{false};
    std::binary_semaphore resume{0};
};

bool near(QRgb pixel, const QColor& color) {
    return std::abs(qRed(pixel) - color.red()) <= 16 && std::abs(qGreen(pixel) - color.green()) <= 16 &&
           std::abs(qBlue(pixel) - color.blue()) <= 16;
}

}  // namespace

class TestTimelinePlayerRender : public QObject {
    Q_OBJECT

private slots:
    void playsThroughTheItemAndPinsTheLastRenderedDocument() {
        const nt::HookRegistrations hooks = nt::registerStandardHooks();
        DeferredLoader loader;
        auto lease = std::make_shared<int>(1);
        const std::weak_ptr<int> leaseAlive = lease;
        loader.nextLeases = std::move(lease);
        QQuickView view;
        nt::hw::prepareWindow(&view);
        view.setInitialProperties({{QStringLiteral("loader"), QVariant::fromValue<QObject*>(&loader)},
                                   {QStringLiteral("timelineId"), QStringLiteral("t1")}});
        view.loadFromModule("NodeTool.TimelinePlayer", "TimelinePlayer");
        QVERIFY2(view.status() == QQuickView::Ready,
                 qPrintable(view.errors().isEmpty() ? QString() : view.errors().first().toString()));
        view.setResizeMode(QQuickView::SizeRootObjectToView);
        view.resize(480, 340);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));
        QVERIFY2(view.rendererInterface()->graphicsApi() != QSGRendererInterface::Software,
                 "this test needs the platform QRhi, not the software scene graph");

        QQuickItem* root = view.rootObject();
        auto* controller = root->property("controller").value<TimelinePlayerController*>();
        QVERIFY(controller);
        QTRY_COMPARE(controller->status(), TimelinePlayerController::Status::Ready);
        auto* compositor = root->findChild<PreviewCompositor*>(QStringLiteral("timelinePlayerCompositor"));
        QVERIFY(compositor);
        QVERIFY(compositor->isVisible());
        QCOMPARE(compositor->timeline(), controller->source());
        QCOMPARE(compositor->clock(), controller->clock());

        // The first clip's synthetic pattern fills the canvas at 0.5 s.
        controller->seek(500);
        compositor->requestCapture();
        // A paused compositor renders on request only, and the read-back
        // arrives a frame or two after the request.
        const auto captured = [compositor] {
            compositor->update();
            return compositor->captureReady();
        };
        QTRY_VERIFY_WITH_TIMEOUT(captured(), 10000);
        const QImage frame = compositor->takeCapture().convertToFormat(QImage::Format_ARGB32);
        QVERIFY(!frame.isNull());
        const QColor clipColor = nt::SyntheticSource::colorForId(QStringLiteral("c0"));
        qsizetype matching = 0;
        for (int y = 0; y < frame.height(); ++y) {
            for (int x = 0; x < frame.width(); ++x) {
                matching += near(frame.pixel(x, y), clipColor) ? 1 : 0;
            }
        }
        const double share = double(matching) / (double(frame.width()) * frame.height());
        QVERIFY2(share > 0.4, qPrintable(QStringLiteral("clip colour covers %1 of the frame").arg(share)));

        // Playback through the item's frame driver moves the position and the
        // picture.
        const double startMs = controller->positionMs();
        const long long framesBefore = compositor->framesRendered();
        controller->play();
        QVERIFY(controller->playing());
        QTRY_VERIFY_WITH_TIMEOUT(controller->positionMs() > startMs + 300.0, 10000);
        QVERIFY(controller->frame() > 12);
        QTRY_VERIFY_WITH_TIMEOUT(compositor->framesRendered() > framesBefore + 5, 10000);
        controller->pause();
        QVERIFY(!controller->playing());

        // Reload clears the UI snapshot synchronously. Until the next
        // synchronize(), the renderer can still use the old document.
        QVERIFY(!leaseAlive.expired());
        controller->setTimelineId(QStringLiteral("t2"));
        QVERIFY(!controller->source()->snapshot());
        QVERIFY(!leaseAlive.expired());
        QTRY_VERIFY(leaseAlive.expired());
    }

    void reloadKeepsReadingWorkersPinned_data() {
        QTest::addColumn<bool>("still");
        QTest::newRow("ffmpeg") << false;
        QTest::newRow("alpha-still") << true;
    }

    void reloadKeepsReadingWorkersPinned() {
        QFETCH(bool, still);
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const nt::server::AssetCacheRoot cache(directory.path());
        const QString folder = directory.filePath("server/user/clip/original");
        QVERIFY(QDir().mkpath(folder));
        const QString path = folder + (still ? "/v1.png" : "/v1.ppm");
        QImage media(32, 32, QImage::Format_RGBA8888);
        media.fill(QColor(64, 128, 192, still ? 128 : 255));
        QVERIFY(media.save(path));

        auto timeline = *FakeTimelineLoader::document(QStringLiteral("leased"));
        auto& clip = timeline.clips.front();
        clip.mediaPath = path.toStdString();
        clip.mediaType = still ? nt::MediaType::Image : nt::MediaType::Video;
        auto barrier = std::make_shared<ReadBarrier>();
        const auto blockRead = [barrier] {
            barrier->entered = true;
            barrier->resume.acquire();
        };
        nt::SourcePool pool(still ? nt::SourcePool::WorkerReadProbes{.video = {}, .still = blockRead}
                                  : nt::SourcePool::WorkerReadProbes{.video = blockRead, .still = {}});
        auto unblock = qScopeGuard([barrier] { barrier->resume.release(); });
        auto lease = std::make_shared<nt::server::AssetCacheRoot::Lease>(cache.lease(path));
        const std::weak_ptr<void> readerLease = lease;
        pool.update(timeline, 0.0, {}, lease);
        if (still) {
            const auto stillOpened = [&] {
                pool.update(timeline, 0.0, {}, lease);
                return dynamic_cast<nt::StillImageSource*>(pool.sourceFor(clip.id)) != nullptr;
            };
            QTRY_VERIFY(stillOpened());
            // The FFmpeg probe has finished. Only the still worker should
            // keep the lease after the reload.
            QTRY_COMPARE(pool.openDecoders(), 0);
        }
        QTRY_VERIFY(barrier->entered);

        auto reloaded = *FakeTimelineLoader::document(QStringLiteral("replacement"));
        reloaded.clips.front().id = clip.id;
        lease.reset();
        pool.update(reloaded, 0.0);
        cache.evict(1, {});
        QVERIFY2(QFile::exists(path), "reload let eviction delete a file its worker may still read");

        unblock.dismiss();
        barrier->resume.release();
        QTRY_VERIFY(readerLease.expired());
        // The weak pointer can expire before the last owner's destructor
        // releases the cache pin.
        const auto evicted = [&] {
            cache.evict(1, {});
            return !QFile::exists(path);
        };
        QTRY_VERIFY(evicted());
    }

    void hidingAnAncestorPausesPlayback() {
        DeferredLoader loader;
        QQuickView view;
        nt::hw::prepareWindow(&view);
        view.setInitialProperties({{QStringLiteral("loader"), QVariant::fromValue<QObject*>(&loader)},
                                   {QStringLiteral("timelineId"), QStringLiteral("t1")},
                                   {QStringLiteral("audioMode"), int(TimelinePlayerController::AudioMode::Null)}});
        view.loadFromModule("NodeTool.TimelinePlayer", "TimelinePlayer");
        QCOMPARE(view.status(), QQuickView::Ready);
        QQuickItem* root = view.rootObject();
        QQuickItem ancestor(view.contentItem());
        root->setParentItem(&ancestor);
        view.resize(480, 340);
        view.show();
        QVERIFY(QTest::qWaitForWindowExposed(&view));

        auto* controller = root->property("controller").value<TimelinePlayerController*>();
        QVERIFY(controller);
        QTRY_COMPARE(controller->status(), TimelinePlayerController::Status::Ready);
        controller->play();
        QVERIFY(controller->playing());
        QVERIFY(controller->audioEnabled());

        ancestor.setVisible(false);
        QVERIFY(!root->isVisible());
        QVERIFY(!controller->playing());
        QVERIFY(!controller->audioEnabled());

        controller->play();
        QVERIFY(!controller->playing());
        ancestor.setVisible(true);
        QTRY_VERIFY(root->isVisible());
        QTRY_VERIFY(controller->playbackVisible());
        QVERIFY(!controller->playing());
        controller->play();
        QVERIFY(controller->playing());
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    nt::hw::selectGraphicsApi(false);
    TestTimelinePlayerRender test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_timelineplayer_render.moc"
