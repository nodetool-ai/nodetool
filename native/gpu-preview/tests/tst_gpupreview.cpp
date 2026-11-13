// The preview path end to end: a WGSL compute shader runs on the wgpu
// device, its output texture is shared with Qt Quick's device, and the
// window's pixels are checked. grabWindow() reads the window back, in the
// test only: the counters prove the preview path itself transfers nothing.
#include "GpuPreview.h"
#include "GpuPreviewItem.h"
#include "ShaderFrameSource.h"

#include "host/gpu_device.h"

#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickView>
#include <QSGRendererInterface>
#include <QSignalSpy>
#include <QTest>

#include <memory>

using nt::preview::GpuPreviewItem;
using nt::preview::ShaderFrameSource;
namespace gpu = gr::host::gpu;

namespace {

// The catalog (tests/data/catalog.json): test.quadrants@1 writes red, green, blue and white quadrants (top left,
// top right, bottom left, bottom right), scaled by `level`, premultiplied
// by `alpha`. test.gray16@1 writes `level` as linear light into
// rgba16float.

const char* kBasicScene = "Basic.qml";

bool near(QRgb pixel, int r, int g, int b, int tolerance = 6) {
    return qAbs(qRed(pixel) - r) <= tolerance && qAbs(qGreen(pixel) - g) <= tolerance &&
           qAbs(qBlue(pixel) - b) <= tolerance;
}

QByteArray describe(QRgb pixel) {
    return QByteArray::number(qRed(pixel)) + "," + QByteArray::number(qGreen(pixel)) + "," +
           QByteArray::number(qBlue(pixel));
}

#define VERIFY_PIXEL(image, x, y, r, g, b)                                                                     \
    QVERIFY2(near((image).pixel(int(x), int(y)), r, g, b),                                                     \
             QByteArray("pixel ") + QByteArray::number(int(x)) + "," + QByteArray::number(int(y)) + " is " +   \
                 describe((image).pixel(int(x), int(y))))

// One window with a scene. The view owns the root item, which owns the
// source and the preview item.
struct Scene {
    std::unique_ptr<QQuickView> view;
    GpuPreviewItem* preview = nullptr;
    ShaderFrameSource* source = nullptr;
    QQuickItem* root = nullptr;
};

// Test data: tests/data, in the resources.
QString resource(const char* name) {
    QFile file(QStringLiteral(":/tests/data/") + QLatin1String(name));
    if (!file.open(QIODevice::ReadOnly)) qFatal("missing test resource %s", name);
    return QString::fromUtf8(file.readAll());
}

// `qml` names a scene in tests/data.
Scene makeScene(const char* qml, bool prepare = true) {
    Scene scene;
    scene.view = std::make_unique<QQuickView>();
    scene.view->rootContext()->setContextProperty(QStringLiteral("testCatalog"), resource("catalog.json"));
    QQmlComponent component(scene.view->engine());
    component.setData(resource(qml).toUtf8(), QUrl());
    QObject* created = component.create(scene.view->rootContext());
    if (!created) {
        qWarning() << component.errors();
        return scene;
    }
    scene.root = qobject_cast<QQuickItem*>(created);
    scene.view->setContent(QUrl(), nullptr, scene.root);  // the view takes the root item
    scene.view->setResizeMode(QQuickView::SizeRootObjectToView);
    scene.view->resize(int(scene.root->width()), int(scene.root->height()));
    scene.preview = scene.root->property("preview").value<GpuPreviewItem*>();
    scene.source = scene.root->property("source").value<ShaderFrameSource*>();
    if (prepare) nt::preview::prepareWindow(scene.view.get());
    scene.view->show();
    return scene;
}

bool waitForFrames(const Scene& scene, qulonglong count, int timeoutMs = 30000) {
    const qulonglong target = scene.preview->framesShown() + count;
    return QTest::qWaitFor([&] { return scene.preview->framesShown() >= target; }, timeoutMs);
}

std::shared_ptr<gpu::Device> device() {
    gr::GpuOptions options;
    options.enabled = true;
    std::string error;
    return gpu::Device::acquire(options, error);
}

}  // namespace

