#include "media/MediaResolver.h"
#include "media/AudioWaveform.h"
#include "media/VideoFrameView.h"
#include "ui/EditorWindow.h"
#include <QQuickWidget>
#include <QApplication>
#include <QClipboard>
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
    // AVFoundation, the macOS media backend, identifies a file by its extension.
    QTemporaryFile file(QDir::tempPath() + "/waveform-XXXXXX.wav");
    QVERIFY(file.open());
    QCOMPARE(file.write(bytes), bytes.size());
    QVERIFY(file.flush());
    nodetool::node_editor::AudioWaveform waveform;
    // The decoder hands over one buffer per event loop round trip. QTRY polling
    // sleeps between rounds and stretches this decode from milliseconds to seconds,
    // so wait on the signal in a running event loop instead.
    QSignalSpy loading(&waveform, &nodetool::node_editor::AudioWaveform::loadingChanged);
    waveform.setSource(QUrl::fromLocalFile(file.fileName()));
    while (waveform.peaks().isEmpty() || waveform.loading()) { QVERIFY(loading.wait(10000)); }
    QVERIFY(waveform.peaks().size() > 500);
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
  void imagePreview_data() {
    QTest::addColumn<bool>("asset");
    QTest::newRow("inline") << false;
    QTest::newRow("authenticated-asset") << true;
  }
  void imagePreview() {
    QFETCH(bool, asset);
    QImage image(80, 40, QImage::Format_RGB32);
    image.fill(Qt::blue);
    QByteArray bytes;
    QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY(component.isReady());
    QList<QByteArray> requests;
    QTcpServer server;
    QVERIFY(server.listen(QHostAddress::LocalHost));
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto socket = server.nextPendingConnection();
      connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
        const auto request = socket->readAll();
        requests.append(request);
        const auto body = request.contains("/trpc/assets.get")
          ? QByteArray("{\"result\":{\"data\":{\"get_url\":\"/api/storage/image.png\"}}}") : bytes;
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + QByteArray::number(body.size()) + "\r\nConnection: close\r\n\r\n" + body);
        socket->disconnectFromHost();
      });
      connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    });
    resolver.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "image-download-token");
    const QVariant source = asset
      ? QVariant(QVariantMap{{"type", "image"}, {"asset_id", "0123456789abcdef0123456789abcdef"}})
      : QVariant("data:image/png;base64," + QString::fromLatin1(bytes.toBase64()));
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", source}, {"showDownload", true}}));
    QVERIFY(preview);
    QQuickWindow surface;
    surface.resize(400, 300);
    auto item = qobject_cast<QQuickItem *>(preview.get());
    QVERIFY(item);
    item->setParentItem(surface.contentItem());
    item->setSize(surface.size());
    surface.show();
    auto rendered = preview->findChild<QQuickItem *>("preview-image"); QVERIFY(rendered);
    QTRY_COMPARE(rendered->property("status").toInt(), 1);
    QCOMPARE(rendered->property("fillMode").toInt(), 1);
    auto download = preview->findChild<QQuickItem *>("preview-download");
    QVERIFY(download);
    QVERIFY(download->isVisible());
    QVERIFY(download->isEnabled());
    QVERIFY(preview->setProperty("showDownload", false));
    QVERIFY(!download->isVisible());
    QVERIFY(preview->setProperty("showDownload", true));
    QVERIFY(download->isVisible());
    for (const auto name : {"preview-speed", "preview-loop", "preview-mute", "preview-volume", "preview-fullscreen"}) {
      auto control = preview->findChild<QQuickItem *>(name);
      QVERIFY(control);
      QVERIFY(!control->isVisible());
    }
    const auto previewRequests = requests.size();
    auto dialog = preview->findChild<QObject *>("preview-download-dialog");
    QVERIFY(dialog);
    QVERIFY(dialog->setProperty("options", int(QFileDialog::DontUseNativeDialog)));
    QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier,
                     download->mapToScene(QPointF(download->width() / 2, download->height() / 2)).toPoint());
    QTRY_VERIFY(dialog->property("visible").toBool());
    QVERIFY(dialog->property("selectedFile").toUrl().fileName().endsWith("image.png"));
    QTemporaryDir directory;
    QVERIFY(directory.isValid());
    const auto destination = QUrl::fromLocalFile(directory.filePath("image.png"));
    QVERIFY(dialog->setProperty("selectedFile", destination));
    QVERIFY(QMetaObject::invokeMethod(dialog, "accepted"));
    QFile downloaded(destination.toLocalFile());
    QVERIFY(downloaded.open(QIODevice::ReadOnly));
    QCOMPARE(downloaded.readAll(), bytes);
    QCOMPARE(requests.size(), previewRequests);
    if (asset) {
      // One asset lookup and one download. A second resolve would cancel and repeat both.
      QCOMPARE(requests.size(), 2);
      QVERIFY(requests[0].contains("0123456789abcdef0123456789abcdef"));
      for (const auto &request : requests) { QVERIFY(request.contains("Authorization: Bearer image-download-token")); }
    }
    QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
    resolver.clear();
    QVERIFY(!download->isEnabled());
    QVERIFY(rendered->property("source").toUrl().isEmpty());
  }
  // A new image locator keeps the last image on screen until the next image is
  // ready, so a rerun replaces a card preview without a blank frame.
  void imagePreviewHoldsTheLastImage() {
    const auto png = [](QColor color) {
      QImage image(64, 64, QImage::Format_RGB32);
      image.fill(color);
      QByteArray bytes;
      QBuffer buffer(&bytes);
      buffer.open(QIODevice::WriteOnly);
      image.save(&buffer, "PNG");
      return QVariant("data:image/png;base64," + QString::fromLatin1(bytes.toBase64()));
    };
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY(component.isReady());
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", png(Qt::blue)}}));
    QVERIFY(preview);
    QQuickWindow surface;
    surface.resize(400, 300);
    auto item = qobject_cast<QQuickItem *>(preview.get());
    item->setParentItem(surface.contentItem());
    item->setSize(surface.size());
    surface.show();
    auto rendered = preview->findChild<QQuickItem *>("preview-image");
    auto held = preview->findChild<QQuickItem *>("preview-held-image");
    QVERIFY(rendered && held);
    QTRY_COMPARE(rendered->property("status").toInt(), 1);
    QVERIFY(!held->isVisible());
    // The held image shows while the next one loads, then hides.
    QSignalSpy heldShown(held, SIGNAL(visibleChanged()));
    QVERIFY(preview->setProperty("locator", png(Qt::red)));
    QTRY_VERIFY(heldShown.size() >= 2);
    QTRY_COMPARE(rendered->property("status").toInt(), 1);
    QVERIFY(!held->isVisible());
    QVERIFY(held->property("source").toUrl().isEmpty());
  }
  void modalImageViewerInteractionsAndScope() {
    QImage image(80, 40, QImage::Format_RGB32); image.fill(Qt::blue);
    QByteArray bytes; QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    const auto locator = "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
    const QVariantMap first{{"kind", "image"}, {"locator", locator}, {"itemKey", "first"}};
    const QVariantMap repeat{{"kind", "image"}, {"locator", locator}, {"itemKey", "repeat"}};
    const QVariantMap last{{"kind", "image"}, {"locator", locator}, {"itemKey", "last"}};
    const QVariantMap text{{"kind", "text"}, {"text", "Not an image"}, {"itemKey", "caption"}};
    MediaResolver resolver;
    QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaGallery.qml"));
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    std::unique_ptr<QObject> gallery(component.createWithInitialProperties({{"items", QVariantList{first, text, repeat, last}}, {"scopeKey", "workflow:run:output"}}));
    QVERIFY2(gallery, qPrintable(component.errorString()));
    QQuickWindow surface; surface.resize(500, 500);
    auto item = qobject_cast<QQuickItem *>(gallery.get()); QVERIFY(item);
    item->setParentItem(surface.contentItem()); item->setSize(surface.size());
    surface.show(); surface.requestActivate();
    QQuickItem *tile = nullptr;
    QTRY_VERIFY((tile = findItem(item, "gallery-tile-2")));
    tile->forceActiveFocus();
    QTest::keyClick(&surface, Qt::Key_Space);
    auto viewer = gallery->findChild<QQuickWindow *>("image-viewer-window"); QVERIFY(viewer);
    QTRY_VERIFY(viewer->isVisible());
    QCOMPARE(viewer->modality(), Qt::WindowModal);
    QCOMPARE(viewer->transientParent(), &surface);
    QCOMPARE(QQmlEngine::objectOwnership(&surface), QQmlEngine::CppOwnership);
    QCOMPARE(viewer->property("items").toList().size(), 3);
    QCOMPARE(viewer->property("currentIndex").toInt(), 1);
    QCOMPARE(viewer->property("selected").toMap()["itemKey"].toString(), QString("repeat"));
    QQuickItem *preview = nullptr;
    QTRY_VERIFY((preview = findItem(viewer->contentItem(), "image-viewer-preview")));
    auto rendered = findItem(preview, "preview-image"); QVERIFY(rendered);
    QTRY_COMPARE(rendered->property("status").toInt(), 1);
    auto interaction = findItem(preview, "preview-image-interaction"); QVERIFY(interaction);
    const auto center = interaction->mapToScene(QPointF(interaction->width() / 2, interaction->height() / 2)).toPoint();
    QTest::mouseDClick(viewer, Qt::LeftButton, Qt::NoModifier, center);
    QTRY_COMPARE(preview->property("imageZoom").toDouble(), 2.0);
    QTest::mousePress(viewer, Qt::LeftButton, Qt::NoModifier, center);
    QTest::mouseMove(viewer, center + QPoint(30, 20));
    QTest::mouseRelease(viewer, Qt::LeftButton, Qt::NoModifier, center + QPoint(30, 20));
    QVERIFY(preview->property("imagePanX").toDouble() > 0);
    QTest::mouseClick(viewer, Qt::RightButton, Qt::NoModifier, center);
    QCOMPARE(preview->property("imageZoom").toDouble(), 1.0);
    QCOMPARE(preview->property("imagePanX").toDouble(), 0.0);
    QWheelEvent wheel(center, viewer->mapToGlobal(center), {}, {0, 120}, Qt::NoButton, Qt::NoModifier, Qt::NoScrollPhase, false);
    QCoreApplication::sendEvent(viewer, &wheel);
    QVERIFY(preview->property("imageZoom").toDouble() > 1);
    const auto zoom = preview->property("imageZoom");
    const auto source = rendered->property("source");
    auto appended = first; appended["itemKey"] = "appended";
    QVERIFY(gallery->setProperty("items", QVariantList{first, text, repeat, last, appended}));
    QCOMPARE(findItem(viewer->contentItem(), "image-viewer-preview"), preview);
    QCOMPARE(preview->property("imageZoom"), zoom);
    QCOMPARE(rendered->property("source"), source);
    QTest::keyClick(viewer, Qt::Key_Left);
    QCOMPARE(viewer->property("currentIndex").toInt(), 0);
    QCOMPARE(preview->property("imageZoom").toDouble(), 1.0);
    QTest::keyClick(viewer, Qt::Key_Left);
    QCOMPARE(viewer->property("currentIndex").toInt(), 0);
    QTest::keyClick(viewer, Qt::Key_Right);
    QCOMPARE(viewer->property("selected").toMap()["itemKey"].toString(), QString("repeat"));
    QCOMPARE(gallery->property("currentIndex").toInt(), 2);
    QQuickItem *download = nullptr;
    QTRY_VERIFY((download = findItem(preview, "preview-download")) && download->isEnabled());
    auto dialog = preview->findChild<QObject *>("preview-download-dialog"); QVERIFY(dialog);
    QVERIFY(dialog->setProperty("options", int(QFileDialog::DontUseNativeDialog)));
    QTest::mouseClick(viewer, Qt::LeftButton, Qt::NoModifier, download->mapToScene({download->width() / 2, download->height() / 2}).toPoint());
    QTRY_VERIFY(dialog->property("visible").toBool());
    QCOMPARE(qvariant_cast<QWindow *>(dialog->property("parentWindow")), viewer);
    QTemporaryDir directory; QVERIFY(directory.isValid());
    const auto destination = QUrl::fromLocalFile(directory.filePath("exact.png"));
    QVERIFY(dialog->setProperty("selectedFile", destination));
    QVERIFY(QMetaObject::invokeMethod(dialog, "accepted"));
    QFile exported(destination.toLocalFile()); QVERIFY(exported.open(QIODevice::ReadOnly)); QCOMPARE(exported.readAll(), bytes);
    QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
    viewer->requestActivate();
    for (const auto dark : {true, false}) {
      QQmlComponent themeComponent(&engine);
      themeComponent.setData("import QtQml; import NodeTool.UiPrimitives as Ui; QtObject { property var theme: Ui.Theme }", {});
      std::unique_ptr<QObject> holder(themeComponent.create()); QVERIFY(holder);
      auto theme = qvariant_cast<QObject *>(holder->property("theme")); QVERIFY(theme);
      QVERIFY(theme->setProperty("preference", dark ? 2 : 3));
      for (const auto width : {900, 360}) {
        viewer->resize(width, 600); QTest::qWait(30);
        QVERIFY(saveCapture(viewer->grabWindow(), QString("image-viewer-%1-%2.png").arg(width).arg(dark ? "dark" : "light")));
        QVERIFY(QRectF(viewer->contentItem()->boundingRect()).contains(download->mapRectToScene(download->boundingRect())));
      }
    }
    QTest::keyClick(viewer, Qt::Key_Escape);
    QTRY_VERIFY(!viewer->isVisible());
    surface.requestActivate();
    QTRY_VERIFY(surface.isActive());
    QTRY_VERIFY(item->hasActiveFocus());
    // Multi-image selected output keeps the Open action on its image itself.
    auto inlineImage = findItem(item, "preview-image-interaction"); QVERIFY(inlineImage);
    auto inlinePreview = findItem(item, "gallery-selected-media"); QVERIFY(inlinePreview);
    QSignalSpy activated(inlinePreview, SIGNAL(imageActivated()));
    QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier, inlineImage->mapToScene({inlineImage->width()/2, inlineImage->height()/2}).toPoint());
    QTest::mouseDClick(&surface, Qt::LeftButton, Qt::NoModifier, inlineImage->mapToScene({inlineImage->width()/2, inlineImage->height()/2}).toPoint());
    QTRY_COMPARE(activated.size(), 1);
    QTRY_VERIFY(viewer->isVisible());
    QVERIFY(gallery->setProperty("scopeKey", "another-workflow"));
    QTRY_VERIFY(!viewer->isVisible());
    surface.requestActivate(); QTRY_VERIFY(surface.isActive());
    inlineImage->forceActiveFocus(); QTRY_COMPARE(surface.activeFocusItem(), inlineImage);
    QTest::keyClick(&surface, Qt::Key_Return);
    QTRY_VERIFY(viewer->isVisible());
    resolver.configure(QUrl("http://127.0.0.1:9"), "another-account");
    QTRY_VERIFY(!viewer->isVisible());
    surface.requestActivate(); QTRY_VERIFY(surface.isActive());
    inlineImage->forceActiveFocus(); QTRY_COMPARE(surface.activeFocusItem(), inlineImage);
    QTest::keyClick(&surface, Qt::Key_Return);
    QTRY_VERIFY(viewer->isVisible());
    auto closeButton = findItem(viewer->contentItem(), "image-viewer-close"); QVERIFY(closeButton);
    QTest::mouseClick(viewer, Qt::LeftButton, Qt::NoModifier, closeButton->mapToScene({closeButton->width()/2, closeButton->height()/2}).toPoint());
    QTRY_VERIFY(!viewer->isVisible());
    surface.requestActivate(); QTRY_VERIFY(surface.isActive());
    inlineImage->forceActiveFocus(); QTRY_COMPARE(surface.activeFocusItem(), inlineImage);
    QTest::keyClick(&surface, Qt::Key_Return); QTRY_VERIFY(viewer->isVisible());
    viewer->close(); QTRY_VERIFY(!viewer->isVisible());
    surface.requestActivate(); QTRY_VERIFY(surface.isActive());
    inlineImage->forceActiveFocus(); QTRY_COMPARE(surface.activeFocusItem(), inlineImage);
    QTest::keyClick(&surface, Qt::Key_Return); QTRY_VERIFY(viewer->isVisible());
    auto pendingPreview = findItem(viewer->contentItem(), "image-viewer-preview"); QVERIFY(pendingPreview);
    auto pendingDownload = findItem(pendingPreview, "preview-download"); QVERIFY(pendingDownload);
    QTRY_VERIFY(pendingDownload->isEnabled());
    QPointer<QObject> pendingDialog = pendingPreview->findChild<QObject *>("preview-download-dialog"); QVERIFY(pendingDialog);
    QVERIFY(pendingDialog->setProperty("options", int(QFileDialog::DontUseNativeDialog)));
    QTest::mouseClick(viewer, Qt::LeftButton, Qt::NoModifier, pendingDownload->mapToScene({pendingDownload->width()/2, pendingDownload->height()/2}).toPoint());
    QTRY_VERIFY(pendingDialog->property("visible").toBool());
    const auto canceled = QUrl::fromLocalFile(directory.filePath("canceled.png"));
    QVERIFY(pendingDialog->setProperty("selectedFile", canceled));
    QVERIFY(gallery->setProperty("items", QVariantList{first, last}));
    QTRY_VERIFY(!viewer->isVisible());
    QTRY_VERIFY(!pendingDialog || !pendingDialog->property("visible").toBool());
    QVERIFY(!QFile::exists(canceled.toLocalFile()));
  }
  void modalImageViewerCancelsLateReplies() {
    QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
    QList<QPointer<QTcpSocket>> sockets;
    connect(&server, &QTcpServer::newConnection, &server, [&] {
      while (server.hasPendingConnections()) { sockets.append(server.nextPendingConnection()); }
    });
    MediaResolver resolver;
    QSignalSpy resolved(&resolver, &MediaResolver::resolved);
    QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/ImageViewer.qml"));
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    const QVariantMap image{{"kind", "image"}, {"itemKey", "pending"},
      {"locator", QString("http://127.0.0.1:%1/delayed.png").arg(server.serverPort())}};
    std::unique_ptr<QObject> owner(component.createWithInitialProperties({{"items", QVariantList{image}}, {"selected", image}, {"scopeKey", "pending-scope"}}));
    auto viewer = qobject_cast<QQuickWindow *>(owner.get()); QVERIFY2(viewer, qPrintable(component.errorString()));
    viewer->show(); viewer->requestActivate();
    QTRY_VERIFY(!sockets.isEmpty());
    QVERIFY(QMetaObject::invokeMethod(viewer, "dismiss"));
    QTRY_VERIFY(!viewer->isVisible());
    QImage pixels(8, 8, QImage::Format_RGB32); pixels.fill(Qt::green);
    QByteArray bytes; QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(pixels.save(&buffer, "PNG"));
    for (auto socket : sockets) {
      if (socket && socket->state() == QAbstractSocket::ConnectedState) {
        socket->write("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + QByteArray::number(bytes.size()) + "\r\nConnection: close\r\n\r\n" + bytes);
        socket->disconnectFromHost();
      }
    }
    QTest::qWait(50);
    QCOMPARE(resolved.size(), 0);
    QVERIFY(!findItem(viewer->contentItem(), "image-viewer-preview"));
    QVERIFY(viewer->property("items").toList().isEmpty());
  }
  void imageGalleryDownloadActions() {
    QImage image(80, 40, QImage::Format_RGB32);
    image.fill(Qt::blue);
    QByteArray bytes;
    QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    const auto locator = "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
    const QVariantMap first{{"kind", "image"}, {"locator", locator}, {"itemKey", "first"}};
    const QVariantMap second{{"kind", "image"}, {"locator", locator}, {"itemKey", "second"}};
    MediaResolver resolver;
    QQmlEngine engine;
    engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaGallery.qml"));
    QTRY_VERIFY2(component.isReady(), qPrintable(component.errorString()));
    std::unique_ptr<QObject> gallery(component.createWithInitialProperties({{"items", QVariantList{first}}}));
    QVERIFY2(gallery, qPrintable(component.errorString()));
    QQuickWindow surface;
    surface.resize(400, 400);
    auto item = qobject_cast<QQuickItem *>(gallery.get());
    QVERIFY(item);
    item->setParentItem(surface.contentItem());
    item->setSize(surface.size());
    surface.show();
    auto preview = gallery->findChild<QQuickItem *>("gallery-selected-media");
    QVERIFY(preview);
    auto download = preview->findChild<QQuickItem *>("preview-download");
    QVERIFY(download);
    QTRY_VERIFY(download->isVisible() && download->isEnabled());
    auto toolbarDownload = gallery->findChild<QQuickItem *>("gallery-download");
    QVERIFY(toolbarDownload);
    QVERIFY(!toolbarDownload->isVisible());
    QVERIFY(gallery->setProperty("items", QVariantList{first, second}));
    QTRY_VERIFY(toolbarDownload->isVisible());
    QVERIFY(!download->isVisible());
  }
  // Web ContentCardBody.tsx VideoPreview offers Download and "Save to assets" (aria-label
  // "Save video to assets"). The native button uploads the cached bytes through
  // POST /api/assets and reports with the web's strings.
  void videoSaveToAssetsActionLikeTheWeb() {
    QFile fixture(QStringLiteral(MEDIA_VIDEO_FIXTURE));
    QVERIFY(fixture.open(QIODevice::ReadOnly));
    const auto source = "data:video/mp4;base64," + QString::fromLatin1(fixture.readAll().toBase64());
    QByteArray request; int status = 200; QByteArray reply = R"({"id":"0123456789abcdef0123456789abcdef"})"; int posts = 0;
    QTcpServer server; QVERIFY(server.listen(QHostAddress::LocalHost));
    connect(&server, &QTcpServer::newConnection, this, [&] {
      auto socket = server.nextPendingConnection();
      connect(socket, &QTcpSocket::readyRead, socket, [&, socket] {
        request += socket->readAll();
        const auto split = request.indexOf("\r\n\r\n");
        if (split < 0) { return; }
        const auto header = request.left(split); const auto at = header.toLower().indexOf("content-length:");
        if (at < 0 || request.size() - split - 4 < header.mid(at + 15).split('\r').first().trimmed().toInt()) { return; }
        ++posts;
        socket->write("HTTP/1.1 " + QByteArray::number(status) + " Result\r\nContent-Type: application/json\r\nContent-Length: " + QByteArray::number(reply.size()) + "\r\nConnection: close\r\n\r\n" + reply);
        socket->disconnectFromHost();
      });
      connect(socket, &QTcpSocket::disconnected, socket, &QObject::deleteLater);
    });
    MediaResolver resolver; resolver.configure(QUrl(QString("http://127.0.0.1:%1").arg(server.serverPort())), "save-account");
    QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY2(component.isReady(), qPrintable(component.errorString()));
    QQuickWindow surface; surface.resize(900, 400);
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "video"}, {"locator", QVariantMap{{"uri", source}, {"name", "Take one"}}}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    auto item = qobject_cast<QQuickItem *>(preview.get()); QVERIFY(item);
    item->setParentItem(surface.contentItem()); item->setSize(surface.size()); surface.show();
    auto save = preview->findChild<QQuickItem *>("preview-save-assets");
    QVERIFY2(save, "A video preview must offer Save to assets");
    QCOMPARE(save->property("accessibleName").toString(), QString("Save video to assets"));
    QTRY_VERIFY_WITH_TIMEOUT(save->isVisible() && save->isEnabled(), 15000);
    const auto press = [&] { QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier, save->mapToScene(QPointF(save->width() / 2, save->height() / 2)).toPoint()); };
    press();
    QTRY_VERIFY_WITH_TIMEOUT(findItem(item, "1 file added to assets", true), 10000);
    QCOMPARE(posts, 1);
    QVERIFY(request.startsWith("POST /api/assets"));
    QVERIFY(request.contains("Authorization: Bearer save-account"));
    QVERIFY(request.contains("\"name\":\"Take one.mp4\""));
    QVERIFY(request.contains("\"content_type\":\"video/mp4\""));
    request.clear(); status = 500; reply = "{}";
    press();
    QTRY_VERIFY_WITH_TIMEOUT(findItem(item, "Failed to add video to assets", true), 10000);
    QVERIFY(!findItem(item, "1 file added to assets", true));
    // Web offers Save to assets on the video card only, not on images or audio.
    QVERIFY(preview->setProperty("mediaKind", "image"));
    QTRY_VERIFY(!save->isVisible());
    QVERIFY(preview->setProperty("mediaKind", "audio"));
    QTRY_VERIFY(!save->isVisible());
  }
  // Web ImageView and AssetViewer expose Copy for images; desktop copies the pixels.
  void imageCopyActionPutsPixelsOnTheClipboard() {
    QImage image(80, 40, QImage::Format_RGB32); image.fill(Qt::blue);
    QByteArray bytes; QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    MediaResolver resolver; QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY2(component.isReady(), qPrintable(component.errorString()));
    QQuickWindow surface; surface.resize(400, 300);
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", "data:image/png;base64," + QString::fromLatin1(bytes.toBase64())}, {"showDownload", true}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    auto item = qobject_cast<QQuickItem *>(preview.get()); QVERIFY(item);
    item->setParentItem(surface.contentItem()); item->setSize(surface.size()); surface.show();
    auto copy = preview->findChild<QQuickItem *>("preview-copy");
    QVERIFY2(copy, "An image preview with actions must offer Copy");
    QCOMPARE(copy->property("accessibleName").toString(), QString("Copy image"));
    QTRY_VERIFY(copy->isVisible() && copy->isEnabled());
    QGuiApplication::clipboard()->clear();
    QTest::mouseClick(&surface, Qt::LeftButton, Qt::NoModifier, copy->mapToScene(QPointF(copy->width() / 2, copy->height() / 2)).toPoint());
    QTRY_VERIFY(findItem(item, "Copied!", true));
    const auto copied = QGuiApplication::clipboard()->image();
    QCOMPARE(copied.size(), QSize(80, 40));
    QCOMPARE(copied.pixelColor(10, 10), QColor(Qt::blue));
    // Without actions (grid tiles) or after the lease is released there is nothing to copy.
    QVERIFY(preview->setProperty("showDownload", false));
    QTRY_VERIFY(!copy->isVisible());
    QVERIFY(preview->setProperty("showDownload", true));
    resolver.clear();
    QTRY_VERIFY(!copy->isEnabled());
  }
  // The save dialog names the file after the media. Typing a bare name must keep its extension.
  void downloadDialogKeepsTheMediaExtension() {
    QImage image(80, 40, QImage::Format_RGB32); image.fill(Qt::blue);
    QByteArray bytes; QBuffer buffer(&bytes); QVERIFY(buffer.open(QIODevice::WriteOnly)); QVERIFY(image.save(&buffer, "PNG"));
    MediaResolver resolver; QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/MediaPreview.qml"));
    QTRY_VERIFY2(component.isReady(), qPrintable(component.errorString()));
    std::unique_ptr<QObject> preview(component.createWithInitialProperties({{"mediaKind", "image"}, {"locator", "data:image/png;base64," + QString::fromLatin1(bytes.toBase64())}, {"showDownload", true}}));
    QVERIFY2(preview, qPrintable(component.errorString()));
    QQuickWindow surface; surface.resize(400, 300);
    auto item = qobject_cast<QQuickItem *>(preview.get()); QVERIFY(item);
    item->setParentItem(surface.contentItem()); item->setSize(surface.size()); surface.show();
    auto dialog = preview->findChild<QObject *>("preview-download-dialog"); QVERIFY(dialog);
    QVERIFY(dialog->setProperty("options", int(QFileDialog::DontUseNativeDialog)));
    QTRY_VERIFY(!preview->property("resolvedSource").toUrl().isEmpty());
    QVERIFY(QMetaObject::invokeMethod(preview.get(), "download"));
    QTRY_VERIFY(dialog->property("visible").toBool());
    QCOMPARE(dialog->property("defaultSuffix").toString(), QString("png"));
    QVERIFY(QMetaObject::invokeMethod(dialog, "close"));
  }
  // Web AssetViewer: Copy, Download and "Compare with another image" (two or more images).
  void modalImageViewerCompareMode() {
    const auto uri = [](const QColor &color) {
      QImage image(80, 40, QImage::Format_RGB32); image.fill(color);
      QByteArray bytes; QBuffer buffer(&bytes); buffer.open(QIODevice::WriteOnly); image.save(&buffer, "PNG");
      return "data:image/png;base64," + QString::fromLatin1(bytes.toBase64());
    };
    const QVariantList items{QVariantMap{{"kind", "image"}, {"locator", uri(Qt::red)}, {"itemKey", "red"}, {"filename", "red.png"}},
                             QVariantMap{{"kind", "image"}, {"locator", uri(Qt::green)}, {"itemKey", "green"}, {"filename", "green.png"}},
                             QVariantMap{{"kind", "image"}, {"locator", uri(Qt::blue)}, {"itemKey", "blue"}, {"filename", "blue.png"}}};
    MediaResolver resolver; QQmlEngine engine; engine.rootContext()->setContextProperty("mediaResolver", &resolver);
    QQmlComponent component(&engine, QUrl("qrc:/editor/ImageViewer.qml"));
    QVERIFY2(component.isReady(), qPrintable(component.errorString()));
    std::unique_ptr<QObject> object(component.createWithInitialProperties({{"scopeKey", "compare"}}));
    auto viewer = qobject_cast<QQuickWindow *>(object.get()); QVERIFY2(viewer, qPrintable(component.errorString()));
    QVERIFY(QMetaObject::invokeMethod(viewer, "openAt", Q_ARG(QVariant, items), Q_ARG(QVariant, 0), Q_ARG(QVariant, QVariant::fromValue<QObject *>(nullptr))));
    QTRY_VERIFY(viewer->isVisible());
    auto root = viewer->contentItem();
    const auto click = [&](const QString &name) {
      QQuickItem *control = nullptr; QTRY_VERIFY_WITH_TIMEOUT((control = findItem(root, name)) && control->isEnabled(), 5000);
      QTest::mouseClick(viewer, Qt::LeftButton, Qt::NoModifier, control->mapToScene(QPointF(control->width() / 2, control->height() / 2)).toPoint());
    };
    QTRY_VERIFY(findItem(root, "preview-copy"));
    QTRY_VERIFY(findItem(root, "preview-download"));
    QVERIFY(!findItem(root, "preview-save-assets"));
    QVERIFY(!findItem(root, "image-viewer-compare-pick"));
    click("image-viewer-compare");
    QTRY_VERIFY(findItem(root, "Select another image to compare", true));
    auto pick = findItem(root, "image-viewer-compare-pick"); QVERIFY(pick);
    QVERIFY2(!pick->isEnabled(), "The first image cannot be compared with itself");
    click("image-viewer-next");
    QTRY_COMPARE(findItem(root, "image-viewer-position")->property("text").toString(), QString("2 / 3"));
    click("image-viewer-compare-pick");
    QQuickItem *comparison = nullptr;
    QTRY_VERIFY((comparison = findItem(root, "output-comparison")));
    const auto pair = comparison->property("comparison").toMap();
    QCOMPARE(pair.value("label_a").toString(), QString("red.png"));
    QCOMPARE(pair.value("label_b").toString(), QString("green.png"));
    QCOMPARE(pair.value("image_a").toMap().value("uri").toString(), uri(Qt::red));
    QCOMPARE(pair.value("image_b").toMap().value("uri").toString(), uri(Qt::green));
    QVERIFY(!findItem(root, "preview-image"));
    click("image-viewer-compare-exit");
    QTRY_VERIFY(!findItem(root, "output-comparison"));
    QTRY_VERIFY(findItem(root, "Select another image to compare", true));
    click("image-viewer-compare-cancel");
    QTRY_VERIFY(!findItem(root, "Select another image to compare", true));
    QTRY_VERIFY(findItem(root, "image-viewer-compare"));
    QVERIFY(QMetaObject::invokeMethod(viewer, "dismiss"));
    QVERIFY(QMetaObject::invokeMethod(viewer, "openAt", Q_ARG(QVariant, QVariantList{items.first()}), Q_ARG(QVariant, 0), Q_ARG(QVariant, QVariant::fromValue<QObject *>(nullptr))));
    QTRY_VERIFY(viewer->isVisible());
    QVERIFY2(!findItem(root, "image-viewer-compare"), "A single image has nothing to compare");
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
