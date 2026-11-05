#include "media/MediaResolver.h"
#include "media/AudioWaveform.h"
#include "media/VideoFrameView.h"
#include "ui/EditorWindow.h"
#include <QQuickWidget>
#include <QApplication>
#include <QDataStream>
#include <QBuffer>
#include <QImage>
#include <QFile>
#include <QFileDialog>
#include <QDir>
#include <QTemporaryFile>
#include <QTemporaryDir>
#include <QMediaPlayer>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QPointer>
#include <QVideoSink>
#include <QVideoFrame>
#include <QTcpServer>
#include <QTcpSocket>
#include <QtTest>
#include <memory>
#include <cmath>
using nodetool::node_editor::MediaResolver;
class MediaUiTest final : public QObject {
  Q_OBJECT
private:
  static bool saveCapture(const QImage &image, const QString &name) {
    const auto directory = qEnvironmentVariable("NODETOOL_MEDIA_CAPTURE_DIR");
    if (directory.isEmpty()) { return true; }
    return QDir().mkpath(directory) && image.save(QDir(directory).filePath(name));
  }
  static QQuickItem *findItem(QQuickItem *item, const QString &name, bool byText = false) {
    if (!item) { return nullptr; }
    if ((byText ? item->property("text").toString() == name : item->objectName() == name) && item->isVisible()) { return item; }
    for (auto child : item->childItems()) { if (auto result = findItem(child, name, byText)) { return result; } }
    return nullptr;
  }
  static QMediaPlayer *findPlayer(QQuickItem *item) {
    if (!item) { return nullptr; }
    if (auto player = item->findChild<QMediaPlayer *>("preview-player")) { return player; }
    for (auto child : item->childItems()) { if (auto player = findPlayer(child)) { return player; } }
    return nullptr;
  }
  QByteArray wav(int seconds = 3) {
    QByteArray bytes;
    QDataStream out(&bytes, QIODevice::WriteOnly);
    out.setByteOrder(QDataStream::LittleEndian);
    out.writeRawData("RIFF", 4); out << quint32(36 + seconds * 16000);
    out.writeRawData("WAVEfmt ", 8); out << quint32(16) << quint16(1) << quint16(1) << quint32(8000) << quint32(16000) << quint16(2) << quint16(16);
    out.writeRawData("data", 4); out << quint32(seconds * 16000);
    for (int frame = 0; frame < seconds * 8000; ++frame) {
      const auto amplitude = frame < seconds * 8000 / 3 ? 0.0 : (frame < seconds * 16000 / 3 ? 0.25 : 0.8);
      out << qint16(amplitude * 32767 * std::sin(2 * 3.141592653589793 * 220 * frame / 8000));
    }
    return bytes;
  }
  void exercise(const QString &kind, const QByteArray &bytes, const QString &mime) {
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY_WITH_TIMEOUT(component.status() != QQmlComponent::Loading, 5000);
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    QQmlComponent themeComponent(&engine);
    themeComponent.setData("import QtQml; import NodeTool.UiPrimitives as Ui; QtObject { property var theme: Ui.Theme }", QUrl());
    std::unique_ptr<QObject> themeHolder(themeComponent.create());
    QVERIFY2(themeHolder, qPrintable(themeComponent.errorString()));
    auto theme = qvariant_cast<QObject *>(themeHolder->property("theme"));
    QVERIFY(theme);
    const auto locator = "data:" + mime + ";base64," + QString::fromLatin1(bytes.toBase64());
    QQuickWindow surface;
    surface.resize(1000, 400);
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", kind}, {"locator", locator}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    auto previewItem = qobject_cast<QQuickItem *>(preview.get());
    QVERIFY(previewItem);
    previewItem->setParentItem(surface.contentItem());
    previewItem->setWidth(surface.width());
    surface.show();
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
    auto speed = preview->findChild<QQuickItem *>("preview-speed");
    QVERIFY(speed);
    speed->forceActiveFocus();
    QTRY_VERIFY(speed->hasActiveFocus());
    QTest::keyClick(&surface, Qt::Key_Down);
    QTRY_COMPARE(player->playbackRate(), 1.5);
    QCOMPARE(player->playbackState(), QMediaPlayer::PausedState);
    QTest::keyClick(&surface, Qt::Key_End);
    QTRY_COMPARE(player->playbackRate(), 2.0);
    QTest::keyClick(&surface, Qt::Key_Home);
    QTRY_COMPARE(player->playbackRate(), 0.5);
    QTest::keyClick(&surface, Qt::Key_Down);
    QTRY_COMPARE(player->playbackRate(), 1.0);
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "seek", Q_ARG(QVariant, 1000)));
    QTRY_VERIFY(qAbs(player->position() - 1000) < 200);
    if (kind == "audio") {
      auto waveform = preview->findChild<QQuickItem *>("preview-waveform");
      QVERIFY(waveform);
      QTRY_VERIFY_WITH_TIMEOUT(waveform->property("peaks").toList().size() > 100, 10000);
      QTRY_VERIFY(!waveform->property("loading").toBool());
      auto loop = preview->findChild<QQuickItem *>("preview-loop");
      QVERIFY(loop);
      const auto clickLoop = [&] {
        QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                         loop->mapToScene(QPointF(loop->width() / 2, loop->height() / 2)).toPoint());
      };
      clickLoop();
      QTRY_COMPARE(player->loops(), QMediaPlayer::Infinite);
      clickLoop();
      QTRY_COMPARE(player->loops(), 1);
      const auto peaks = waveform->property("peaks").toList();
      QCOMPARE(peaks.first().toFloat(), 0.0f);
      QVERIFY(peaks.last().toFloat() > 0.7f);
      QVERIFY(peaks[peaks.size() / 2].toFloat() > 0.2f);
      QVERIFY(peaks[peaks.size() / 2].toFloat() < 0.3f);
      QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                       waveform->mapToScene(QPointF(waveform->width() * 0.5, waveform->height() / 2)).toPoint());
      QTRY_VERIFY(qAbs(player->position() - player->duration() / 2) < 100);
      QCOMPARE(player->playbackState(), QMediaPlayer::PausedState);
      for (const auto scheme : {1, 2}) {
        theme->setProperty("preference", scheme == 1 ? 2 : 3);
        surface.setColor(theme->property("surfaceCanvas").value<QColor>());
        QTest::qWait(50);
        QVERIFY(saveCapture(surface.grabWindow(), QString("node-editor-waveform-%1.png").arg(scheme == 1 ? "dark" : "light")));
      }
      player->setPosition(player->duration() - 80);
      player->play();
      QTRY_COMPARE(player->playbackState(), QMediaPlayer::StoppedState);
      QTRY_COMPARE(player->position(), 0);
      resolver.clear();
      QVERIFY(waveform->property("peaks").toList().isEmpty());
      QVERIFY(!waveform->property("loading").toBool());
    }
    if (kind == "video") {
      auto fullscreen = preview->findChild<QQuickWindow *>("preview-fullscreen-window");
      auto button = preview->findChild<QQuickItem *>("preview-fullscreen");
      auto video = preview->findChild<QQuickItem *>("preview-video");
      QVERIFY(fullscreen);
      QVERIFY(button);
      QVERIFY(video);
      const auto sink = player->videoSink();
      const auto pausedAt = player->position();
      QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                       button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
      QTRY_VERIFY(fullscreen->isVisible());
      QTRY_COMPARE(fullscreen->visibility(), QWindow::FullScreen);
      QTRY_COMPARE(video->window(), fullscreen);
      QCOMPARE(player->videoSink(), sink);
      QCOMPARE(player->playbackState(), QMediaPlayer::PausedState);
      QCOMPARE(player->position(), pausedAt);
      QVERIFY(video->property("hasFrame").toBool());
      for (const auto scheme : {1, 2}) {
        theme->setProperty("preference", scheme == 1 ? 2 : 3);
        surface.setColor(theme->property("surfaceCanvas").value<QColor>());
        QTest::qWait(50);
        QVERIFY(saveCapture(fullscreen->grabWindow(), QString("node-editor-fullscreen-%1.png").arg(scheme == 1 ? "dark" : "light")));
      }
      QTest::keyClick(fullscreen, Qt::Key_Escape);
      QTRY_VERIFY(!fullscreen->isVisible());
      QTRY_COMPARE(video->window(), &surface);
      QCOMPARE(player->position(), pausedAt);
      QCOMPARE(player->playbackState(), QMediaPlayer::PausedState);
      QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                       button->mapToScene(QPointF(button->width() / 2, button->height() / 2)).toPoint());
      QTRY_VERIFY(fullscreen->isVisible());
      auto play = preview->findChild<QQuickItem *>("preview-play");
      QVERIFY(play);
      QTest::mouseClick(fullscreen, Qt::LeftButton, Qt::NoModifier,
                       play->mapToScene(QPointF(play->width() / 2, play->height() / 2)).toPoint());
      QTRY_COMPARE(player->playbackState(), QMediaPlayer::PlayingState);
      resolver.clear();
      QTRY_VERIFY(!fullscreen->isVisible());
      QVERIFY(!video->property("hasFrame").toBool());
    }
    resolver.clear();
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QVERIFY(player->source().isEmpty());
    preview->setProperty("locator", "data:audio/wav;base64,bm90IG1lZGlh");
    QTRY_VERIFY_WITH_TIMEOUT(!preview->property("failure").toString().isEmpty(), 10000);
    preview->setProperty("locator", locator);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 1000 && preview->property("failure").toString().isEmpty(), 10000);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    if (kind == "video") {
      auto fullscreen = preview->findChild<QQuickWindow *>("preview-fullscreen-window");
      QVERIFY(QMetaObject::invokeMethod(preview.get(), "toggleFullscreen"));
      QTRY_VERIFY(fullscreen->isVisible());
      preview->setProperty("locator", QString());
      QTRY_VERIFY(!fullscreen->isVisible());
      QVERIFY(player->source().isEmpty());
      QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    }
  }