class TestGpuPreview : public QObject {
    Q_OBJECT

private slots:
    void initTestCase() {
        if (qEnvironmentVariableIsSet("NT_PREVIEW_TEST_SOFTWARE")) return;
        auto d = device();
        QVERIFY2(d, "no GPU device for the compute engine");
        const gpu::ShareSupport support = d->shareSupport();
        qInfo() << "compute device:" << QString::fromStdString(d->description())
                << "sharing:" << gpu::shareBackendName(support.backend) << QString::fromStdString(support.reason);
        // The preview needs a device that can share. A build without the
        // interop wgpu-native reports it here instead of passing vacuously.
        QVERIFY2(support.backend != gpu::ShareBackend::None, support.reason.c_str());
        m_baselineTextures = d->liveTextures();
    }

    void init() {
        if (qEnvironmentVariableIsSet("NT_PREVIEW_TEST_SOFTWARE") &&
            qstrcmp(QTest::currentTestFunction(), "softwareWindowIsUnavailable") != 0) {
            QSKIP("this run checks the software window only");
        }
    }

    // A compute shader's output reaches the window: content, orientation,
    // and no pixel transfer on the way.
    void showsComputeOutput() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(scene.preview && scene.source);
        QVERIFY(waitForFrames(scene, 3));
        QCOMPARE(scene.preview->status(), GpuPreviewItem::Ready);
        QCOMPARE(scene.source->error(), QString());
        QCOMPARE(scene.preview->frameSize(), QSize(320, 240));

        const QImage image = scene.view->grabWindow();
        QCOMPARE(image.size(), QSize(320, 240));
        VERIFY_PIXEL(image, 40, 30, 255, 0, 0);       // top left
        VERIFY_PIXEL(image, 280, 30, 0, 255, 0);      // top right
        VERIFY_PIXEL(image, 40, 210, 0, 0, 255);      // bottom left
        VERIFY_PIXEL(image, 280, 210, 255, 255, 255); // bottom right

