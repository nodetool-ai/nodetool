#include "media/MediaResolver.h"
#include "media/VideoFrameView.h"
#include "ui/EditorWindow.h"
#include <QQuickWidget>
#include <QApplication>
#include <QDataStream>
#include <QBuffer>
#include <QImage>
#include <QFile>
#include <QMediaPlayer>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QSignalSpy>
#include <QVideoSink>
#include <QVideoFrame>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
#include <memory>
using nodetool::node_editor::MediaResolver;
class MediaUiTest final : public QObject {
  Q_OBJECT
private:
  static QMediaPlayer *findPlayer(QQuickItem *item) {
    if (auto player = item->findChild<QMediaPlayer *>("preview-player")) { return player; }
    for (auto child : item->childItems()) { if (auto player = findPlayer(child)) { return player; } }
    return nullptr;
  }
  QByteArray wav() {
    QByteArray bytes;
    QDataStream out(&bytes, QIODevice::WriteOnly);
    out.setByteOrder(QDataStream::LittleEndian);
    out.writeRawData("RIFF", 4); out << quint32(36 + 48000);
    out.writeRawData("WAVEfmt ", 8); out << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(16000) << quint16(2) << quint16(16);
    out.writeRawData("data", 4); out << quint32(48000);
    bytes.append(QByteArray(48000, '\0'));
    return bytes;
  }
  void exercise(const QString &kind, const QByteArray &bytes, const QString &mime) {
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY_WITH_TIMEOUT(component.status() != QQmlComponent::Loading, 5000);
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    const auto locator = "data:" + mime + ";base64," + QString::fromLatin1(bytes.toBase64());
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", kind}, {"locator", locator}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    auto player = preview->findChild<QMediaPlayer *>("preview-player");
    QVERIFY(player);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 1000, 15000);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(player->isSeekable());
    if (kind == "video") {
      QVERIFY(player->videoSink());
    }
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "togglePlayback"));
    QTRY_COMPARE_WITH_TIMEOUT(player->playbackState(), QMediaPlayer::PlayingState, 5000);
    QTRY_VERIFY_WITH_TIMEOUT(player->position() > 100, 5000);
    if (kind == "video") {
      QTRY_VERIFY_WITH_TIMEOUT(player->videoSink()->videoFrame().isValid(), 5000);
      auto view = preview->findChild<QQuickItem *>("preview-video");
      QVERIFY(view);
      QTRY_VERIFY(view->property("hasFrame").toBool());
    }
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "togglePlayback"));
    QTRY_COMPARE(player->playbackState(), QMediaPlayer::PausedState);
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "seek", Q_ARG(QVariant, 1000)));
    QTRY_VERIFY(qAbs(player->position() - 1000) < 200);
    resolver.clear();
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(player->source().isEmpty());
    preview->setProperty("locator", "data:audio/wav;base64,bm90IG1lZGlh");
    QTRY_VERIFY_WITH_TIMEOUT(!preview->property("failure").toString().isEmpty(), 10000);
    preview->setProperty("locator", locator);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 1000 && preview->property("failure").toString().isEmpty(), 10000);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
  }
