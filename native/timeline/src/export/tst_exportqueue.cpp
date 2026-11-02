// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#include "export/ExportQueue.h"
#include "export/ExportPresets.h"
#include "export/ExportSettings.h"
#include "model/TimelineJson.h"
#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QJsonDocument>
#include <QRegularExpression>
#include <QTemporaryDir>
#include <QUrl>
#include <QtTest>
#include <QtEndian>

namespace {
const QVariantMap wav{{"format", "wav"}};
QString state(const ExportQueue& queue, const QString& id) {
    return queue.job(id).value("state").toString();
}
QStringList stagingFolders(const QTemporaryDir& dir) {
    return QDir(dir.path()).entryList({".nt-export-*"}, QDir::Dirs | QDir::Hidden | QDir::NoDotAndDotDot);
}
qint64 wavDataOffset(const QString& path) {
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) { return -1; }
    const auto riff = file.read(12);
    if (riff.first(4) != "RIFF" || riff.mid(8, 4) != "WAVE") { return -1; }
    while (!file.atEnd()) {
        const auto chunk = file.read(8);
        if (chunk.size() != 8) { return -1; }
        if (chunk.first(4) == "data") { return file.pos(); }
        const auto size = qFromLittleEndian<quint32>(chunk.constData() + 4);
        if (!file.seek(file.pos() + size + size % 2)) { return -1; }
    }
    return -1;
}
bool loadFixture(TimelineModel& model) {
    auto parsed = nt::loadTimelineFile(QStringLiteral(NT_EXPORT_FIXTURES "/audio-mix.json"));
    if (!parsed.timeline) { return false; }
    model.setTimeline(std::move(*parsed.timeline));
    return true;
}
}

