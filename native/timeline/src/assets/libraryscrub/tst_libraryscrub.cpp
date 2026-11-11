// The Library hover scrub (issue #7092), through real pointer and key events on a mounted tile.
#include "LibraryScrub.h"
#include "LibraryScrubSource.h"
#include "SourceViewerState.h"
#include "assets/AssetBrowser.h"
#include "app/Preferences/PreferencesSettings.h"
#include "../../../tests/TestHttpServer.h"
#include <QElapsedTimer>
#include <QFile>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QTemporaryDir>
#include <QtTest>
#include <algorithm>
#include <memory>

namespace {
QQuickItem* itemNamed(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = itemNamed(child, name)) { return found; }
    }
    return nullptr;
}
const QString kClip = QStringLiteral(NT_FIXTURES_DIR "/media/numbered-a-1080p30.mp4");
const char* kTile = R"(import QtQuick
import NodeTool.Timeline
Item {
    id: root
    width: 400; height: 200
    property alias tile: tile
    property int unhandled: 0
    property alias field: field
    AssetBrowser { id: library }
    AssetItem {
        id: tile
        objectName: "tile"
        width: 84; height: 84
        browser: library
        asset: ({id: "clip", name: "take.mp4", content_type: "video/mp4", duration: 10})
    }
    AssetItem {
        id: still
        x: 100
        width: 84; height: 84
        browser: library
        asset: ({id: "still", name: "photo.png", content_type: "image/png", duration: 0})
    }
    TextInput { id: field; objectName: "field"; x: 200; y: 20; width: 100; height: 20 }
    Item { focus: true; objectName: "keys"; Keys.onPressed: event => { root.unhandled++ } }
})";
}

class TestLibraryScrub : public QObject {
    Q_OBJECT
    QTemporaryDir preferences;
    QTemporaryDir thumbnailCache;
    QQmlEngine engine;
    std::unique_ptr<QQuickWindow> window;
    std::unique_ptr<QObject> object;
    QQuickItem* root = nullptr;
    QQuickItem* tile = nullptr;
    LibraryScrub* scrub = nullptr;
    SourceViewerState* source = nullptr;