private slots:
  void audioZoomMinimapAndDownload() {
    const auto bytes = wav(60);
    const auto source = "data:audio/wav;base64," + QString::fromLatin1(bytes.toBase64());
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY2(component.isReady(), qPrintable(component.errorString()));
    QQuickWindow surface;
    surface.resize(400, 400);
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "audio"}, {"locator", QVariantMap{{"uri", source}, {"name", "Room tone"}}}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    auto item = qobject_cast<QQuickItem *>(preview.get());
    QVERIFY(item);
    item->setParentItem(surface.contentItem());
    item->setWidth(surface.width());
    surface.show();
    auto waveform = preview->findChild<nodetool::node_editor::AudioWaveform *>("preview-waveform");
    auto minimap = preview->findChild<nodetool::node_editor::AudioWaveform *>("preview-minimap");
    auto player = preview->findChild<QMediaPlayer *>("preview-player");
    QVERIFY(waveform); QVERIFY(minimap); QVERIFY(player);
    QTRY_VERIFY_WITH_TIMEOUT(player->duration() > 59000 && waveform->peaks().size() > 500, 15000);
    QTRY_VERIFY(!waveform->loading());
    QCOMPARE(minimap->dataSource(), waveform);
    QCOMPARE(minimap->peaks(), waveform->peaks());
    QVERIFY(minimap->isVisible());
    QCOMPARE(preview->property("filename").toString(), QString("Room tone"));
    QVariant formattedTime;
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "time", Q_RETURN_ARG(QVariant, formattedTime), Q_ARG(QVariant, 3661000)));
    QCOMPARE(formattedTime.toString(), QString("1:01:01"));
    QSignalSpy decoded(waveform, &nodetool::node_editor::AudioWaveform::peaksChanged);
    QSignalSpy sourceChanged(waveform, &nodetool::node_editor::AudioWaveform::sourceChanged);
    const auto click = [&](const QString &name, qreal fraction = 0.5) {
      auto control = preview->findChild<QQuickItem *>(name);
      QVERIFY(control);
      QVERIFY(control->isVisible());
      QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                       control->mapToScene(QPointF(control->width() * fraction, control->height() / 2)).toPoint());
    };
    auto zoom = preview->findChild<QQuickItem *>("preview-zoom");
    QVERIFY(zoom);
    click("preview-zoom", 0.99);
    QTRY_COMPARE(preview->property("zoom").toDouble(), 100.0);
    QVERIFY(preview->property("viewFraction").toDouble() < 0.1);
    click("preview-minimap", 0.75);
    QTRY_VERIFY(qAbs(player->position() - 45000) < 200);
    QVERIFY(preview->property("viewStart").toDouble() > 0.6);
    click("preview-waveform");
    QTRY_VERIFY(qAbs(player->position() - 45000) < 200);
    QCOMPARE(player->playbackState(), QMediaPlayer::StoppedState);
    QQmlComponent themeComponent(&engine);
    themeComponent.setData("import QtQml; import NodeTool.UiPrimitives as Ui; QtObject { property var theme: Ui.Theme }", QUrl());
    std::unique_ptr<QObject> themeHolder(themeComponent.create());
    QVERIFY2(themeHolder, qPrintable(themeComponent.errorString()));
    auto theme = qvariant_cast<QObject *>(themeHolder->property("theme"));
    QVERIFY(theme);
    for (const auto scheme : {2, 3}) {
      theme->setProperty("preference", scheme);
      surface.setColor(theme->property("surfaceCanvas").value<QColor>());
      QTest::qWait(50);
      QVERIFY(saveCapture(surface.grabWindow(), QString("node-editor-audio-zoom-%1.png").arg(scheme == 2 ? "dark" : "light")));
    }
    click("preview-fit");
    QTRY_COMPARE(preview->property("viewFraction").toDouble(), 1.0);
    QCOMPARE(decoded.size(), 0);
    QCOMPARE(sourceChanged.size(), 0);
    for (const auto name : {"preview-speed", "preview-zoom", "preview-fit", "preview-loop", "preview-mute", "preview-volume", "preview-download"}) {
      auto control = preview->findChild<QQuickItem *>(name);
      QVERIFY(control);
      QVERIFY(control->mapToScene(QPointF(control->width(), 0)).x() <= surface.width());
    }
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    const auto destination = QUrl::fromLocalFile(directory.filePath("Room tone.wav"));
    auto dialog = preview->findChild<QObject *>("preview-download-dialog");
    QVERIFY(dialog);
    QVERIFY(dialog->setProperty("options", int(QFileDialog::DontUseNativeDialog)));
    QVERIFY(dialog->setProperty("currentFolder", QUrl::fromLocalFile(directory.path())));
    click("preview-download");
    QTRY_VERIFY(dialog->property("visible").toBool());
    QVERIFY(dialog->property("selectedFile").toUrl().fileName().endsWith("Room tone.wav"));
    QQuickItem *nameField = nullptr;
    QTRY_VERIFY(([&] {
      for (auto window : QGuiApplication::allWindows()) {
        if (auto quick = qobject_cast<QQuickWindow *>(window)) {
          nameField = findItem(quick->contentItem(), "fileNameTextField");
          if (nameField) { return true; }
        }
      }
      return false;
    })());
    QVERIFY(nameField->isVisible());
    nameField->forceActiveFocus();
    QTest::keyClick(nameField->window(), Qt::Key_A, Qt::ControlModifier);
    for (const auto character : destination.fileName().toLatin1()) { QTest::keyClick(nameField->window(), character); }
    auto saveButton = findItem(nameField->window()->contentItem(), "Save", true);
    QVERIFY(saveButton);
    QTest::mouseClick(saveButton->window(), Qt::LeftButton, Qt::NoModifier,
                     saveButton->mapToScene(QPointF(saveButton->width() / 2, saveButton->height() / 2)).toPoint());
    QTRY_VERIFY(QFile::exists(destination.toLocalFile()));
    QFile downloaded(destination.toLocalFile());
    QVERIFY(downloaded.open(QIODevice::ReadOnly));
    QCOMPARE(downloaded.readAll(), bytes);
    downloaded.close();
    click("preview-download");
    QTRY_VERIFY(dialog->property("visible").toBool());
    const auto canceled = QUrl::fromLocalFile(directory.filePath("canceled.wav"));
    QVERIFY(dialog->setProperty("selectedFile", canceled));
    resolver.clear();
    QTRY_VERIFY(!dialog->property("visible").toBool());
    QVERIFY(!QFile::exists(canceled.toLocalFile()));
    QVERIFY(waveform->peaks().isEmpty());
    QVERIFY(minimap->peaks().isEmpty());
    QVERIFY(!waveform->loading());
  }
  void longWaveformStaysBounded() {
    auto bytes = wav();
    const auto pcm = bytes.mid(44);
    for (int i = 0; i < 19; ++i) { bytes.append(pcm); }
    QDataStream header(&bytes, QIODevice::ReadWrite);
    header.setByteOrder(QDataStream::LittleEndian);
    QVERIFY(header.device()->seek(4));
    header << quint32(bytes.size() - 8);
    QVERIFY(header.device()->seek(40));
    header << quint32(bytes.size() - 44);
    QTemporaryFile file;
    QVERIFY(file.open());
    QCOMPARE(file.write(bytes), bytes.size());
    QVERIFY(file.flush());
    nodetool::node_editor::AudioWaveform waveform;
    waveform.setSource(QUrl::fromLocalFile(file.fileName()));
    QTRY_VERIFY_WITH_TIMEOUT(waveform.peaks().size() > 500, 10000);
    QTRY_VERIFY(!waveform.loading());
    QVERIFY(waveform.peaks().size() <= 1024);
    QVERIFY(waveform.peaks().last().toFloat() > 0.7f);
    waveform.setSource({});
    QVERIFY(waveform.peaks().isEmpty());
    QVERIFY(!waveform.loading());
  }
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
    QVERIFY(saveCapture(window.grab().toImage(), "native-node-editor-live-video.png"));
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
    QVERIFY(saveCapture(window.grab().toImage(), "native-node-editor-synthetic-video.png"));
    QPointer<QQuickWindow> fullscreen = player->parent()->findChild<QQuickWindow *>("preview-fullscreen-window");
    QVERIFY(fullscreen);
    QVERIFY(QMetaObject::invokeMethod(player->parent(), "toggleFullscreen"));
    QTRY_VERIFY(fullscreen->isVisible());
    output->beginRun("selected-empty-run");
    QTRY_VERIFY(window.outputMedia().isEmpty());
    QTRY_VERIFY(findPlayer(panel->rootObject()) == nullptr);
    QTRY_VERIFY(fullscreen.isNull());
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
