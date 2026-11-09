// Remix through the production editor: the dialog opened from the key action, the
// clip menu and the Clip menu, the plan and sliders with real pointer and key
// events, the audition on the silent backend, the commit as one undo entry with
// undo, redo and revert, and the refusals. The server is a fake that keeps files
// in a folder.
#include "app/MenuRegistry.h"
#include "app/Menus/ShellMenus.h"
#include "assets/AssetWav.h"
#include "remix/clip/RemixBackend.h"
#include "remix/clip/RemixController.h"
#include "remix/clip/RemixEdit.h"
#include "wiring/WiringFixture.h"

#include <QFile>
#include <QSemaphore>
#include <atomic>
#include <QQmlEngine>
#include <QTemporaryDir>
#include <cmath>

namespace {
// 120 beats per minute: a kick and a bass note on 1 and 3, a snare on 2 and 4, hats on the eighths and a chord
// that changes every four bars so some beats resemble each other more than others.
std::vector<float> music(double seconds) {
    const int rate = 48000;
    const size_t frames = size_t(seconds * rate);
    std::vector<float> out(frames * 2, 0.0f);
    const double beat = 0.5;
    uint32_t seed = 7;
    auto noise = [&seed] { seed = seed * 1664525u + 1013904223u; return float(seed >> 8) / float(1u << 24) * 2.0f - 1.0f; };
    const double tau = 6.283185307179586;
    for (size_t i = 0; i < frames; ++i) {
        const double t = double(i) / rate;
        const int beatIndex = int(t / beat);
        const double inBeat = t - beatIndex * beat;
        const int bar = beatIndex / 4;
        static const double roots[4] = {130.8, 110.0, 174.6, 196.0};
        const double root = roots[(bar / 2) % 4];
        double v = 0.05 * (std::sin(tau * root * t) + std::sin(tau * root * 1.26 * t) + std::sin(tau * root * 1.5 * t)) * (1.0 - 0.3 * (inBeat / beat));
        if (beatIndex % 2 == 0) { v += 0.8 * std::exp(-inBeat * 9.0) * std::sin(tau * (50.0 + 90.0 * std::exp(-inBeat * 25.0)) * inBeat); }
        else if (inBeat < 0.2) { v += 0.35 * std::exp(-inBeat * 22.0) * noise(); }
        v += 0.15 * std::exp(-inBeat * 3.0) * std::sin(tau * root * 0.5 * inBeat);
        const double eighth = std::fmod(inBeat, beat / 2);
        if (eighth < 0.04) { v += 0.08 * std::exp(-eighth * 120.0) * noise(); }
        out[i * 2] = out[i * 2 + 1] = float(v);
    }
    return out;
}
bool writeMusic(const QString& path, double seconds) {
    const auto samples = music(seconds);
    size_t at = 0;
    return nt::assets::writeStereoWavStream(path, [&](std::span<float> buffer) -> qint64 {
        const size_t n = std::min(buffer.size(), samples.size() - at);
        std::copy_n(samples.begin() + at, n, buffer.begin());
        at += n;
        return qint64(n / 2);
    }, [] { return false; }).has_value();
}

// A server that keeps every asset in a folder.
class FakeBackend final : public nt::remix::Backend {
public:
    explicit FakeBackend(QString dir, QString name) : m_dir(std::move(dir)), m_name(std::move(name)) {}
    QHash<QString, QString> files;
    QStringList uploads;
    // A test holds resolve() here to keep a download pending.
    QSemaphore gate{1000000};
    std::atomic<int> waiting{0};
    nt::remix::ResolvedAudio resolve(const QString& assetId, nt::assets::MediaProtection&, quint64) override {
        nt::remix::ResolvedAudio out;
        ++waiting;
        gate.acquire();
        gate.release();
        --waiting;
        if (!files.contains(assetId)) { out.error = "No such asset."; return out; }
        out.asset = QJsonObject{{"id", assetId}};
        out.media.raw = QJsonObject{{"mediaType", "audio"}, {"currentAssetId", assetId}};
        out.media.mediaType = nt::MediaType::Audio;
        out.media.audioPath = files.value(assetId).toStdString();
        return out;
    }
    nt::remix::UploadedAudio upload(const QString& wavPath, const QString& name, const QString&) override {
        nt::remix::UploadedAudio out;
        if (failUpload) { out.error = "The server refused the upload."; return out; }
        const QString id = QString("asset-remix-%1").arg(files.size());
        const QString dest = m_dir + "/" + m_name + "-" + id + ".wav";
        QFile::remove(dest);
        if (!QFile::copy(wavPath, dest)) { out.error = "Could not store " + dest; return out; }
        files.insert(id, dest);
        uploads << name;
        out.asset = QJsonObject{{"id", id}, {"name", name}};
        return out;
    }
    bool failUpload = false;
private:
    QString m_dir, m_name;
};
}  // namespace