class ExportQueueTest : public QObject {
    Q_OBJECT
private slots:
    void settingsRoundTrip() {
        using namespace nt::exporting;
        const Settings full{"webm", true, 125.5, 8125, 1080, 1920, 29.97, 2500, "fill"};
        QCOMPARE(toVariant(settingsFromVariant(toVariant(full))), toVariant(full));
        const auto normal = settingsFromVariant({{"format", "avi"}, {"width", -1}, {"height", -20},
            {"fps", -1}, {"videoBitrateKbps", -1}, {"startMs", -5}, {"endMs", -10}, {"scaleMode", "stretch"}});
        QCOMPARE(toVariant(normal), toVariant(Settings{}));
        QCOMPARE(cliArguments(Settings{}), QStringList({"--format", "mp4"}));
        QCOMPARE(cliArguments(full), QStringList({"--format", "webm", "--start-ms", "125.5", "--end-ms", "8125",
            "--width", "1080", "--height", "1920", "--fps", "29.97", "--video-bitrate", "2500", "--scale-mode", "fill", "--alpha"}));
        QCOMPARE(fileExtension("png_sequence"), QString("zip"));
        QCOMPARE(fileExtension("wav"), QString("wav"));
        const QStringList formats{"mp4", "webm", "png_sequence", "wav", "mp3"};
        const QStringList labels{"MP4 (H.264)", "WebM (VP9)", "PNG sequence (.zip)", "WAV audio", "MP3 audio"};
        for (int i = 0; i < formats.size(); ++i) {
            QCOMPARE(formatLabel(formats[i]), labels[i]);
            QCOMPARE(isAudioOnly(formats[i]), i >= 3);
        }
    }
    void builtinPresets() {
        const auto presets = nt::exporting::builtinExportPresets();
        QCOMPARE(presets.size(), size_t(6));
        const QStringList ids{"match", "landscape-1080p", "vertical-9x16", "square-1x1", "review-720p", "audio-wav"};
        const QStringList names{"Match timeline", "1080p landscape", "Vertical 9:16", "Square", "Small review copy", "Audio only (WAV)"};
        QSet<QString> unique;
        for (size_t i = 0; i < presets.size(); ++i) {
            const auto& p = presets[i];
            QCOMPARE(p.id, ids[int(i)]);
            QCOMPARE(p.name, names[int(i)]);
            QVERIFY(p.builtin);
            QVERIFY(!p.description.isEmpty());
            QVERIFY(QStringList({"mp4", "webm", "png_sequence", "wav", "mp3"}).contains(p.settings.format));
            QCOMPARE(p.settings.width % 2, 0);
            QCOMPARE(p.settings.height % 2, 0);
            unique.insert(p.id);
        }
        QCOMPARE(unique.size(), 6);
        QCOMPARE(presets[1].settings.width, 1920);
        QCOMPARE(presets[1].settings.height, 1080);
        QCOMPARE(presets[2].settings.width, 1080);
        QCOMPARE(presets[2].settings.height, 1920);
        QCOMPARE(presets[3].settings.height, 1080);
        QCOMPARE(presets[4].settings.videoBitrateKbps, 2500);
        QCOMPARE(presets[5].settings.format, QString("wav"));
    }
    void userPresets() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto old = qgetenv("NODETOOL_TIMELINE_PREFERENCES");
        qputenv("NODETOOL_TIMELINE_PREFERENCES", dir.filePath("preferences.ini").toUtf8());
        const auto restore = qScopeGuard([&] {
            if (old.isNull()) { qunsetenv("NODETOOL_TIMELINE_PREFERENCES"); }
            else { qputenv("NODETOOL_TIMELINE_PREFERENCES", old); }
        });
        ExportPresets first;
        QCOMPARE(first.lastPresetId(), QString("match"));
        auto match = first.settingsFor("match");
        match.remove("startMs"); match.remove("endMs"); match.remove("alpha");
        QCOMPARE(first.lastSettings(), match);
        QVERIFY(first.preset("missing").isEmpty());
        QVERIFY(first.settingsFor("missing").isEmpty());
        auto custom = first.settingsFor("review-720p");
        custom.insert("startMs", 1000); custom.insert("endMs", 2000); custom.insert("alpha", true);
        const auto id = first.saveUserPreset("  My Review  ", custom);
        QVERIFY(QRegularExpression("^user-[0-9a-f]{12}$").match(id).hasMatch());
        QCOMPARE(first.saveUserPreset("my review", wav), id);
        QCOMPARE(first.presets().size(), 7);
        QVERIFY(first.saveUserPreset(" MATCH TIMELINE ", wav).isEmpty());
        QVERIFY(first.saveUserPreset("  ", wav).isEmpty());
        first.setLastPresetId(id);
        first.setLastPresetId("missing");
        QCOMPARE(first.lastPresetId(), id);
        first.setLastSettings(custom);
        QVERIFY(!first.lastSettings().contains("startMs"));
        QVERIFY(!first.lastSettings().contains("endMs"));
        QVERIFY(!first.lastSettings().contains("alpha"));
        ExportPresets second;
        QCOMPARE(second.preset(id).value("format").toString(), QString("wav"));
        QCOMPARE(second.settingsFor(id).value("startMs").toDouble(), 0.0);
        QCOMPARE(second.settingsFor(id).value("endMs").toDouble(), -1.0);
        QCOMPARE(second.lastPresetId(), id);
        QCOMPARE(second.lastSettings(), first.lastSettings());
        QCOMPARE(second.idForSettings(custom), QString("review-720p"));
        QVERIFY(second.idForSettings({{"width", 42}}).isEmpty());
        QVERIFY(!second.removeUserPreset("match"));
        QVERIFY(!second.removeUserPreset("missing"));
        QVERIFY(second.removeUserPreset(id));
        QCOMPARE(second.lastPresetId(), QString("match"));
        ExportPresets third;
        QCOMPARE(third.lastPresetId(), QString("match"));
        QCOMPARE(third.presets().size(), 6);
        // Also handle a stale stored selection left by an older install.
        QSettings stored(dir.filePath("preferences.ini"), QSettings::IniFormat);
        stored.setValue("export/lastPreset", id);
        stored.sync();
        ExportPresets fourth;
        QCOMPARE(fourth.lastPresetId(), QString("match"));
    }
    void queueRunsOneAtATime() {
        QTemporaryDir dir;
        TimelineModel model;
        QVERIFY(loadFixture(model));
        ExportQueue queue;
        queue.setTimeline(&model);
        queue.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        QStringList ids, finished;
        bool overlap = false;
        const auto observe = [&] {
            int running = 0;
            for (const auto& id : ids) {
                running += state(queue, id) == "running";
                if (state(queue, id) == "done" && !finished.contains(id)) { finished.append(id); }
            }
            overlap |= running > 1;
        };
        connect(&queue, &QAbstractItemModel::dataChanged, this, observe);
        connect(&queue, &ExportQueue::countChanged, this, observe);
        for (int i = 0; i < 3; ++i) {
            const auto path = dir.filePath(QString::number(i) + ".wav");
            ids.append(queue.enqueue(i == 0 ? QUrl::fromLocalFile(path).toString() : path, wav, "Audio only (WAV)"));
            QVERIFY(!ids.last().isEmpty());
            QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(ids.last()).hasMatch());
            observe();
        }
        QCOMPARE(queue.rowCount(), 3);
        QCOMPARE(queue.activeCount(), 3);
        QVERIFY(queue.running());
        queue.remove(ids[1]);
        QCOMPARE(queue.rowCount(), 3);
        QTRY_COMPARE_WITH_TIMEOUT(queue.activeCount(), 0, 30000);
        observe();
        QVERIFY(!overlap);
        QVERIFY(!queue.running());
        QCOMPARE(finished, ids);
        const auto header = wavDataOffset(dir.filePath("0.wav"));
        QVERIFY(header >= 44);
        const qint64 expected = header + 9 * 48000 * 4;
        QCOMPARE(QFileInfo(dir.filePath("0.wav")).size(), expected);
        for (int i = 0; i < 3; ++i) {
            QCOMPARE(state(queue, ids[i]), QString("done"));
            QCOMPARE(queue.job(ids[i]).value("detail").toString(), QString("Saved"));
            QCOMPARE(queue.job(ids[i]).value("name").toString(), model.name());
            QCOMPARE(QFileInfo(dir.filePath(QString::number(i) + ".wav")).size(), expected);
        }
        const auto roles = queue.roleNames();
        for (auto it = roles.begin(); it != roles.end(); ++it) {
            QCOMPARE(queue.data(queue.index(0), it.key()), queue.job(ids[0]).value(QString::fromUtf8(it.value())));
        }
        queue.remove(ids[0]);
        QCOMPARE(queue.rowCount(), 2);
        queue.clearFinished();
        QCOMPARE(queue.rowCount(), 0);
    }
    void editingAfterQueueingDoesNotChangeTheJob() {
        QTemporaryDir dir;
        TimelineModel model;
        QVERIFY(loadFixture(model));
        ExportQueue reference;
        reference.setTimeline(&model);
        reference.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        const auto before = reference.enqueue(dir.filePath("before.wav"), wav);
        QVERIFY(!before.isEmpty());
        QTRY_COMPARE_WITH_TIMEOUT(state(reference, before), QString("done"), 30000);
        const auto expected = QFileInfo(dir.filePath("before.wav")).size();
        const auto header = wavDataOffset(dir.filePath("before.wav"));
        QVERIFY(header >= 44);
        QCOMPARE(expected - header, qint64(9 * 48000 * 4));
        ExportQueue queue;
        queue.setTimeline(&model);
        queue.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        const auto a = queue.enqueue(dir.filePath("a.wav"), wav);
        const auto b = queue.enqueue(dir.filePath("b.wav"), wav);
        QVERIFY(!a.isEmpty());
        QVERIFY(!b.isEmpty());
        QCOMPARE(state(queue, b), QString("queued"));
        const auto name = model.name();
        model.setTimeline(nt::Timeline{});
        QTRY_COMPARE_WITH_TIMEOUT(queue.activeCount(), 0, 30000);
        QCOMPARE(state(queue, a), QString("done"));
        QCOMPARE(state(queue, b), QString("done"));
        QCOMPARE(queue.job(b).value("name").toString(), name);
        QCOMPARE(QFileInfo(dir.filePath("a.wav")).size(), expected);
        QCOMPARE(QFileInfo(dir.filePath("b.wav")).size(), expected);
    }
    void failedJobDoesNotStopTheQueue() {
        QTemporaryDir dir;
        TimelineModel model;
        QVERIFY(loadFixture(model));
        QFile exists(dir.filePath("exists.wav"));
        QVERIFY(exists.open(QIODevice::WriteOnly));
        exists.write("keep"); exists.close();
        ExportQueue queue;
        queue.setTimeline(&model);
        queue.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        const auto a = queue.enqueue(exists.fileName(), wav);
        const auto b = queue.enqueue(dir.filePath("good.wav"), wav);
        QVERIFY(!a.isEmpty()); QVERIFY(!b.isEmpty());
        QTRY_COMPARE_WITH_TIMEOUT(queue.activeCount(), 0, 30000);
        QCOMPARE(state(queue, a), QString("failed"));
        QVERIFY(!queue.job(a).value("error").toString().isEmpty());
        QCOMPARE(queue.job(a).value("detail"), queue.job(a).value("error"));
        QCOMPARE(state(queue, b), QString("done"));
        QCOMPARE(QFileInfo(exists.fileName()).size(), qint64(4));
        // A synchronous snapshot/staging failure must schedule the next item too.
        const auto c = queue.enqueue(dir.filePath("c.wav"), wav);
        QVERIFY(QDir(dir.path()).mkdir("removed"));
        const auto d = queue.enqueue(dir.filePath("removed/d.wav"), wav);
        const auto e = queue.enqueue(dir.filePath("e.wav"), wav);
        QVERIFY(!c.isEmpty()); QVERIFY(!d.isEmpty()); QVERIFY(!e.isEmpty());
        QVERIFY(QDir(dir.path()).rmdir("removed"));
        QTRY_COMPARE_WITH_TIMEOUT(queue.activeCount(), 0, 30000);
        QCOMPARE(state(queue, d), QString("failed"));
        QVERIFY(!queue.job(d).value("error").toString().isEmpty());
        QCOMPARE(state(queue, e), QString("done"));
    }
    void cancelQueuedAndRunning() {
        QTemporaryDir dir;
        TimelineModel model;
        QVERIFY(loadFixture(model));
        ExportQueue queue;
        queue.setTimeline(&model);
        queue.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        const auto a = queue.enqueue(dir.filePath("a.wav"), wav);
        const auto b = queue.enqueue(dir.filePath("b.wav"), wav);
        const auto c = queue.enqueue(dir.filePath("c.wav"), wav);
        QVERIFY(!a.isEmpty()); QVERIFY(!b.isEmpty()); QVERIFY(!c.isEmpty());
        queue.cancel(b);
        QCOMPARE(state(queue, b), QString("cancelled"));
        QCOMPARE(queue.job(b).value("detail").toString(), QString("Cancelled"));
        QCOMPARE(queue.activeCount(), 2);
        queue.cancel(a);
        QTRY_COMPARE_WITH_TIMEOUT(queue.activeCount(), 0, 30000);
        QCOMPARE(state(queue, a), QString("cancelled"));
        QCOMPARE(state(queue, c), QString("done"));
        QVERIFY(!QFileInfo::exists(dir.filePath("a.wav")));
        QVERIFY(!QFileInfo::exists(dir.filePath("b.wav")));
        QVERIFY(QFileInfo::exists(dir.filePath("c.wav")));
        QVERIFY(stagingFolders(dir).isEmpty());
    }
    void refusals() {
        QTemporaryDir dir;
        ExportQueue queue;
        QVERIFY(queue.enqueue(dir.filePath("a.wav"), wav).isEmpty());
        QCOMPARE(queue.lastError(), QString("Open a timeline before exporting."));
        TimelineModel model;
        QVERIFY(loadFixture(model));
        queue.setTimeline(&model);
        queue.setExecutable(QStringLiteral(NT_EXPORT_BINARY));
        QVERIFY(queue.enqueue(dir.filePath("absent/a.wav"), wav).isEmpty());
        QCOMPARE(queue.lastError(), QString("The folder for this export does not exist."));
        const auto a = queue.enqueue(dir.filePath("a.wav"), wav);
        QVERIFY(!a.isEmpty());
        QVERIFY(queue.lastError().isEmpty());
        QVERIFY(queue.enqueue(QUrl::fromLocalFile(dir.filePath("a.wav")).toString(), wav).isEmpty());
        QCOMPARE(queue.lastError(), QString("Another queued export already writes a.wav."));
        model.setTimeline(nt::Timeline{});
        QVERIFY(queue.enqueue(dir.filePath("empty.wav"), wav).isEmpty());
        QCOMPARE(queue.lastError(), QString("Add a clip before exporting."));
        const QJsonObject raw{{"durationMs", 1000}, {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}}}},
            {"clips", QJsonArray{QJsonObject{{"id", "c"}, {"trackId", "v"}, {"mediaType", "video"},
                {"durationMs", 1000}, {"currentAssetId", "unavailable"}}}}};
        auto parsed = nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QVERIFY(queue.enqueue(dir.filePath("unavailable.mp4"), {}).isEmpty());
        QCOMPARE(queue.lastError(), nt::exporting::unavailableOriginalMedia(model.timeline()));
    }
    void shutdownIsBounded() {
        QTemporaryDir dir;
        TimelineModel model;
        QVERIFY(loadFixture(model));
        QElapsedTimer elapsed;
        {
            ExportQueue queue;
            queue.setTimeline(&model);
            queue.setExecutable(QCoreApplication::applicationFilePath());
            QVERIFY(!queue.enqueue(dir.filePath("never.wav"), wav).isEmpty());
            QVERIFY(!queue.enqueue(dir.filePath("queued.wav"), wav).isEmpty());
            QTRY_VERIFY_WITH_TIMEOUT(!stagingFolders(dir).isEmpty(), 30000);
            QTRY_VERIFY_WITH_TIMEOUT(QFileInfo::exists(dir.filePath(stagingFolders(dir).first() + "/output")), 30000);
            elapsed.start();
        }
        QVERIFY2(elapsed.elapsed() < 3500, qPrintable(QString::number(elapsed.elapsed())));
        QVERIFY(stagingFolders(dir).isEmpty());
        QVERIFY(!QFileInfo::exists(dir.filePath("never.wav")));
        QVERIFY(!QFileInfo::exists(dir.filePath("queued.wav")));
    }
};
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    const auto args = app.arguments();
    if (args.contains("--export")) {
        QFile partial(QDir(args.value(args.indexOf("--staging-directory") + 1)).filePath("output"));
        if (!partial.open(QIODevice::WriteOnly)) { return 2; }
        partial.write("partial"); partial.close();
        return app.exec();
    }
    ExportQueueTest test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_exportqueue.moc"
