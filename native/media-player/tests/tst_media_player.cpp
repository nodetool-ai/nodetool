// NodeTool.MediaPlayer: the controls of the shared player, with no media.
#include <QQuickItem>
#include <QQuickView>
#include <QtQml/QQmlExtensionPlugin>
#include <QtTest>
#include <memory>

Q_IMPORT_QML_PLUGIN(NodeTool_MediaPlayerPlugin)

namespace {
QQuickItem *named(QQuickItem *root, const QString &name) {
  if (root->objectName() == name) { return root; }
  for (auto *child : root->childItems()) {
    if (auto *found = named(child, name)) { return found; }
  }
  return nullptr;
}

std::unique_ptr<QQuickView> player(const QString &kind, bool compact) {
  auto view = std::make_unique<QQuickView>();
  view->setInitialProperties({{"kind", kind}, {"compact", compact}, {"label", "clip.mp4"}});
  view->loadFromModule("NodeTool.MediaPlayer", "MediaPlayer");
  view->setResizeMode(QQuickView::SizeRootObjectToView);
  view->resize(240, 168);
  view->show();
  return view;
}
}  // namespace

class TestMediaPlayer : public QObject {
  Q_OBJECT
private slots:
  void videoShowsThePictureAndTheControls() {
    auto view = player("video", true);
    auto *root = view->rootObject();
    QVERIFY2(root, "MediaPlayer did not load");
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    auto *video = named(root, "mediaPlayerVideo");
    QVERIFY(video && video->isVisible());
    QTRY_VERIFY(video->height() > 0);
    QVERIFY(named(root, "mediaPlayerPlay")->isVisible());
    QVERIFY(!named(root, "mediaPlayerPlayButton")->isVisible());
    QVERIFY(named(root, "mediaPlayerSeek")->isVisible());
    QVERIFY(named(root, "mediaPlayerMute")->isVisible());
    QCOMPARE(named(root, "mediaPlayerTime")->property("text").toString(), QStringLiteral("0:00"));
    // The controls fit the narrow panel.
    auto *mute = named(root, "mediaPlayerMute");
    QVERIFY(mute->mapToScene({mute->width(), 0}).x() <= root->width() + 0.5);
  }

  void audioHasNoPicture() {
    auto view = player("audio", false);
    auto *root = view->rootObject();
    QVERIFY2(root, "MediaPlayer did not load");
    QVERIFY(QTest::qWaitForWindowExposed(view.get()));
    QVERIFY(!named(root, "mediaPlayerVideo")->isVisible());
    QVERIFY(named(root, "mediaPlayerPlayButton")->isVisible());
    QCOMPARE(named(root, "mediaPlayerTime")->property("text").toString(), QStringLiteral("0:00 / 0:00"));
  }

  void muteToggles() {
    auto view = player("audio", true);
    auto *root = view->rootObject();
    QVERIFY2(root, "MediaPlayer did not load");
    QVERIFY(!root->property("muted").toBool());
    QMetaObject::invokeMethod(root, "toggleMute");
    QVERIFY(root->property("muted").toBool());
    QCOMPARE(named(root, "mediaPlayerMute")->property("accessibleName").toString(), QStringLiteral("Unmute"));
  }
};

QTEST_MAIN(TestMediaPlayer)
#include "tst_media_player.moc"
