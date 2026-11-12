#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include <QApplication>
#include <QBuffer>
#include <QDir>
#include <QImage>
#include <QPointer>
#include <QPointingDevice>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QRegularExpression>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
#include <cmath>
#include <functional>
#include <memory>
using nodetool::node_editor::MediaResolver;
namespace {
QByteArray png(const QColor &color, const QSize &size = QSize(800, 400)) {
    QImage image(size, QImage::Format_ARGB32); image.fill(color);
    QByteArray bytes; QBuffer buffer(&bytes); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
    return bytes;
}
QVariantMap inlineImage(const QColor &color, const QSize &size = QSize(800, 400)) {
    return {{"uri", "data:image/png;base64," + QString::fromLatin1(png(color, size).toBase64())}};
}
QVariantMap pair(const QVariantMap &a = inlineImage(Qt::red), const QVariantMap &b = inlineImage(Qt::blue)) {
    return {{"type", "image_comparison"}, {"image_a", a}, {"image_b", b}};
}
QQuickItem *find(QQuickItem *root, const QString &name, bool text = false) {
    if (!root) { return nullptr; }
    if (root->isVisible() && (text ? root->property("text").toString() : root->objectName()) == name) { return root; }
    for (auto *child : root->childItems()) { if (auto *result = find(child, name, text)) { return result; } }
    return nullptr;
}
bool near(const QColor &actual, const QColor &expected) {
    return std::abs(actual.red() - expected.red()) < 12 && std::abs(actual.green() - expected.green()) < 12 && std::abs(actual.blue() - expected.blue()) < 12;
}
struct Host {
    MediaResolver ownResolver;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    explicit Host(const QVariantMap &comparison = pair(), MediaResolver *shared = nullptr, bool scroll = false) {
        engine.rootContext()->setContextProperty("mediaResolver", shared ? shared : &ownResolver);
        engine.rootContext()->setContextProperty("fixtureComparison", comparison);
        QQmlComponent component(&engine);
        if (scroll) {
            component.setData(R"(
                import QtQuick
                import NodeTool.NodeEditor as Editor
                Flickable {
                    objectName: "comparison-scroll"
                    contentWidth: width; contentHeight: 1000
                    boundsBehavior: Flickable.StopAtBounds
                    Editor.ImageComparisonOutput {
                        width: parent.width
                        comparison: fixtureComparison
                    }
                }
            )", QUrl("qrc:/comparison-fixture.qml"));
            object.reset(component.create());
        } else {
            component.loadUrl(QUrl("qrc:/qt/qml/NodeTool/NodeEditor/ImageComparisonOutput.qml"));
            object.reset(component.createWithInitialProperties({{"comparison", comparison}}));
        }
        error = component.errorString();
        if (!root()) { return; }
        root()->setParentItem(window.contentItem()); root()->setWidth(480); root()->setHeight(scroll ? 300 : 260);
        window.resize(480, scroll ? 300 : 280); window.show();
        QCoreApplication::processEvents();
    }
    QQuickItem *root() const { return qobject_cast<QQuickItem *>(object.get()); }
    QQuickItem *comparison() const { return find(root(), "output-comparison"); }
    QQuickItem *surface() const { return find(root(), "comparison-drag"); }
    QPoint at(double x, double y) const { return surface()->mapToScene(QPointF(surface()->width() * x, surface()->height() * y)).toPoint(); }
    QColor pixel(double x, double y) {
        const auto image = window.grabWindow(); const auto point = at(x, y); const auto ratio = image.devicePixelRatio();
        return image.pixelColor(qRound(point.x() * ratio), qRound(point.y() * ratio));
    }
    void setPair(const QVariantMap &value) { comparison()->setProperty("comparison", value); }
    void click(QQuickItem *item) {
        QTest::mouseClick(&window, Qt::LeftButton, {}, item->mapToScene(QPointF(item->width() / 2, item->height() / 2)).toPoint());
    }
};
// Layers decode off the GUI thread, so a pixel sample waits for both images to be ready.
bool imagesReady(const QQuickItem *root, int expected = 2) {
    int ready = 0;
    std::function<void(const QQuickItem *)> visit = [&](const QQuickItem *item) {
        if (item->inherits("QQuickImage") && item->property("source").toUrl().isLocalFile() && item->property("status").toInt() == 1) { ++ready; }
        for (auto *child : item->childItems()) { visit(child); }
    };
    visit(root);
    return ready == expected;
}
struct FakeHttp final : QObject {
    QTcpServer server;
    QHash<QString, QPointer<QTcpSocket>> sockets;
    QHash<QString, QByteArray> requests;
    QHash<QString, int> counts;
    FakeHttp() {
        server.listen(QHostAddress::LocalHost);
        connect(&server, &QTcpServer::newConnection, this, [this] {
            auto *socket = server.nextPendingConnection();
            connect(socket, &QTcpSocket::readyRead, socket, [this, socket] {
                const auto bytes = socket->property("request").toByteArray() + socket->readAll(); socket->setProperty("request", bytes);
                if (!bytes.contains("\r\n\r\n")) { return; }
                const auto path = QString::fromLatin1(bytes.split(' ').value(1)); sockets[path] = socket; requests[path] = bytes; ++counts[path];
            });
            connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
        });
    }
    QUrl base() const { return QUrl(QStringLiteral("http://127.0.0.1:%1").arg(server.serverPort())); }
    QString pathStarting(const QString &prefix) const {
        for (auto it = requests.cbegin(); it != requests.cend(); ++it) { if (it.key().startsWith(prefix)) { return it.key(); } }
        return {};
    }
    void reply(const QString &path, const QByteArray &bytes, const QByteArray &mime = "image/png", int status = 200) {
        auto socket = sockets.value(path); if (!socket) { return; }
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " Result\r\nContent-Type: " + mime + "\r\nContent-Length: " + QByteArray::number(bytes.size()) + "\r\nConnection: close\r\n\r\n" + bytes);
        socket->disconnectFromHost();
    }
};
}
class ImageComparisonTest final : public QObject {
    Q_OBJECT
    std::unique_ptr<QPointingDevice> touch_;
private slots:
    void initTestCase() { touch_.reset(QTest::createTouchDevice()); }
    void init() { QTest::failOnWarning(QRegularExpression(".*(?:TypeError|[Bb]inding loop|[Rr]earrange).*")); }
    // Existing native wipes already implement this behavior. These samples must
    // remain green while hover, leave, fit and metadata gaps are corrected.
    void existingWipePixels_data() {
        QTest::addColumn<QString>("mode"); QTest::addColumn<double>("position");
        for (const auto &mode : {QString("horizontal"), QString("vertical")}) {
            for (const auto value : {0.0, 0.25, 0.5, 0.75, 1.0}) {
                QTest::newRow(qPrintable(mode + QString::number(value))) << mode << value;
            }
        }
    }
    void existingWipePixels() {
        QFETCH(QString, mode); QFETCH(double, position);
        Host h; QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        h.comparison()->setProperty("mode", mode); h.comparison()->setProperty("position", position);
        const auto left = mode == "horizontal" ? QPointF(0.15, 0.5) : QPointF(0.5, 0.35);
        const auto right = mode == "horizontal" ? QPointF(0.85, 0.5) : QPointF(0.5, 0.65);
        QTRY_VERIFY_WITH_TIMEOUT(imagesReady(h.root()), 10000);
        QTRY_VERIFY_WITH_TIMEOUT(near(h.pixel(left.x(), left.y()), position > (mode == "horizontal" ? 0.15 : 0.35) ? Qt::red : Qt::blue), 3000);
        QVERIFY(near(h.pixel(right.x(), right.y()), position > (mode == "horizontal" ? 0.85 : 0.65) ? Qt::red : Qt::blue));
    }
    void hoverAndMouseLeaveFollowWeb() {
        Host h; QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QTRY_VERIFY_WITH_TIMEOUT(imagesReady(h.root()), 10000);
        QTest::mouseMove(&h.window, h.at(0.8, 0.5));
        QTRY_VERIFY(std::abs(h.comparison()->property("position").toReal() - 0.8) < 0.03);
        QVERIFY(near(h.pixel(0.7, 0.5), Qt::red));
        QTest::mouseMove(&h.window, QPoint(h.window.width() + 20, h.window.height() + 20));
        QEvent leave(QEvent::Leave); QApplication::sendEvent(&h.window, &leave);
        QTRY_COMPARE(h.comparison()->property("position").toReal(), 0.5);
        QVERIFY(near(h.pixel(0.7, 0.5), Qt::blue));
    }
    void touchRetainsBothAxesAndCancelReleasesGrab_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("horizontal") << QString("horizontal"); QTest::newRow("vertical") << QString("vertical");
    }
    void touchRetainsBothAxesAndCancelReleasesGrab() {
        QFETCH(QString, mode);
        Host h; QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface()); h.comparison()->setProperty("mode", mode);
        auto gesture = QTest::touchEvent(&h.window, touch_.get(), false);
        gesture.press(0, h.at(0.5, 0.5)).commit(); gesture.move(0, h.at(0.8, 0.8)).commit(); gesture.release(0, h.at(0.8, 0.8)).commit();
        QTRY_VERIFY(std::abs(h.comparison()->property("position").toReal() - 0.8) < 0.04);
        QTest::qWait(30); QVERIFY(std::abs(h.comparison()->property("position").toReal() - 0.8) < 0.04);
        gesture.press(1, h.at(0.2, 0.2)).commit(); QVERIFY(gesture.cancel());
        gesture.press(2, h.at(0.65, 0.65)).commit(); gesture.move(2, h.at(0.7, 0.7)).commit(); gesture.release(2, h.at(0.7, 0.7)).commit();
        QTRY_VERIFY(std::abs(h.comparison()->property("position").toReal() - 0.7) < 0.04);
    }
    void perpendicularTouchScrollsHost() {
        Host h(pair(), nullptr, true); QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        auto gesture = QTest::touchEvent(&h.window, touch_.get(), false);
        gesture.press(0, h.at(0.5, 0.8)).commit(); gesture.move(0, h.at(0.5, 0.5)).commit(); gesture.move(0, h.at(0.5, 0.15)).commit(); gesture.release(0, h.at(0.5, 0.15)).commit();
        QTRY_VERIFY(h.root()->property("contentY").toReal() > 20);
    }
    void labelsDimensionsAndKeyboardMode() {
        Host h; QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QTRY_VERIFY(find(h.root(), "A", true)); QVERIFY(find(h.root(), "B", true));
        QTRY_VERIFY(find(h.root(), QStringLiteral("800 × 400"), true));
        auto *toggle = find(h.root(), "comparison-mode"); QVERIFY(toggle);
        h.surface()->forceActiveFocus(); QTest::keyClick(&h.window, Qt::Key_Tab);
        QTRY_VERIFY(toggle->hasActiveFocus()); QTest::keyClick(&h.window, Qt::Key_Return);
        QCOMPARE(h.comparison()->property("mode").toString(), QString("vertical"));
        QCOMPARE(h.comparison()->property("position").toReal(), 0.5);
        QTest::keyClick(&h.window, Qt::Key_Space);
        QCOMPARE(h.comparison()->property("mode").toString(), QString("horizontal")); QVERIFY(toggle->hasActiveFocus());
    }
    void independentNaturalFitDoesNotUpscale_data() {
        QTest::addColumn<QSize>("aSize");
        QTest::newRow("small-intrinsic") << QSize(32, 24); QTest::newRow("portrait") << QSize(200, 400);
    }
    void independentNaturalFitDoesNotUpscale() {
        QFETCH(QSize, aSize);
        Host h(pair(inlineImage(Qt::red, aSize))); QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        h.comparison()->setProperty("position", 1.0);
        QTRY_VERIFY_WITH_TIMEOUT(imagesReady(h.root()), 10000);
        QTRY_VERIFY_WITH_TIMEOUT(near(h.pixel(0.5, 0.5), Qt::red), 3000);
        const auto offset = 80.0 / h.surface()->width();
        QVERIFY2(near(h.pixel(0.5 + offset, 0.5), Qt::blue), "A must fit independently and small images must retain natural size");
        h.root()->setWidth(600); h.window.resize(600, 280); QTest::qWait(30);
        QCOMPARE(h.comparison()->property("position").toReal(), 1.0);
        QVERIFY(near(h.pixel(0.5 + 80.0 / h.surface()->width(), 0.5), Qt::blue));
    }
    // A large image decoded on the GUI thread freezes the editor, so both layers load
    // asynchronously. The pair is still painted once decoding finishes.
    void largeImageDecodesAsynchronously() {
        Host h(pair(inlineImage(Qt::red, QSize(5000, 4000)), inlineImage(Qt::blue, QSize(5000, 4000))));
        QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QList<QQuickItem *> images;
        std::function<void(QQuickItem *)> collect = [&](QQuickItem *item) {
            if (item->inherits("QQuickImage") && item->property("source").toUrl().isLocalFile()) { images.append(item); }
            for (auto *child : item->childItems()) { collect(child); }
        };
        collect(h.root());
        QCOMPARE(images.size(), 2);
        for (auto *image : images) { QVERIFY2(image->property("asynchronous").toBool(), "A layer decodes on the GUI thread"); }
        bool sawLoading = false;
        for (auto *image : images) { sawLoading = sawLoading || image->property("status").toInt() == 2; }
        QVERIFY2(sawLoading, "Decoding must be pending while the event loop runs");
        h.comparison()->setProperty("position", 1.0);
        QTRY_VERIFY_WITH_TIMEOUT(imagesReady(h.root()), 20000);
        QTRY_VERIFY_WITH_TIMEOUT(near(h.pixel(0.25, 0.5), Qt::red), 10000);
    }
    void transparentPairShowsChecker() {
        Host h(pair(inlineImage(Qt::transparent), inlineImage(Qt::transparent))); QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QTest::qWait(80);
        const auto image = h.window.grabWindow(); const auto center = h.at(0.5, 0.5); const auto ratio = image.devicePixelRatio();
        const auto first = image.pixelColor(qRound(center.x() * ratio), qRound(center.y() * ratio));
        const auto second = image.pixelColor(qRound((center.x() + 6) * ratio), qRound(center.y() * ratio));
        QVERIFY2(first != second, "Transparent comparison needs the alpha checker behind both layers");
    }
    void authenticatedAssetAndPackageSources() {
        FakeHttp http; QVERIFY(http.server.isListening()); MediaResolver resolver; resolver.configure(http.base(), "comparison-account");
        Host h(pair({{"asset_id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}, {{"uri", "package://fixture/b.png"}}), &resolver);
        QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QTRY_VERIFY(!http.pathStarting("/trpc/assets.get?").isEmpty());
        const auto lookup = http.pathStarting("/trpc/assets.get?");
        QVERIFY(http.requests[lookup].contains("Authorization: Bearer comparison-account"));
        http.reply(lookup, R"({"result":{"data":{"get_url":"/api/a.png"}}})", "application/json");
        QTRY_VERIFY(http.requests.contains("/api/a.png"));
        QTRY_VERIFY(http.requests.contains("/api/assets/packages/fixture/b.png"));
        QVERIFY(http.requests["/api/a.png"].contains("Authorization: Bearer comparison-account"));
        QVERIFY(http.requests["/api/assets/packages/fixture/b.png"].contains("Authorization: Bearer comparison-account"));
        http.reply("/api/a.png", png(Qt::red)); http.reply("/api/assets/packages/fixture/b.png", png(Qt::blue));
        QTRY_VERIFY_WITH_TIMEOUT(near(h.pixel(0.25, 0.5), Qt::red) && near(h.pixel(0.75, 0.5), Qt::blue), 3000);
        // Each side is fetched once. A duplicate request cancels the first one.
        QCOMPARE(http.counts.value(lookup), 1);
        QCOMPARE(http.counts.value("/api/a.png"), 1);
        QCOMPARE(http.counts.value("/api/assets/packages/fixture/b.png"), 1);
    }
    void replacementClearAndDestroyedInstanceRejectLateReplies() {
        FakeHttp http; QVERIFY(http.server.isListening()); MediaResolver resolver; resolver.configure(http.base(), "first-account");
        auto h = std::make_unique<Host>(pair({{"uri", "/api/late.png"}}, inlineImage(Qt::blue)), &resolver);
        QVERIFY2(h->root(), qPrintable(h->error)); QVERIFY(h->surface()); QTRY_VERIFY(http.requests.contains("/api/late.png"));
        h->setPair(pair(inlineImage(Qt::green), inlineImage(Qt::blue))); http.reply("/api/late.png", png(Qt::red));
        QTRY_VERIFY_WITH_TIMEOUT(near(h->pixel(0.25, 0.5), Qt::green), 3000);
        resolver.configure(http.base(), "second-account"); QTest::qWait(30);
        QVERIFY(!near(h->pixel(0.25, 0.5), Qt::green));
        h->setPair(pair({{"uri", "/api/destroyed.png"}}, inlineImage(Qt::blue)));
        QTRY_VERIFY(http.requests.contains("/api/destroyed.png")); const auto socket = http.sockets["/api/destroyed.png"];
        h.reset();
        QTRY_VERIFY(!socket || socket->state() == QAbstractSocket::UnconnectedState);
        Host survivor(pair(), &resolver); QVERIFY2(survivor.root(), qPrintable(survivor.error)); QVERIFY(survivor.surface());
        QTRY_VERIFY_WITH_TIMEOUT(near(survivor.pixel(0.25, 0.5), Qt::red), 3000);
    }
    void missingDataAndFailedSideRetry() {
        Host missing(pair({}, inlineImage(Qt::blue))); QVERIFY2(missing.root(), qPrintable(missing.error));
        QTRY_VERIFY(find(missing.root(), "Missing image data for comparison", true));
        FakeHttp http; QVERIFY(http.server.isListening()); MediaResolver resolver; resolver.configure(http.base(), "retry-account");
        Host h(pair({{"uri", "/api/retry.png"}}, inlineImage(Qt::blue)), &resolver); QVERIFY2(h.root(), qPrintable(h.error)); QVERIFY(h.surface());
        QTRY_VERIFY(http.requests.contains("/api/retry.png")); http.reply("/api/retry.png", {}, "image/png", 503);
        // The full parallel suite slows this suite fivefold.
        QTRY_VERIFY_WITH_TIMEOUT(find(h.root(), "Retry A", true), 15000);
        http.requests.remove("/api/retry.png"); h.click(find(h.root(), "Retry A", true));
        QTRY_VERIFY(http.requests.contains("/api/retry.png")); http.reply("/api/retry.png", png(Qt::red));
        QTRY_VERIFY_WITH_TIMEOUT(near(h.pixel(0.25, 0.5), Qt::red), 3000);
    }
};
int main(int argc, char **argv) {
    QApplication app(argc, argv);
    nodetool::node_editor::registerMediaTypes();
    ImageComparisonTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "ImageComparisonTest.moc"