private slots:
  void liveBackendVideo() {
    const auto server = qEnvironmentVariable("NODETOOL_LIVE_URL");
    if (server.isEmpty()) { QSKIP("Set NODETOOL_LIVE_URL and NODETOOL_LIVE_VIDEO_ASSET for optional real backend playback"); }
    const auto asset = qEnvironmentVariable("NODETOOL_LIVE_VIDEO_ASSET");
    QVERIFY(!asset.isEmpty());
    nodetool::EditorWindow window;
    window.show();
    window.session()->connectToServer(QUrl(server), qEnvironmentVariable("NODETOOL_TOKEN"));
    QTRY_VERIFY_WITH_TIMEOUT(window.session()->connected(), 30000);
    QTRY_VERIFY_WITH_TIMEOUT(!window.session()->catalog().isEmpty(), 30000);
    const QJsonObject node{{"id", "fixture-video"}, {"type", "nodetool.constant.Video"},
      {"properties", QJsonObject{{"value", QJsonObject{{"type", "video"}, {"asset_id", asset}}}}},
      {"ui_properties", QJsonObject{{"position", QJsonObject{{"x", 0}, {"y", 0}}}}}};
    QVERIFY(window.document()->load({{"name", "Live backend: synthetic video asset"}, {"graph", QJsonObject{{"nodes", QJsonArray{node}}, {"edges", QJsonArray{}}}}}));
    QSignalSpy saved(window.session(), &nodetool::node_editor::WorkflowSession::saved);
    window.action("Server Save");
    QTRY_COMPARE_WITH_TIMEOUT(saved.size(), 1, 30000);
    window.action("Run");
    QTRY_VERIFY_WITH_TIMEOUT(!window.outputMedia().isEmpty(), 30000);
    QQuickWidget *panel = nullptr;
    for (auto item : window.findChildren<QQuickWidget *>()) { if (item->source().fileName() == "RunOutput.qml") panel = item; }
    QVERIFY(panel);
    QMediaPlayer *player = nullptr;
    QTRY_VERIFY((player = findPlayer(panel->rootObject())) != nullptr);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 0, 30000);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    player->play();
    QTRY_VERIFY_WITH_TIMEOUT(player->videoSink()->videoFrame().isValid(), 10000);
    player->pause();
    window.fit();
    QCoreApplication::processEvents();
    QTest::qWait(250);
    QVERIFY(window.grab().save("/home/mg/.cache/native-node-editor-live-video.png"));
    window.session()->disconnectFromServer();
    QVERIFY(player->source().isEmpty());
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
  }
  void productionOutputHistory() {
    QFile fixture(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    QVERIFY(fixture.open(QIODevice::ReadOnly));
    const auto source = "data:video/mp4;base64," + QString::fromLatin1(fixture.readAll().toBase64());
    nodetool::EditorWindow window;
    window.show();
    window.action("Output");
    auto output = window.runOutput();
    output->beginRun("synthetic-video");
    output->ingest("synthetic-video", {{"type", "output_update"}, {"job_id", "synthetic-video"}, {"node_id", "fixture"},
      {"node_name", "Synthetic deterministic video fixture"}, {"output_name", "video"},
      {"value", QJsonObject{{"type", "video"}, {"uri", source}}}});
    QTRY_COMPARE(window.outputMedia().size(), 1);
    QQuickWidget *panel = nullptr;
    for (auto item : window.findChildren<QQuickWidget *>()) { if (item->source().fileName() == "RunOutput.qml") panel = item; }
    QVERIFY(panel);
    QMediaPlayer *player = nullptr;
    QTRY_VERIFY((player = findPlayer(panel->rootObject())) != nullptr);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 1000, 15000);
    player->play();
    QTRY_VERIFY_WITH_TIMEOUT(player->videoSink()->videoFrame().isValid(), 5000);
    output->ingest("synthetic-video", {{"type", "log_update"}, {"job_id", "synthetic-video"}, {"content", "Playback remains active while logs arrive"}});
    QCOMPARE(findPlayer(panel->rootObject()), player);
    QCOMPARE(player->playbackState(), QMediaPlayer::PlayingState);
    QTest::qWait(250);
    QVERIFY(window.grab().save("/tmp/native-node-editor-synthetic-video.png"));
    output->beginRun("selected-empty-run");
    QTRY_VERIFY(window.outputMedia().isEmpty());
    QTRY_VERIFY(findPlayer(panel->rootObject()) == nullptr);
    output->selectRun("synthetic-video");
    QTRY_VERIFY((player = findPlayer(panel->rootObject())) != nullptr);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 1000, 15000);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
  }
  void clearingLocatorCancelsPending() {
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY(component.isReady());
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", QString("http://127.0.0.1:%1/image.png").arg(server.serverPort())}}));
    QVERIFY(preview);
    QTRY_VERIFY(server.hasPendingConnections());
    auto socket = server.nextPendingConnection();
    QSignalSpy resolved(&resolver, &MediaResolver::resolved);
    preview->setProperty("locator", QString());
    QTRY_VERIFY(socket->state() == QAbstractSocket::UnconnectedState);
    QCOMPARE(resolved.size(), 0);
    QVERIFY(preview->property("resolvedSource").toUrl().isEmpty());
    QVERIFY(preview->property("failure").toString().isEmpty());
  }
  void imagePreview() {
    QImage image(80, 40, QImage::Format_RGB32);
    image.fill(Qt::blue);
    QByteArray bytes;
    QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY(component.isReady());
    const auto source = "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", source}}));
    QVERIFY(preview);
    auto rendered = preview->findChild<QQuickItem *>("preview-image"); QVERIFY(rendered);
    QTRY_COMPARE(rendered->property("status").toInt(), 1);
    QCOMPARE(rendered->property("fillMode").toInt(), 1);
    resolver.clear();
    QVERIFY(rendered->property("source").toUrl().isEmpty());
  }
  void audioPlayback() { exercise("audio", wav(), "audio/wav"); }
  void videoPlayback() {
    QFile file(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    QVERIFY(file.open(QIODevice::ReadOnly));
    exercise("video", file.readAll(), "video/mp4");
  }
};
int main(int argc, char **argv) {
  Q_INIT_RESOURCE(editor_qml);
  QApplication app(argc, argv);
  nodetool::node_editor::registerMediaTypes();
  MediaUiTest test;
  return QTest::qExec(&test, argc, argv);
}
#include "MediaUiTest.moc"
