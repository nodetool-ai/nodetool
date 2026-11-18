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
#include "preview/SyntheticSource.h"
#include "preview/hw/HwWindow.h"

#include <QGuiApplication>
#include <QImage>
#include <QQuickItem>
#include <QQuickView>
#include <QTest>
#include <QTimer>

#include <cstdlib>

namespace {

// Answers on the next event-loop turn, as a real loader does.
class DeferredLoader final : public nt::TimelineDocumentLoader {
    Q_OBJECT

public:
    void load(const QString& timelineId) override {
        QTimer::singleShot(0, this, [this, timelineId] {
            emit loaded(timelineId, FakeTimelineLoader::document(timelineId), {});
        });
    }
    void cancel() override {}
};

bool near(QRgb pixel, const QColor& color) {
    return std::abs(qRed(pixel) - color.red()) <= 16 && std::abs(qGreen(pixel) - color.green()) <= 16 &&
           std::abs(qBlue(pixel) - color.blue()) <= 16;
}

}  // namespace

class TestTimelinePlayerRender : public QObject {
    Q_OBJECT

private slots:
    void playsThroughTheItem() {
        const nt::HookRegistrations hooks = nt::registerStandardHooks();
        DeferredLoader loader;
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
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    nt::hw::selectGraphicsApi(false);
    TestTimelinePlayerRender test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_timelineplayer_render.moc"