class TestRemixUi : public WiringFixture {
    Q_OBJECT
    QTemporaryDir dir;
    // native-rules #1: std::shared_ptr without a comment saying why unique ownership is impossible
    std::shared_ptr<FakeBackend> backend;
    QString srcFile;

    void openMusic(bool withNext = true, double musicStart = 1000) {
        open();
        const QString next = withNext ? R"(,{"id":"n","trackId":"a","name":"Next","mediaType":"audio","startMs":31000,"durationMs":4000,"currentAssetId":"asset-next"})" : "";
        auto parsed = nt::parseTimelineJson(QString(R"({"name":"Remix","fps":30,"width":640,"height":360,"durationMs":60000,
          "tracks":[{"id":"v","name":"Video","type":"video","index":0,"heightPx":80,"visible":true,"locked":false},
                    {"id":"a","name":"Music","type":"audio","index":1,"heightPx":80,"visible":true,"locked":false,"muted":false,"solo":false}],
          "clips":[{"id":"i","trackId":"v","name":"Still","mediaType":"image","startMs":0,"durationMs":3000},
                   {"id":"m","trackId":"a","name":"Theme","mediaType":"audio","startMs":%1,"durationMs":20000,"currentAssetId":"asset-src","status":"generated","sourceType":"generated","versions":[]}%2]})")
            .arg(musicStart).arg(next).toUtf8());
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        nt::Clip media;
        media.raw = QJsonObject{{"mediaType", "audio"}, {"currentAssetId", "asset-src"}};
        media.mediaType = nt::MediaType::Audio;
        media.audioPath = srcFile.toStdString();
        model.registerMedia(media);
        backend->files.insert("asset-src", srcFile);
        controller()->setBackend(backend);
        controller()->setAudioMode("null");
        settle();
    }
    RemixController* controller() const {
        auto* host = item("remixHost");
        return host ? host->findChild<RemixController*>("remixController") : nullptr;
    }
    QObject* dialog() const { return item("remixHost")->findChild<QObject*>("remixDialog"); }
    RemixSession* session() const {
        return qmlEngine(view->rootObject())->singletonInstance<RemixSession*>("NodeTool.Timeline", "RemixSession");
    }
    void settle() {
        QCoreApplication::processEvents();
        QTest::qWait(60);
    }
    void shot(const QString& name) {
        if (qEnvironmentVariableIsSet("NT_SHOT_DIR")) { view->grabWindow().save(qEnvironmentVariable("NT_SHOT_DIR") + "/" + name + ".png"); }
    }
    void openDialogReady() {
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "m"}}));
        QTRY_VERIFY(dialog()->property("visible").toBool());
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        settle();
    }
    // A clip may run past the window: the point 100 px into its visible part.
    QPoint visiblePoint(QQuickItem* target) const {
        return target->mapToScene({100, target->height() / 2}).toPoint();
    }
    void typeTarget(const QString& text) {
        auto* field = item("remixTarget");
        QVERIFY(field);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(field));
        QTRY_VERIFY(field->hasActiveFocus());
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const QChar c : text) { QTest::keyClick(view.get(), c.toLatin1()); }
        QTest::keyClick(view.get(), Qt::Key_Return);
        settle();
    }

