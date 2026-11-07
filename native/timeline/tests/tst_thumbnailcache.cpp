#include "ui/MediaPreviews.h"
#include "ui/ThumbnailDiskCache.h"

#include <QDataStream>
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QProcess>
#include <QTemporaryDir>
#include <QTest>

using namespace nt::ui;

namespace {
std::shared_ptr<const ThumbnailSet> sampleAtlas() {
    QImage first(16, 8, QImage::Format_ARGB32);
    first.fill(QColor(240, 30, 10, 128));
    QImage second(16, 8, QImage::Format_ARGB32);
    second.fill(Qt::blue);
    return makeThumbnailSet({{0, first}, {2.5, second}});
}
}

class TestThumbnailCache : public QObject {
    Q_OBJECT
private slots:
    void init() { MediaPreviewCache::instance().setThumbnailCacheDirectoryForTesting({}); }
    void cleanup() { MediaPreviewCache::instance().setThumbnailCacheDirectoryForTesting({}); }

    void atlasRoundTrip() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        ThumbnailDiskCache cache(directory.path());
        const auto expected = sampleAtlas();
        cache.store("video-version", *expected);
        const auto actual = cache.load("video-version");
        QVERIFY(actual);
        QCOMPARE(actual->atlas, expected->atlas);
        QCOMPARE(actual->thumbSize, expected->thumbSize);
        QCOMPARE(actual->thumbs.size(), expected->thumbs.size());
        for (size_t i = 0; i < actual->thumbs.size(); ++i) {
            QCOMPARE(actual->thumbs[i].timeSec, expected->thumbs[i].timeSec);
            QCOMPARE(actual->thumbs[i].image, expected->atlas.copy(static_cast<int>(i) * 16, 0, 16, 8));
        }
        QVERIFY(!cache.load("different-version"));
    }

    void reusesThumbnailsFromAnotherProcess() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const QString media = directory.filePath("image.png");
        QImage image(64, 32, QImage::Format_ARGB32);
        image.fill(QColor(200, 30, 20, 128));
        QVERIFY(image.save(media));
        const QString cacheDirectory = directory.filePath("cache");
        QProcess child;
        child.start(QCoreApplication::applicationFilePath(), {"--populate", cacheDirectory, media});
        QVERIFY(child.waitForFinished(10000));
        QCOMPARE(child.exitCode(), 0);

        auto& cache = MediaPreviewCache::instance();
        cache.setThumbnailCacheDirectoryForTesting(cacheDirectory);
        const int hits = cache.thumbnailDiskHits();
        QObject subscriber;
        QVERIFY(!cache.thumbnails(media, "image", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        QCOMPARE(cache.thumbnailDiskHits(), hits + 1);
        const auto result = cache.thumbnails(media, "image", &subscriber);
        QVERIFY(result);
        QCOMPARE(result->thumbs.front().image.pixelColor(0, 0), image.pixelColor(0, 0));
        QVERIFY(ThumbnailDiskCache::keyForMedia(media, "image") != ThumbnailDiskCache::keyForMedia(media, "video"));

        const QString oldKey = ThumbnailDiskCache::keyForMedia(media, "image");
        image.fill(Qt::green);
        QVERIFY(image.save(media));
        QFile file(media);
        QVERIFY(file.open(QIODevice::ReadWrite));
        QVERIFY(file.setFileTime(QDateTime::currentDateTimeUtc().addSecs(5), QFileDevice::FileModificationTime));
        file.close();
        QVERIFY(oldKey != ThumbnailDiskCache::keyForMedia(media, "image"));
        cache.clear();
        QVERIFY(!cache.thumbnails(media, "image", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        QCOMPARE(cache.thumbnailDiskHits(), hits + 1);
        const auto replaced = cache.thumbnails(media, "image", &subscriber);
        QVERIFY(replaced);
        QCOMPARE(replaced->thumbs.front().image.pixelColor(0, 0), QColor(Qt::green));

        cache.clear();
        const auto entries = QDir(cacheDirectory).entryInfoList({"*.ntthumb"}, QDir::Files);
        QVERIFY(!entries.empty());
        for (const auto& entry : entries) {
            QFile corrupt(entry.absoluteFilePath());
            QVERIFY(corrupt.open(QIODevice::WriteOnly | QIODevice::Truncate));
            QCOMPARE(corrupt.write("broken"), qint64(6));
        }
        QVERIFY(!cache.thumbnails(media, "image", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        QCOMPARE(cache.thumbnailDiskHits(), hits + 1);
        QVERIFY(cache.thumbnails(media, "image", &subscriber));
    }

    void videoAtlasSurvivesMemoryEviction() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const QString media = directory.filePath("video.mp4");
        QProcess ffmpeg;
        ffmpeg.start("ffmpeg", {"-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=8",
                               "-t", "2", "-c:v", "libx264", "-g", "16", media});
        QVERIFY(ffmpeg.waitForFinished(10000));
        QCOMPARE(ffmpeg.exitCode(), 0);
        auto& cache = MediaPreviewCache::instance();
        cache.setThumbnailCacheDirectoryForTesting(directory.filePath("cache"));
        QObject subscriber;
        QVERIFY(!cache.thumbnails(media, "video", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        const auto first = cache.thumbnails(media, "video", &subscriber);
        QVERIFY(first);
        QCOMPARE(first->thumbs.size(), size_t(THUMBNAIL_COUNT));
        cache.clear();
        const int hits = cache.thumbnailDiskHits();
        QVERIFY(!cache.thumbnails(media, "video", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        QCOMPARE(cache.thumbnailDiskHits(), hits + 1);
        const auto second = cache.thumbnails(media, "video", &subscriber);
        QVERIFY(second);
        QCOMPARE(second->atlas, first->atlas);
        for (size_t i = 0; i < first->thumbs.size(); ++i) {
            QCOMPARE(second->thumbs[i].timeSec, first->thumbs[i].timeSec);
            QCOMPARE(second->thumbs[i].image, first->thumbs[i].image);
        }
    }

    void evictsLeastRecentlyUsedEntries() {
        QTemporaryDir directory;
        QVERIFY(directory.isValid());
        const auto atlas = sampleAtlas();
        ThumbnailDiskCache initial(directory.path());
        initial.store("a", *atlas);
        auto entries = QDir(directory.path()).entryInfoList({"*.ntthumb"}, QDir::Files);
        QCOMPARE(entries.size(), 1);
        const qint64 entryBytes = entries.front().size();
        ThumbnailDiskCache cache(directory.path(), 2 * entryBytes);
        cache.store("b", *atlas);
        entries = QDir(directory.path()).entryInfoList({"*.ntthumb"}, QDir::Files);
        QCOMPARE(entries.size(), 2);
        for (const auto& entry : entries) {
            QFile file(entry.absoluteFilePath());
            QVERIFY(file.open(QIODevice::ReadWrite));
            QVERIFY(file.setFileTime(QDateTime::currentDateTimeUtc().addDays(-1), QFileDevice::FileModificationTime));
        }
        QVERIFY(cache.load("a"));
        cache.store("c", *atlas);
        QVERIFY(cache.load("a"));
        QVERIFY(!cache.load("b"));
        QVERIFY(cache.load("c"));
        qint64 bytes = 0;
        for (const auto& entry : QDir(directory.path()).entryInfoList({"*.ntthumb"}, QDir::Files)) bytes += entry.size();
        QVERIFY(bytes <= 2 * entryBytes);
    }

    void malformedMetadataIsAMiss() {
        QTemporaryDir directory;
        ThumbnailDiskCache cache(directory.path());
        cache.store("key", *sampleAtlas());
        const auto entries = QDir(directory.path()).entryInfoList({"*.ntthumb"}, QDir::Files);
        QCOMPARE(entries.size(), 1);
        QFile file(entries.front().absoluteFilePath());
        QVERIFY(file.open(QIODevice::WriteOnly | QIODevice::Truncate));
        QDataStream stream(&file);
        stream << quint32(0x4e545431) << quint32(0xffffffff) << quint32(160) << quint32(90);
        file.close();
        QVERIFY(!cache.load("key"));
    }

    void unavailableDirectoryStillGeneratesThumbnails() {
        QTemporaryDir directory;
        const QString media = directory.filePath("image.png");
        QImage image(32, 16, QImage::Format_RGB32);
        image.fill(Qt::red);
        QVERIFY(image.save(media));
        auto& cache = MediaPreviewCache::instance();
        cache.setThumbnailCacheDirectoryForTesting(media);  // a file cannot contain cache entries
        QObject subscriber;
        QVERIFY(!cache.thumbnails(media, "image", &subscriber));
        QTRY_COMPARE_WITH_TIMEOUT(cache.pendingCount(), 0, 5000);
        QVERIFY(cache.thumbnails(media, "image", &subscriber));
    }
};

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    const auto args = app.arguments();
    if (args.size() == 4 && args[1] == "--populate") {
        auto& cache = MediaPreviewCache::instance();
        cache.setThumbnailCacheDirectoryForTesting(args[2]);
        QObject subscriber;
        cache.thumbnails(args[3], "image", &subscriber);
        if (!QTest::qWaitFor([&]() { return cache.pendingCount() == 0; }, 5000)) return 1;
        return cache.thumbnails(args[3], "image", &subscriber) ? 0 : 2;
    }
    TestThumbnailCache test;
    return QTest::qExec(&test, argc, argv);
}

#include "tst_thumbnailcache.moc"