        const QVariantMap stats = scene.source->stats();
        QCOMPARE(stats["gpuToCpuTransfers"].toULongLong(), 0ull);
        QCOMPARE(stats["gpuToGpuCopies"].toULongLong(), 0ull);
        QCOMPARE(stats["ownershipFailures"].toULongLong(), 0ull);
        QVERIFY(stats["framesPresented"].toULongLong() >= 3);
        // Three slots, each with one texture, however many frames ran.
        QVERIFY(stats["resourcesCreated"].toULongLong() <= 3);
    }

    // New params reach the screen: the frames keep coming from the shader.
    void followsParams() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 2));
        scene.source->setParams({{"level", 0.5}, {"alpha", 1.0}});
        QVERIFY(waitForFrames(scene, 4));
        const QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 40, 30, 128, 0, 0);
        VERIFY_PIXEL(image, 280, 210, 128, 128, 128);
    }

    // The item is ordinary scene graph content: items above it, opacity,
    // clipping by a parent, a transform, premultiplied alpha over a backdrop.
    void composesWithQml() {
        Scene scene = makeScene("Compose.qml");
        QVERIFY(waitForFrames(scene, 3));
        QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 40, 40, 255, 255, 0);    // the rectangle above the image
        // Red at half alpha, premultiplied, over the blue backdrop.
        VERIFY_PIXEL(image, 100, 100, 128, 0, 64);
        VERIFY_PIXEL(image, 100, 200, 0, 0, 192);    // blue quadrant over blue
        VERIFY_PIXEL(image, 240, 60, 0, 0, 128);     // clipped away: the backdrop

        // Item opacity multiplies the premultiplied color.
        scene.preview->setOpacity(0.5);
        QVERIFY(waitForFrames(scene, 2));
        image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 100, 100, 64, 0, 96);

        // A transform: flipped by the item's scale, the blue quadrant is on top.
        scene.preview->setOpacity(1.0);
        scene.preview->setTransformOrigin(QQuickItem::Center);
        scene.preview->setProperty("scale", 1.0);
        scene.preview->setMirrorVertically(true);
        QVERIFY(waitForFrames(scene, 2));
        image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 100, 40, 0, 0, 192);
    }

    // Fit keeps the frame's aspect inside the item; crop fills it.
    void fillModes() {
        Scene scene = makeScene(kBasicScene);
        scene.source->setFrameSize(QSize(64, 64));
        scene.preview->setFillMode(GpuPreviewItem::PreserveAspectFit);
        QVERIFY(QTest::qWaitFor([&] { return scene.preview->frameSize() == QSize(64, 64); }, 30000));
        QVERIFY(waitForFrames(scene, 2));
        QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 10, 120, 0, 0, 0);        // the bar left of a 240x240 image
        VERIFY_PIXEL(image, 60, 20, 255, 0, 0);
        VERIFY_PIXEL(image, 260, 220, 255, 255, 255);
        scene.preview->setFillMode(GpuPreviewItem::PreserveAspectCrop);
        QVERIFY(waitForFrames(scene, 2));
        image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 10, 20, 255, 0, 0);
        VERIFY_PIXEL(image, 310, 220, 255, 255, 255);
    }

    // A float texture is shared as rgba16float and encoded for the screen in
    // the draw: linear 0.5 is sRGB 188. An 8-bit path would show 128.
    void floatTextureKeepsItsFormat() {
        Scene scene = makeScene(kBasicScene);
        scene.source->setFormat(ShaderFrameSource::Rgba16Float);
        scene.source->setModule(QStringLiteral("test.gray16@1"));
        scene.source->setParams({{"level", 0.5}, {"alpha", 1.0}});
        QVERIFY(waitForFrames(scene, 4));
        QCOMPARE(scene.source->error(), QString());
        QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 160, 120, 188, 188, 188);
        // The same values declared sRGB-encoded pass through.
        scene.preview->setColorEncoding(GpuPreviewItem::Srgb);
        QVERIFY(waitForFrames(scene, 2));
        image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 160, 120, 128, 128, 128);
        QCOMPARE(scene.source->stats()["gpuToGpuCopies"].toULongLong(), 0ull);
    }

    // The frame follows the window: new textures at the new size, the old
    // ones retired, the content still right.
    void followsResize() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 2));
        for (const QSize size : {QSize(400, 300), QSize(200, 160), QSize(520, 410)}) {
            scene.view->resize(size);
            QVERIFY(QTest::qWaitFor([&] { return scene.preview->frameSize() == size; }, 30000));
            QVERIFY(waitForFrames(scene, 2));
            const QImage image = scene.view->grabWindow();
            QCOMPARE(image.size(), size);
            VERIFY_PIXEL(image, size.width() / 4, size.height() / 4, 255, 0, 0);
            VERIFY_PIXEL(image, size.width() * 3 / 4, size.height() * 3 / 4, 255, 255, 255);
        }
        const QVariantMap stats = scene.source->stats();
        QVERIFY(stats["resourcesRetired"].toULongLong() >= 3);
        QCOMPARE(stats["ownershipFailures"].toULongLong(), 0ull);
    }

    // Paused, no frame is produced and the last one stays on screen.
    void pausesAndResumes() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 3));
        scene.source->setRunning(false);
        QTest::qWait(300);
        const qulonglong paused = scene.preview->framesShown();
        QTest::qWait(400);
        QCOMPARE(scene.preview->framesShown(), paused);
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 30, 255, 0, 0);
        scene.source->setRunning(true);
        QVERIFY(waitForFrames(scene, 3));
    }

    // A producer that does not wait for the display replaces frames. No
    // slot is ever written while it is shown.
    void replacesFramesRapidly() {
        Scene scene = makeScene(kBasicScene);
        scene.source->setFrameSize(QSize(64, 64));
        scene.source->setPacing(ShaderFrameSource::Free);
        QVERIFY(waitForFrames(scene, 40));
        const QVariantMap stats = scene.source->stats();
        QCOMPARE(stats["ownershipFailures"].toULongLong(), 0ull);
        QCOMPARE(stats["gpuToCpuTransfers"].toULongLong(), 0ull);
        QVERIFY(stats["framesPublished"].toULongLong() >= stats["framesPresented"].toULongLong());
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 30, 255, 0, 0);
    }

    // Hiding the window releases Qt's device and with it every import. The
    // producer keeps its textures, and frames resume on a new device.
    void survivesSceneGraphRecreation() {
        Scene scene = makeScene(kBasicScene);
        scene.view->setPersistentSceneGraph(false);
        scene.view->setPersistentGraphics(false);
        QVERIFY(waitForFrames(scene, 3));
        for (int round = 0; round < 3; ++round) {
            QSignalSpy invalidated(scene.view.get(), &QQuickWindow::sceneGraphInvalidated);
            scene.view->hide();
            QVERIFY(invalidated.count() > 0 || invalidated.wait(10000));
            QTest::qWait(100);
            scene.view->show();
            QVERIFY(waitForFrames(scene, 3));
            VERIFY_PIXEL(scene.view->grabWindow(), 280, 30, 0, 255, 0);
        }
        QCOMPARE(scene.source->stats()["ownershipFailures"].toULongLong(), 0ull);
    }

    // Minimized, the window stops rendering; restored, frames continue.
    void minimizeAndRestore() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 3));
        scene.view->showMinimized();
        QTest::qWait(400);
        scene.view->showNormal();
        QVERIFY(waitForFrames(scene, 3));
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 210, 0, 0, 255);
    }

    // Two previews in one window, each with its own producer and ring.
    void multipleItems() {
        Scene scene = makeScene("Multiple.qml");
        auto* second = scene.root->property("second").value<GpuPreviewItem*>();
        QVERIFY(second);
        QVERIFY(waitForFrames(scene, 3));
        QVERIFY(QTest::qWaitFor([&] { return second->framesShown() >= 3; }, 30000));
        const QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 40, 30, 255, 0, 0);
        VERIFY_PIXEL(image, 120, 210, 255, 255, 255);
        VERIFY_PIXEL(image, 200, 30, 128, 0, 0);
        VERIFY_PIXEL(image, 280, 210, 128, 128, 128);
    }

    // Windows come and go, some while GPU work is queued. Afterwards the
    // device holds no texture of theirs.
    void createAndDestroyCycles() {
        for (int round = 0; round < 12; ++round) {
            Scene scene = makeScene(kBasicScene);
            scene.source->setPacing(round % 2 ? ShaderFrameSource::Free : ShaderFrameSource::Display);
            // Every third window dies before its first frame, every other one mid-stream.
            if (round % 3 != 0) QVERIFY(waitForFrames(scene, 2));
            if (round % 4 == 1) {
                // A producer owned outside the scene: the window goes first,
                // the producer after, with its frames still in the ring.
                auto outside = std::make_unique<ShaderFrameSource>();
                outside->setCatalog(resource("catalog.json"));
                outside->setModule(QStringLiteral("test.quadrants@1"));
                outside->setParams({{"level", 1.0}, {"alpha", 1.0}});
                outside->setPacing(ShaderFrameSource::Free);
                scene.preview->setSource(outside.get());
                QVERIFY(waitForFrames(scene, 2));
                scene.view.reset();
                outside.reset();
            }
        }
        // Deferred deletions and queued notifications of the dead windows.
        QCoreApplication::sendPostedEvents(nullptr, QEvent::DeferredDelete);
        QTest::qWait(200);
        auto d = device();
        QVERIFY(d);
        QCOMPARE(d->liveTextures(), m_baselineTextures);
    }

    // A source without an item, and an item without a source, do nothing.
    void detachedParts() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 2));
        scene.preview->setSource(nullptr);
        QVERIFY(QTest::qWaitFor([&] { return scene.preview->status() == GpuPreviewItem::Empty; }, 10000));
        const QImage image = scene.view->grabWindow();
        VERIFY_PIXEL(image, 40, 30, 0, 0, 0);
        scene.preview->setSource(scene.source);
        QVERIFY(waitForFrames(scene, 2));
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 30, 255, 0, 0);
    }

    // A module that does not exist, then one whose storage format is not
    // the texture's: an error, no frame, no crash, and recovery afterwards.
    void reportsShaderErrors() {
        Scene scene = makeScene(kBasicScene);
        QVERIFY(waitForFrames(scene, 2));
        scene.source->setModule(QStringLiteral("test.missing@1"));
        QVERIFY(QTest::qWaitFor([&] { return scene.source->error().contains("test.missing@1"); }, 10000));
        scene.source->setModule(QStringLiteral("test.gray16@1"));
        QVERIFY(QTest::qWaitFor([&] { return scene.source->error().contains("rgba16float"); }, 10000));
        // The last good frame is still shown.
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 30, 255, 0, 0);
        scene.source->setModule(QStringLiteral("test.quadrants@1"));
        QVERIFY(waitForFrames(scene, 2));
        QCOMPARE(scene.source->error(), QString());
    }

    // A window that was not prepared has no import extension on its device:
    // the item says so and draws nothing. There is no other path.
    void unpreparedWindowIsUnavailable() {
        if (QQuickWindow::graphicsApi() != QSGRendererInterface::Vulkan) QSKIP("only Vulkan windows need preparation");
        Scene scene = makeScene(kBasicScene, false);
        QVERIFY(QTest::qWaitFor([&] { return scene.preview->status() == GpuPreviewItem::Unavailable; }, 30000));
        QVERIFY2(scene.preview->statusText().contains("prepareWindow"), qPrintable(scene.preview->statusText()));
        QCOMPARE(scene.preview->framesShown(), 0ull);
        VERIFY_PIXEL(scene.view->grabWindow(), 40, 30, 0, 0, 0);
        QCOMPARE(scene.source->stats()["gpuToCpuTransfers"].toULongLong(), 0ull);
    }

    // Run on its own with NT_PREVIEW_TEST_SOFTWARE: a window without a GPU.
    void softwareWindowIsUnavailable() {
        if (!qEnvironmentVariableIsSet("NT_PREVIEW_TEST_SOFTWARE")) QSKIP("needs a software window (its own test run)");
        Scene scene = makeScene(kBasicScene);
        QVERIFY(QTest::qWaitFor([&] { return scene.preview->status() == GpuPreviewItem::Unavailable; }, 30000));
        QVERIFY2(scene.preview->statusText().contains("software"), qPrintable(scene.preview->statusText()));
        QCOMPARE(scene.preview->framesShown(), 0ull);
        QCOMPARE(scene.source->stats()["gpuToCpuTransfers"].toULongLong(), 0ull);
    }

private:
    size_t m_baselineTextures = 0;
};

int main(int argc, char** argv) {
    // The graphics API both runtimes share on this platform.
    if (qEnvironmentVariableIsSet("NT_PREVIEW_TEST_SOFTWARE")) {
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
    } else {
#if defined(Q_OS_MACOS)
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Metal);
#elif defined(Q_OS_WIN)
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Direct3D12);
#else
        QQuickWindow::setGraphicsApi(QSGRendererInterface::Vulkan);
#endif
    }
    QGuiApplication app(argc, argv);
    TestGpuPreview test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_gpupreview.moc"