    void mount() {
        QQmlComponent component(&engine);
        component.setData(kTile, QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        window = std::make_unique<QQuickWindow>();
        window->resize(400, 200);
        object.reset(component.create());
        QVERIFY2(object, qPrintable(component.errorString()));
        root = qobject_cast<QQuickItem*>(object.get());
        root->setParentItem(window->contentItem());
        tile = itemNamed(root, "tile");
        QVERIFY(tile);
        scrub = engine.singletonInstance<LibraryScrub*>("NodeTool.Timeline", "LibraryScrub");
        QVERIFY(scrub);
        source = engine.singletonInstance<SourceViewerState*>("NodeTool.Timeline", "SourceViewerState");
        QVERIFY(source);
        scrub->setEnabled(true);
        scrub->setDwellMsForTesting(0);
        scrub->setResolverForTesting([](const QVariantMap&) { return kClip; });
        scrub->clear();
        window->show();
        QVERIFY(QTest::qWaitForWindowExposed(window.get()));
        // Showing delivers a hover at the cursor's last place. Park the pointer away from the tile first.
        QTest::mouseMove(window.get(), QPoint(350, 180));
        QTest::qWait(30);
        scrub->clear();
        nt::ui::MediaPreviewCache::instance().waitForIdle();
    }
    void pointAt(double fraction, int y = 40) { QTest::mouseMove(window.get(), QPoint(int(fraction * 83) + 0, y)); }
    // Twenty-four flat frames, each a colour of its own, so a drawn tile names the frame it shows.
    static std::shared_ptr<const nt::ui::ThumbnailSet> flatFrames() {
        std::vector<nt::ui::Thumbnail> thumbs;
        for (int i = 0; i < 24; ++i) {
            QImage image(160, 90, QImage::Format_RGB32);
            image.fill(QColor::fromHsv(i * 15, 255, 255));
            thumbs.push_back({i * 0.4, image});
        }
        return nt::ui::makeThumbnailSet(std::move(thumbs));
    }
    static int hueOf(const QImage& image, QPoint at) { return (QColor(image.pixel(at)).hsvHue() + 7) % 360 / 15; }
private slots:
    void initTestCase() {
        QVERIFY(preferences.isValid() && thumbnailCache.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", preferences.filePath("preferences.ini").toUtf8());
        nt::ui::MediaPreviewCache::instance().setThumbnailCacheDirectoryForTesting(thumbnailCache.path());
    }
    void init() {
        nt::ui::MediaPreviewCache::instance().clear();
        mount();
    }
    void cleanup() {
        if (scrub) { scrub->setEnabled(true); scrub->setResolverForTesting({}); scrub->setFramesForTesting(nullptr); scrub->clear(); }
        if (source) {
            for (const char* id : {"clip", "other", "shown"}) {
                source->setAsset({{"id", id}, {"content_type", "video/mp4"}});
                source->clearMarks();
            }
            source->setAsset({});
        }
        object.reset();
        window.reset();
        scrub = nullptr;
        source = nullptr;
    }

    void framesChangeOverATileAndResetOnLeave() {
        QVERIFY(!itemNamed(tile, "libraryScrubPlayhead"));
        QVERIFY(scrub->hoveredId().isEmpty());
        pointAt(0);
        QTRY_COMPARE(scrub->hoveredId(), QString("clip"));
        QTRY_VERIFY(scrub->frameReady());
        QCOMPARE(scrub->frameIndex(), 0);
        auto* playhead = itemNamed(tile, "libraryScrubPlayhead");
        QVERIFY(playhead && playhead->isVisible());
        const auto frames = scrub->frames();
        QVERIFY(frames && frames->thumbs.size() == 24);
        QTRY_VERIFY(itemNamed(tile, "libraryScrubFrame") && itemNamed(tile, "libraryScrubFrame")->isVisible());
        pointAt(0.5);
        QVERIFY(scrub->frameIndex() >= 11 && scrub->frameIndex() <= 12);
        QCOMPARE(scrub->timeMs(), scrub->fraction() * 10000.0);
        pointAt(1.0);
        QCOMPARE(scrub->frameIndex(), 23);
        QVERIFY(playhead->x() > tile->width() - playhead->width() - 3);
        QCOMPARE(nt::ui::MediaPreviewCache::instance().guiThreadDecodes(), 0);
        // NT_SCRUB_SHOT: a directory to keep a magnified grab of the tile under the pointer.
        if (const auto directory = qEnvironmentVariable("NT_SCRUB_SHOT"); !directory.isEmpty()) {
            QTest::qWait(50);
            window->grabWindow().copy(0, 0, 100, 100).scaled(400, 400, Qt::KeepAspectRatio, Qt::FastTransformation)
                .save(directory + "/scrub-tile.png");
        }
        // Leaving resets the tile.
        QTest::mouseMove(window.get(), QPoint(300, 150));
        QTRY_VERIFY(scrub->hoveredId().isEmpty());
        QVERIFY(!scrub->frameReady());
        QTRY_VERIFY(!itemNamed(tile, "libraryScrubPlayhead"));
        QVERIFY(!itemNamed(tile, "libraryScrubFrame"));
    }
    void theTileDrawsTheFrameThePointerNames() {
        scrub->setFramesForTesting(flatFrames());
        // Off the caption below and off the playhead at every position tried.
        const QPoint centre(60, 20);
        for (const int index : {0, 5, 12, 23}) {
            pointAt(index / 23.0);
            QTRY_COMPARE(scrub->frameIndex(), index);
            QTRY_VERIFY(itemNamed(tile, "libraryScrubFrame") && itemNamed(tile, "libraryScrubFrame")->isVisible());
            QTRY_COMPARE_WITH_TIMEOUT(hueOf(window->grabWindow(), centre), index, 2000);
        }
        // Back on the first position, the first frame again, and off the tile no frame is drawn.
        pointAt(0);
        QTRY_COMPARE_WITH_TIMEOUT(hueOf(window->grabWindow(), centre), 0, 2000);
        QTest::mouseMove(window.get(), QPoint(350, 180));
        QTRY_VERIFY(!itemNamed(tile, "libraryScrubFrame"));
    }
    void imagesAndFoldersDoNotScrub() {
        QTest::mouseMove(window.get(), QPoint(140, 40));
        QTest::qWait(50);
        QVERIFY(scrub->hoveredId().isEmpty());
    }
    void shiftHTurnsTheScrubOffAndOn() {
        pointAt(0.5);
        QTRY_VERIFY(scrub->frameReady());
        QTest::keyClick(window.get(), Qt::Key_H, Qt::ShiftModifier);
        QVERIFY(!scrub->enabled());
        QVERIFY(!scrub->frameReady());
        QTRY_VERIFY(!itemNamed(tile, "libraryScrubPlayhead"));
        QCOMPARE(nt::app::openTimelinePreferences()->value("library/hoverScrub").toBool(), false);
        pointAt(0.25);
        QTest::qWait(50);
        QVERIFY(!scrub->frameReady());
        QTest::keyClick(window.get(), Qt::Key_H, Qt::ShiftModifier);
        QVERIFY(scrub->enabled());
        QTRY_VERIFY(scrub->frameReady());
        QCOMPARE(nt::app::openTimelinePreferences()->value("library/hoverScrub").toBool(), true);
    }
    void iAndOMarkTheHoveredClipInSource() {
        QVERIFY(source->asset().isEmpty());
        pointAt(0.5);
        QTRY_VERIFY(scrub->hasTime());
        const double halfway = scrub->timeMs();
        QVERIFY(halfway > 4000 && halfway < 6000);
        QTest::keyClick(window.get(), Qt::Key_I);
        QCOMPARE(source->savedMarks("clip").value("inMs").toDouble(), halfway);
        pointAt(1.0);
        const double end = scrub->timeMs();
        QTest::keyClick(window.get(), Qt::Key_O);
        QCOMPARE(source->savedMarks("clip").value("outMs").toDouble(), end);
        QCOMPARE(source->savedMarks("clip").value("inMs").toDouble(), halfway);
        // The marks belong to the hovered clip. Source still shows nothing, and the keys did not reach the editor.
        QVERIFY(source->asset().isEmpty());
        QCOMPARE(root->property("unhandled").toInt(), 0);
        // An Out before the In clears the In.
        pointAt(0.0);
        QTest::keyClick(window.get(), Qt::Key_O);
        QVERIFY(!source->savedMarks("clip").contains("inMs"));
    }
    void keysOutsideATileAreLeftAlone() {
        QTest::mouseMove(window.get(), QPoint(300, 150));
        QTest::keyClick(window.get(), Qt::Key_I);
        QCOMPARE(root->property("unhandled").toInt(), 1);
        QVERIFY(source->savedMarks("clip").isEmpty());
        // Typing in a field wins over the hovered tile.
        pointAt(0.5);
        QTRY_VERIFY(scrub->hasTime());
        auto* field = root->property("field").value<QQuickItem*>();
        field->forceActiveFocus();
        QTest::keyClick(window.get(), Qt::Key_I);
        QCOMPARE(field->property("text").toString(), QString("i"));
        QVERIFY(source->savedMarks("clip").isEmpty());
        // Disabled, the keys go to the editor.
        field->setFocus(false);
        scrub->setEnabled(false);
        root->findChild<QQuickItem*>("keys")->forceActiveFocus();
        QTest::keyClick(window.get(), Qt::Key_I);
        QVERIFY(source->savedMarks("clip").isEmpty());
        QCOMPARE(root->property("unhandled").toInt(), 2);
    }
    void pressOpensTheClipInSourceAtTheHoveredTime() {
        pointAt(0.5);
        QTRY_VERIFY(scrub->hasTime());
        const double halfway = scrub->timeMs();
        QTest::mouseClick(window.get(), Qt::LeftButton, {}, QPoint(int(0.5 * 83), 40));
        QCOMPARE(source->asset().value("id").toString(), QString("clip"));
        QCOMPARE(source->cueMs(), halfway);
    }
    void passingOverTilesCostsNothing() {
        auto& cache = nt::ui::MediaPreviewCache::instance();
        scrub->setDwellMsForTesting(150);
        const int before = cache.decodeCount();
        for (int i = 0; i < 20; ++i) {
            QVariantMap asset{{"id", QString("pass%1").arg(i)}, {"content_type", "video/mp4"}, {"duration", 5}};
            scrub->hover(asset, 0.5);
            QTest::qWait(5);
        }
        scrub->clear();
        QTest::qWait(300);
        QCOMPARE(cache.decodeCount(), before);
        QCOMPARE(scrub->fetchCount(), 0);
        // A rest on one clip decodes it once, off the GUI thread.
        scrub->hover({{"id", "rest"}, {"content_type", "video/mp4"}, {"duration", 5}}, 0.5);
        QTRY_VERIFY_WITH_TIMEOUT(scrub->frameReady(), 10000);
        QCOMPARE(cache.decodeCount(), before + 1);
        QCOMPARE(cache.guiThreadDecodes(), 0);
    }
    void scrollingALargeLibraryStaysFast() {
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
Item {
    id: root
    width: 400; height: 480
    property alias view: view
    AssetBrowser { id: library }
    GridView {
        id: view
        anchors.fill: parent
        cellWidth: 84; cellHeight: 84
        model: 500
        onContentYChanged: LibraryScrub.clear()
        delegate: AssetItem {
            required property int index
            width: 80; height: 80
            browser: library
            asset: ({id: "a" + index, name: "take" + index + ".mp4", content_type: index % 2 ? "video/mp4" : "image/png", duration: 10})
        }
    }
})", QUrl());
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> list(component.create());
        QVERIFY(list);
        auto* view = qobject_cast<QQuickItem*>(list.get());
        view->setParentItem(window->contentItem());
        view->setZ(10);
        window->resize(400, 480);
        QTest::qWait(50);
        auto& cache = nt::ui::MediaPreviewCache::instance();
        const int before = cache.decodeCount();
        // The real dwell: mount's zero would let a rest on a tile decode before the first scroll step arrives.
        scrub->setDwellMsForTesting(150);
        // The pointer rests over a video tile while the list scrolls under it.
        QTest::mouseMove(window.get(), QPoint(100, 100));
        QTest::qWait(30);
        auto* grid = view->property("view").value<QQuickItem*>();
        QList<qint64> steps;
        for (int i = 0; i < 40; ++i) {
            QCoreApplication::processEvents();
            QElapsedTimer timer;
            timer.start();
            grid->setProperty("contentY", i * 60.0);
            window->grabWindow();
            steps.append(timer.nsecsElapsed() / 1000);
        }
        std::sort(steps.begin(), steps.end());
        qInfo() << "median scroll step (us):" << steps[steps.size() / 2] << "worst:" << steps.last();
        QVERIFY2(steps[steps.size() / 2] < 16000, "a scroll step must fit one 60 Hz frame");
        QVERIFY(scrub->hoveredId().isEmpty());
        QCOMPARE(cache.decodeCount(), before);
        QCOMPARE(scrub->fetchCount(), 0);
        QVERIFY(!itemNamed(view, "libraryScrubFrame"));
    }
    void marksOfAnotherAssetDoNotChangeSource() {
        const QVariantMap shown{{"id", "shown"}, {"content_type", "video/mp4"}, {"duration", 10}};
        const QVariantMap other{{"id", "other"}, {"content_type", "video/mp4"}, {"duration", 10}};
        source->setAsset(shown);
        QVERIFY(source->markAsset(other, "in", 4000));
        QVERIFY(source->markAsset(other, "out", 9000));
        QCOMPARE(source->savedMarks("other").value("inMs").toDouble(), 4000.0);
        QCOMPARE(source->savedMarks("other").value("outMs").toDouble(), 9000.0);
        QCOMPARE(source->asset().value("id").toString(), QString("shown"));
        QVERIFY(!source->hasMarks());
        // Out cannot precede In, and a time past the end is held at the end.
        QVERIFY(source->markAsset(other, "in", 9500));
        QVERIFY(!source->savedMarks("other").contains("outMs"));
        QVERIFY(source->markAsset(other, "out", 99000));
        QCOMPARE(source->savedMarks("other").value("outMs").toDouble(), 10000.0);
        // Opening the asset later shows them.
        source->setAsset(other);
        QCOMPARE(source->inMs(), 9500.0);
        QCOMPARE(source->outMs(), 10000.0);
        // Not a video, no id, no number.
        QVERIFY(!source->markAsset({{"id", "p"}, {"content_type", "image/png"}}, "in", 1));
        QVERIFY(!source->markAsset({{"content_type", "video/mp4"}}, "in", 1));
        QVERIFY(!source->markAsset(other, "in", std::nan("")));
        QVERIFY(!source->markAsset(other, "middle", 1));
        source->setAsset({});
    }
    void fetchesTheProxyBeforeTheOriginal() {
        QFile file(kClip);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QByteArray bytes = file.readAll();
        TestHttpServer http;
        QVERIFY(http.base().port() != 7777);
        http.setFile("/original.mp4", ServedFile{bytes});
        http.setFile("/proxy.mp4", ServedFile{bytes});
        QTemporaryDir cache;
        QVERIFY(cache.isValid());
        nt::server::ServerClient client(http.base());
        const QJsonObject withProxy{{"id", "video"}, {"get_url", "/original.mp4"}, {"size", bytes.size()},
            {"content_type", "video/mp4"}, {"proxy_status", "ready"}, {"proxy_url", "/proxy.mp4?v=p1"}};
        const auto proxy = nt::assets::fetchScrubSource(client, cache.path(), withProxy);
        QVERIFY(proxy.ok());
        QVERIFY(proxy.path.contains("/proxy/"));
        QVERIFY(QFileInfo::exists(proxy.path));
        QCOMPARE(http.countRequests("GET", "/original.mp4"), 0);
        // A second ask is a cache hit.
        http.clearRequests();
        QCOMPARE(nt::assets::fetchScrubSource(client, cache.path(), withProxy).path, proxy.path);
        QCOMPARE(http.countRequests("GET", "/proxy.mp4"), 0);
        // Without a proxy the original comes.
        const QJsonObject plain{{"id", "plain"}, {"get_url", "/original.mp4"}, {"size", bytes.size()}, {"content_type", "video/mp4"}};
        const auto original = nt::assets::fetchScrubSource(client, cache.path(), plain);
        QVERIFY(original.ok());
        QVERIFY(original.path.contains("/original/"));
        // An asset with no file, and a stop request, fetch nothing.
        QVERIFY(!nt::assets::fetchScrubSource(client, cache.path(), {{"id", "folder"}, {"content_type", "folder"}}).ok());
        QVERIFY(!nt::assets::fetchScrubSource(client, cache.path(), plain, [] { return true; }).ok());
    }
};

QTEST_MAIN(TestLibraryScrub)
#include "tst_libraryscrub.moc"