private slots:
    void initTestCase() {
        QVERIFY(dir.isValid());
        srcFile = dir.filePath("music.wav");
        QVERIFY(writeMusic(srcFile, 20));
    }
    void init() {
        // Each test stores its own files: nothing it resolves can be left over from an earlier one.
        backend = std::make_shared<FakeBackend>(dir.path(), QString(QTest::currentTestFunction()));
    }
    void cleanup() { view.reset(); }

    void theKeyActionOpensTheDialogAndShowsThePlan() {
        openMusic();
        QVERIFY(!dialog()->property("visible").toBool());
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "m"}}));
        QTRY_VERIFY(dialog()->property("visible").toBool());
        // The analysis runs off the GUI thread: the dialog shows progress first.
        QVERIFY(controller()->state() == "analyzing" || controller()->state() == "ready");
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        settle();
        QVERIFY(controller()->hasPlan());
        QVERIFY2(std::abs(controller()->bpm() - 120.0) < 1.5, qPrintable(QString::number(controller()->bpm())));
        QCOMPARE(item("remixTarget")->property("text").toString(), QString("20"));
        QCOMPARE(item("remixSegments")->property("value").toDouble(), 50.0);
        QVERIFY(item("remixPlan")->isVisible());
        QVERIFY(item("remixResultLane"));
        QVERIFY(item("remixApply")->property("enabled").toBool());
        shot("remix-dialog");
    }
    void typingATargetPlansItAndTheSlidersAddCuts() {
        openMusic(false);
        openDialogReady();
        typeTarget("35");
        QTRY_COMPARE(controller()->targetMs(), 35000.0);
        QVERIFY(controller()->hasPlan());
        const int base = controller()->cutCount();
        QVERIFY(base >= 1);  // 15 s more than the music has needs at least one jump back
        QVERIFY(item("remixResult")->property("text").toString().contains("0:35.00"));
        // Drag the Segments slider to its end with the pointer.
        auto* slider = item("remixSegments");
        const auto left = slider->mapToScene(QPointF(4, slider->height() / 2)).toPoint();
        const auto right = slider->mapToScene(QPointF(slider->width() - 2, slider->height() / 2)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, center(slider));
        QTest::mouseMove(view.get(), right, 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, right);
        settle();
        QCOMPARE(controller()->segments(), 100.0);
        const int most = controller()->cutCount();
        QVERIFY2(most > base, qPrintable(QString("%1 vs %2").arg(most).arg(base)));
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, center(slider));
        QTest::mouseMove(view.get(), left, 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, left);
        settle();
        QCOMPARE(controller()->segments(), 0.0);
        const int fewest = controller()->cutCount();
        QVERIFY(fewest >= 1 && fewest <= base);
        // The pieces cover the result without gaps and every cut is drawn.
        const auto pieces = controller()->pieces();
        QCOMPARE(pieces.size(), fewest + 1);
        QCOMPARE(pieces.first().toMap().value("outFrom").toDouble(), 0.0);
        QCOMPARE(pieces.last().toMap().value("outTo").toDouble(), 1.0);
        QVERIFY(item("remixCut0"));
        // Nothing reached the document.
        QCOMPARE(clip("m").value("durationMs").toDouble(), 20000.0);
        shot("remix-longer");
        // An invalid length is refused in place.
        typeTarget("abc");
        QVERIFY(!item("remixApply")->property("enabled").toBool() || controller()->targetMs() == 35000.0);
    }
    void theClipLengthButtonRestoresTheDefault() {
        openMusic(false);
        openDialogReady();
        typeTarget("12");
        QTRY_COMPARE(controller()->targetMs(), 12000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixUseClipLength")));
        QTRY_COMPARE(controller()->targetMs(), 20000.0);
        QCOMPARE(item("remixTarget")->property("text").toString(), QString("20"));
    }
    void listeningRendersAPreviewAndStops() {
        openMusic(false);
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QVERIFY(!controller()->listening());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixListen")));
        QTRY_VERIFY_WITH_TIMEOUT(controller()->listening(), 20000);
        QCOMPARE(controller()->audioMode(), QString("null"));
        QCOMPARE(item("remixListen")->property("text").toString(), QString("Stop"));
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixListen")));
        QTRY_VERIFY(!controller()->listening());
        // Listening changes no document.
        QCOMPARE(clip("m").value("durationMs").toDouble(), 20000.0);
        QVERIFY(!model.undoStack()->canUndo() || model.undoStack()->count() == 0);
    }
    void remixCommitsOneUndoEntryAndRevertGivesTheOriginalBack() {
        openMusic(false);
        const auto original = clip("m");
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTRY_VERIFY(item("remixApply")->property("enabled").toBool());
        const int base = model.undoStack()->count();
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QCOMPARE(model.undoStack()->count(), base + 1);
        const auto remixed = clip("m");
        QCOMPARE(remixed.value("durationMs").toDouble(), 14000.0);
        QCOMPARE(remixed.value("startMs").toDouble(), original.value("startMs").toDouble());
        QVERIFY(remixed.value("currentAssetId").toString().startsWith("asset-remix"));
        QCOMPARE(remixed.value("versions").toArray().size(), 2);
        QCOMPARE(backend->uploads.size(), 1);
        QVERIFY2(backend->uploads.first().contains("Theme") && backend->uploads.first().contains("remix"), qPrintable(backend->uploads.first()));
        // The new media plays: the clip found its file by the new asset.
        bool found = false;
        for (const auto& c : model.timeline().clips) {
            if (c.id == "m") { found = !c.audioPath.empty() && c.audioPath != srcFile.toStdString(); }
        }
        QVERIFY(found);
        // Undo and redo.
        model.undoStack()->undo();
        QCOMPARE(clip("m"), original);
        model.undoStack()->redo();
        QCOMPARE(clip("m"), remixed);
        // Revert through the menu action: one entry, and the original clip is back (the history of takes stays).
        const int beforeRevert = model.undoStack()->count();
        QVERIFY(gestures()->runAction("revertRemix", {{"clipId", "m"}}));
        // The original is fetched first, so the revert lands a moment later.
        QTRY_COMPARE(model.undoStack()->count(), beforeRevert + 1);
        auto reverted = clip("m");
        QCOMPARE(reverted.value("durationMs").toDouble(), 20000.0);
        QCOMPARE(reverted.value("currentAssetId").toString(), QString("asset-src"));
        reverted.remove("versions");
        reverted.remove("activeTakeId");
        auto base2 = original;
        base2.remove("versions");
        QCOMPARE(reverted, base2);
        // A clip that is not a remix has nothing to revert.
        QVERIFY(gestures()->runAction("revertRemix", {{"clipId", "m"}}));
        QTest::qWait(200);
        QCOMPARE(model.undoStack()->count(), beforeRevert + 1);
        QCOMPARE(item("remixHost")->property("noticeText").toString(), QString("This clip is not a remix."));
        model.undoStack()->undo();
        QCOMPARE(clip("m"), remixed);
    }
    void aNewTargetRemixesTheSourceAgain() {
        openMusic(false);
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "m"}}));
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        QVERIFY(controller()->isRemix());
        // The sliders start where the remix left them and the source is the original music.
        QCOMPARE(controller()->sourceMs(), 20000.0);
        QCOMPARE(controller()->currentMs(), 14000.0);
        typeTarget("16");
        QTRY_COMPARE(controller()->targetMs(), 16000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QCOMPARE(clip("m").value("durationMs").toDouble(), 16000.0);
        QCOMPARE(clip("m").value("versions").toArray().size(), 3);
        QVERIFY(gestures()->runAction("revertRemix", {{"clipId", "m"}}));
        QTRY_COMPARE(clip("m").value("currentAssetId").toString(), QString("asset-src"));
        QCOMPARE(clip("m").value("durationMs").toDouble(), 20000.0);
    }
    void aResultThatWouldOverlapTheNextClipIsRefused() {
        openMusic(true);
        openDialogReady();
        // The next clip starts 30 s after this one.
        QCOMPARE(controller()->gapMs(), 30000.0);
        typeTarget("31");
        QTRY_COMPARE(controller()->targetMs(), 31000.0);
        QTRY_VERIFY(!item("remixApply")->property("enabled").toBool());
        QVERIFY2(controller()->refusal().contains("overlap") && controller()->refusal().contains("Music"), qPrintable(controller()->refusal()));
        QVERIFY(item("remixRefusal")->isVisible());
        QVERIFY(item("remixRefusal")->property("message").toString().contains("overlap"));
        shot("remix-refused");
        const int base = model.undoStack()->count();
        QCOMPARE(model.applyEdit("clip.remix", {{"clipId", "m"}, {"assetId", "x"}, {"takeId", "t"}, {"durationMs", 31000}}), quint64(0));
        QCOMPARE(model.undoStack()->count(), base);
        // The gap button fills the room that is there.
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixFitGap")));
        QTRY_COMPARE(controller()->targetMs(), 30000.0);
        QTRY_VERIFY(item("remixApply")->property("enabled").toBool());
    }
    void clipsThatCannotBeRemixedExplainWhy() {
        openMusic(false);
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "i"}}));
        QTRY_VERIFY(dialog()->property("visible").toBool());
        QCOMPARE(controller()->state(), QString("refused"));
        QVERIFY(item("remixRefusal")->property("message").toString().contains("audio clips"));
        QVERIFY(!item("remixApply")->isVisible());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixCancel")));
        QTRY_VERIFY(!dialog()->property("visible").toBool());
        // With nothing selected the action has no clip.
        gestures()->setSelection({});
        QVERIFY(!gestures()->runAction("remixClip", {}));
    }
    void cancellingWhileTheMusicIsAnalysedLeavesTheClipAlone() {
        openMusic(false);
        const auto original = clip("m");
        const int base = model.undoStack()->count();
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "m"}}));
        QTRY_VERIFY(dialog()->property("visible").toBool());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixCancel")));
        QTRY_VERIFY(!dialog()->property("visible").toBool());
        QCOMPARE(controller()->state(), QString("closed"));
        QTest::qWait(300);
        QCOMPARE(controller()->state(), QString("closed"));
        QCOMPARE(clip("m"), original);
        QCOMPARE(model.undoStack()->count(), base);
    }
    void aFailedUploadKeepsTheDialogAndTheClip() {
        openMusic(false);
        const auto original = clip("m");
        backend->failUpload = true;
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!controller()->error().isEmpty(), 30000);
        QTRY_COMPARE(controller()->state(), QString("ready"));
        QVERIFY(dialog()->property("visible").toBool());
        QCOMPARE(clip("m"), original);
        QVERIFY(item("remixRefusal")->property("message").toString().contains("refused"));
        // Retrying after the server recovers works.
        backend->failUpload = false;
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QCOMPARE(clip("m").value("durationMs").toDouble(), 14000.0);
    }
    void theClipMenuOfTheMenuBarOpensTheDialog() {
        openMusic(false);
        nt::app::ShellMenus menus;
        menus.setAnchor(view->contentItem());
        const auto enabled = [&](const QString& action, const QString& select) {
            gestures()->setSelection({select});
            QVariantMap context{{"kind", "shell"}, {"gestures", QVariant::fromValue<QObject*>(gestures())}, {"timeline", QVariant::fromValue<QObject*>(&model)}};
            for (const auto& menu : nt::app::shellMenuDescription("nodetool", {}, context)) {
                if (menu.label != "Clip") { continue; }
                for (const auto& item : menu.items) {
                    if (item.action == action) { return std::optional<bool>(item.enabled); }
                }
            }
            return std::optional<bool>();
        };
        QCOMPARE(enabled("remixClip", "m"), std::optional<bool>(true));
        QCOMPARE(enabled("remixClip", "i"), std::optional<bool>(false));
        QCOMPARE(enabled("revertRemix", "m"), std::optional<bool>(false));
        gestures()->setSelection({"i"});
        QVERIFY(!menus.trigger("remixClip"));
        gestures()->setSelection({"m"});
        QVERIFY(menus.trigger("remixClip"));
        QTRY_VERIFY(dialog()->property("visible").toBool());
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        QCOMPARE(controller()->clipId(), QString("m"));
    }
    void aCancelledOrInvalidTargetEditGoesBackToWhatThePlanUses() {
        openMusic(false);
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        // Typing something that is not a length and leaving the field cancels the edit.
        auto* field = item("remixTarget");
        QTest::keyClick(view.get(), Qt::Key_A, Qt::ControlModifier);
        for (const char c : QByteArray("abc")) { QTest::keyClick(view.get(), c); }
        QTest::keyClick(view.get(), Qt::Key_Tab);
        settle();
        QCOMPARE(field->property("text").toString(), QString("14"));
        QCOMPARE(controller()->targetMs(), 14000.0);
        // What is shown is what Remix makes.
        const int base = model.undoStack()->count();
        QTRY_VERIFY(item("remixApply")->property("enabled").toBool());
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QCOMPARE(clip("m").value("durationMs").toDouble(), 14000.0);
        QCOMPARE(model.undoStack()->count(), base + 1);
    }
    void escapeDuringASliderDragGoesBackToTheCommittedValue() {
        openMusic(false);
        openDialogReady();
        typeTarget("35");
        QTRY_COMPARE(controller()->targetMs(), 35000.0);
        const double before = controller()->segments();
        auto* slider = item("remixSegments");
        const auto right = slider->mapToScene(QPointF(slider->width() - 2, slider->height() / 2)).toPoint();
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, center(slider));
        QTest::mouseMove(view.get(), right, 20);
        QTRY_COMPARE(controller()->segments(), 100.0);
        QTest::keyClick(view.get(), Qt::Key_Escape);
        settle();
        QCOMPARE(controller()->segments(), before);
        QVERIFY(dialog()->property("visible").toBool());  // Escape ended the drag, not the dialog
        // The pointer comes back over the handle, which is where the cancelled value put it.
        QTest::mouseMove(view.get(), center(slider), 20);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, center(slider));
        settle();
        QCOMPARE(controller()->segments(), before);
        QVERIFY(dialog()->property("visible").toBool());
    }
    void reopeningWhileARevertWaitsForTheDownloadDoesNotBlockLaterReverts() {
        openMusic(false);
        // A saved remix opened in a new session: only the remix is on disk.
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        const auto remixed = clip("m");
        // The original is fetched from the server: hold that call.
        backend->gate.acquire(1000000);
        QElapsedTimer timer;
        timer.start();
        QVERIFY(gestures()->runAction("revertRemix", {{"clipId", "m"}}));
        QTRY_VERIFY(backend->waiting.load() == 1);
        // Opening the dialog again cancels the pending revert and never waits for it.
        QVERIFY(gestures()->runAction("remixClip", {{"clipId", "m"}}));
        QVERIFY2(timer.elapsed() < 3000, "the GUI thread waited for the held download");
        backend->gate.release(1000000);
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        QCOMPARE(clip("m"), remixed);  // the cancelled revert changed nothing
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixCancel")));
        QTRY_VERIFY(!dialog()->property("visible").toBool());
        // A later revert is not blocked.
        const int base = model.undoStack()->count();
        QVERIFY(gestures()->runAction("revertRemix", {{"clipId", "m"}}));
        QTRY_COMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(clip("m").value("currentAssetId").toString(), QString("asset-src"));
    }
    void aClipThatChangesWhileTheDialogIsOpenCannotBeRemixedFromOldAudio() {
        openMusic(false);
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTRY_VERIFY(item("remixApply")->property("enabled").toBool());
        // Another take is applied to the clip while the dialog analysed the first one.
        backend->files.insert("asset-other", srcFile);
        auto clips = model.clipsJson();
        for (int i = 0; i < clips.size(); ++i) {
            auto edited = clips.at(i).toObject();
            if (edited.value("id") != "m") { continue; }
            edited.insert("currentAssetId", "asset-other");
            clips.replace(i, edited);
        }
        model.replaceClips(clips);
        QTRY_VERIFY(!item("remixApply")->property("enabled").toBool());
        QVERIFY(controller()->refusal().contains("changed"));
        // Applying refuses even when called directly.
        controller()->apply();
        QTest::qWait(100);
        QCOMPARE(controller()->state(), QString("ready"));
        QCOMPARE(clip("m").value("currentAssetId").toString(), QString("asset-other"));
        QVERIFY(backend->uploads.isEmpty());
    }
    void aTrimWhileTheDialogIsOpenIsNotOverwritten() {
        openMusic(false);
        openDialogReady();
        typeTarget("14");
        QTRY_COMPARE(controller()->targetMs(), 14000.0);
        QTRY_VERIFY(item("remixApply")->property("enabled").toBool());
        auto clips = model.clipsJson();
        for (int i = 0; i < clips.size(); ++i) {
            auto edited = clips.at(i).toObject();
            if (edited.value("id") != "m") { continue; }
            edited.insert("durationMs", 15000.0);
            clips.replace(i, edited);
        }
        model.replaceClips(clips);
        QTRY_VERIFY(!item("remixApply")->property("enabled").toBool());
        QVERIFY(controller()->refusal().contains("changed"));
    }
    void theClipContextMenuOpensRemixAndRevertsIt() {
        openMusic(false);
        QVERIFY(item("clip-m"));
        view->requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(view.get()));
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, visiblePoint(item("clip-m")));
        QTRY_VERIFY(item("registryMenu-clip-remixClip"));
        QVERIFY(item("registryMenu-clip-remixClip")->property("enabled").toBool());
        QVERIFY(!item("registryMenu-clip-revertRemix")->property("enabled").toBool());
        QCOMPARE(item("registryMenu-clip-remixClip")->property("text").toString(), QString("Remix…"));
        settle();
        click("registryMenu-clip-remixClip");
        QTRY_VERIFY(dialog()->property("visible").toBool());
        QTRY_COMPARE_WITH_TIMEOUT(controller()->state(), QString("ready"), 20000);
        QCOMPARE(controller()->clipId(), QString("m"));
        typeTarget("12");
        QTRY_COMPARE(controller()->targetMs(), 12000.0);
        QTest::mouseClick(view.get(), Qt::LeftButton, Qt::NoModifier, center(item("remixApply")));
        QTRY_VERIFY_WITH_TIMEOUT(!dialog()->property("visible").toBool(), 30000);
        QCOMPARE(clip("m").value("durationMs").toDouble(), 12000.0);
        // The menu now offers Revert, and clicking it restores the clip in one entry.
        QTest::mouseClick(view.get(), Qt::RightButton, Qt::NoModifier, visiblePoint(item("clip-m")));
        QTRY_VERIFY(item("registryMenu-clip-revertRemix"));
        QTRY_VERIFY(item("registryMenu-clip-revertRemix")->property("enabled").toBool());
        settle();
        const int base = model.undoStack()->count();
        click("registryMenu-clip-revertRemix");
        QTRY_COMPARE(model.undoStack()->count(), base + 1);
        QCOMPARE(clip("m").value("durationMs").toDouble(), 20000.0);
        QCOMPARE(clip("m").value("currentAssetId").toString(), QString("asset-src"));
    }
    void theClipMenusOfferRemixOnlyForAudio() {
        openMusic(false);
        gestures()->setSelection({"m"});
        const auto items = qmlEngine(view->rootObject())->singletonInstance<MenuRegistry*>("NodeTool.Timeline", "MenuRegistry")
            ->query("clip", {{"clipId", "m"}, {"clip", clip("m").toVariantMap()}, {"gestures", QVariant::fromValue<QObject*>(gestures())}, {"timeline", QVariant::fromValue<QObject*>(&model)}});
        bool remix = false, revert = false;
        for (const auto& value : items) {
            const auto entry = value.toMap();
            if (entry.value("action") == "remixClip") { remix = entry.value("enabled").toBool(); }
            if (entry.value("action") == "revertRemix") { revert = entry.value("enabled").toBool(); }
        }
        QVERIFY(remix);
        QVERIFY(!revert);
        const auto still = qmlEngine(view->rootObject())->singletonInstance<MenuRegistry*>("NodeTool.Timeline", "MenuRegistry")
            ->query("clip", {{"clipId", "i"}, {"gestures", QVariant::fromValue<QObject*>(gestures())}, {"timeline", QVariant::fromValue<QObject*>(&model)}});
        for (const auto& value : still) {
            if (value.toMap().value("action") == "remixClip") { QVERIFY(!value.toMap().value("enabled").toBool()); }
        }
    }
};
QTEST_MAIN(TestRemixUi)
#include "tst_remixui.moc"
