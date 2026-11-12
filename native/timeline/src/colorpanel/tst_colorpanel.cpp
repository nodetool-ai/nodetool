#include "color/ColorMatch.h"
#include "colorpanel/ColorMatchController.h"
#include "colorpanel/ScopesController.h"
#include "DockLayoutStore.h"
#include "edit/ClipGestureController.h"
#include "export/FrameCapture.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QDir>
#include <QElapsedTimer>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QPainter>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include <QtQuickTest/quicktest.h>
#include <QtTest>
#include <cmath>
#include <memory>

namespace {
QQuickItem* find(QQuickItem* root, const QString& name) {
    if (!root) return nullptr;
    if (root->objectName() == name) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = find(child, name)) return found;
    }
    return nullptr;
}
QQuickItem* button(QQuickItem* root, const QString& accessibleName) {
    if (!root) return nullptr;
    if (root->inherits("QQuickAbstractButton") && root->property("accessibleName").toString() == accessibleName) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = button(child, accessibleName)) return found;
    }
    return nullptr;
}
QQuickItem* toggle(QQuickItem* root) {
    if (!root) return nullptr;
    if (root->inherits("QQuickSwitch") || root->inherits("QQuickCheckBox")) return root;
    for (auto* child : root->childItems()) {
        if (auto* found = toggle(child)) return found;
    }
    return nullptr;
}
QJsonObject clipJson(const QString& id, double start, double duration, const QString& path = {}) {
    QJsonObject clip{{"id", id}, {"name", id}, {"trackId", "v"}, {"mediaType", "image"}, {"sourceType", "imported"},
        {"status", "generated"}, {"locked", false}, {"versions", QJsonArray{}}, {"startMs", start}, {"durationMs", duration},
        {"width", 640}, {"height", 360}};
    if (!path.isEmpty()) clip.insert("mediaPath", path);
    return clip;
}
QJsonObject documentOf(const QJsonArray& clips) {
    return {{"id", "color"}, {"projectId", "p"}, {"name", "Color"}, {"width", 640}, {"height", 360}, {"fps", 30}, {"durationMs", 4000},
        {"markers", QJsonArray{}}, {"createdAt", "2026-01-01T00:00:00Z"}, {"updatedAt", "2026-01-01T00:00:00Z"},
        {"tracks", QJsonArray{QJsonObject{{"id", "v"}, {"type", "video"}, {"name", "Video"}, {"index", 0}, {"visible", true}, {"locked", false}}}},
        {"clips", clips}};
}
// A scene with tone and color, so a known grade is visible in every tonal range.
QImage scene(int red = 0, int blue = 0) {
    QImage image(640, 360, QImage::Format_RGBA8888);
    for (int y = 0; y < image.height(); ++y) {
        auto* row = image.scanLine(y);
        for (int x = 0; x < image.width(); ++x) {
            const double t = double(x) / (image.width() - 1);
            int r = int(20 + 200 * t), g = int(20 + 190 * t), b = int(30 + 170 * t);
            if (y < 120) { g = int(g * 1.1); r = int(r * 0.7); }
            if (y > 240) { b = int(b * 1.15); r = int(r * 0.85); }
            row[x * 4] = uchar(std::clamp(r + red, 0, 255));
            row[x * 4 + 1] = uchar(std::clamp(g, 0, 255));
            row[x * 4 + 2] = uchar(std::clamp(b + blue, 0, 255));
            row[x * 4 + 3] = 255;
        }
    }
    return image;
}
double meanOf(const QJsonObject& numbers, const char* channel) {
    return numbers.value("stats").toObject().value(QLatin1String(channel)).toObject().value("mean").toDouble();
}
struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    explicit Editor(const QJsonArray& clips) {
        auto parsed = nt::parseTimeline(documentOf(clips));
        if (!parsed.timeline) { error = "Invalid test document"; return; }
        model.setTimeline(std::move(*parsed.timeline));
        clock.setFps(30);
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1500}, {"height", 950}}));
        error = component.errorString();
        if (!object) return;
        capture()->setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        window.resize(1500, 950);
        qobject_cast<QQuickItem*>(object.get())->setParentItem(window.contentItem());
        window.show();
        if (!QTest::qWaitForWindowExposed(&window)) { error = "The window did not expose"; object.reset(); return; }
        settle();
    }
    FrameCapture* capture() const { return object->property("frameCapture").value<FrameCapture*>(); }
    DockLayoutStore* store() const { return object->findChild<DockLayoutStore*>("dockLayoutStore"); }
    void settle() {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        QCoreApplication::processEvents();
    }
    QQuickItem* item(const QString& name) {
        settle();
        return find(window.contentItem(), name);
    }
    void select(const QString& id) {
        object->findChild<ClipGestureController*>("clipGestures")->setSelection({id});
        settle();
    }
    void workspace(const QString& name) {
        const auto names = store()->property("workspaces").toStringList();
        store()->switchWorkspace(names.indexOf(name));
        settle();
    }
    QJsonArray effects(const QString& id = "a") const {
        for (const auto& clip : model.clipsJson()) {
            if (clip.toObject().value("id") == id) return clip.toObject().value("effects").toArray();
        }
        return {};
    }
    QJsonObject effectOf(const QString& type, const QString& id = "a") const {
        for (const auto& effect : effects(id)) {
            if (effect.toObject().value("type") == type) return effect.toObject();
        }
        return {};
    }
    // Brings an item in the panel's Flickable into view and returns its center in the scene.
    QPoint reveal(QQuickItem* target, const QPointF& local) {
        auto* viewport = item("colorPanelViewport");
        const auto y = target->mapToItem(viewport, QPointF{}).y();
        const double maximum = std::max(0.0, viewport->property("contentHeight").toDouble() - viewport->height());
        viewport->setProperty("contentY", std::clamp(viewport->property("contentY").toDouble() + y - 10, 0.0, maximum));
        settle();
        return target->mapToScene(local).toPoint();
    }
    void grab(const QString& name) {
        const auto directory = qEnvironmentVariable("NT_COLOR_SHOTS");
        if (directory.isEmpty()) return;
        QDir().mkpath(directory);
        QTest::qWait(250);
        window.grabWindow().save(directory + "/" + name + ".png");
    }
};
}

class TestColorPanel : public QObject {
    Q_OBJECT
    QTemporaryDir directory;
    QString image(const QString& name, const QImage& picture) {
        const auto path = directory.filePath(name + ".png");
        // Without an alpha channel, which the decoder rejects and draws as a placeholder.
        return picture.convertToFormat(QImage::Format_RGB888).save(path) ? path : QString();
    }
private slots:
    void initTestCase() {
        QVERIFY(directory.isValid());
        qputenv("NODETOOL_TIMELINE_PREFERENCES", QFile::encodeName(directory.filePath("ui.ini")));
    }
    void cleanup() { QFile::remove(directory.filePath("ui.ini")); }

    void isolatedClipKeepsOnlyTheShot() {
        auto a = clipJson("a", 0, 1000);
        a.insert("transform", QJsonObject{{"scale", 2}});
        a.insert("opacity", 0.5);
        a.insert("blendMode", "multiply");
        a.insert("parentId", "g");
        a.insert("hidden", true);
        a.insert("transitionIn", QJsonObject{{"type", "fade"}});
        a.insert("animations", QJsonArray{QJsonObject{{"id", "x"}}});
        a.insert("crop", QJsonObject{{"left", 0.1}});
        const auto document = nt::colorpanel::isolatedClipDocument(documentOf({a, clipJson("b", 1000, 1000)}), "a", QJsonArray{});
        const auto clips = document.value("clips").toArray();
        QCOMPARE(clips.size(), 1);
        const auto clip = clips[0].toObject();
        QCOMPARE(clip.value("id").toString(), QString("a"));
        for (const auto* field : {"transform", "opacity", "blendMode", "parentId", "hidden", "transitionIn", "animations"}) {
            QVERIFY2(!clip.contains(QLatin1String(field)), field);
        }
        QVERIFY(clip.contains("crop"));
        QCOMPARE(document.value("tracks").toArray().size(), 1);
    }

    void emptyStates() {
        auto audio = clipJson("sound", 1000, 1000);
        audio.insert("mediaType", "audio");
        Editor e({clipJson("a", 0, 1000), audio});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        auto* empty = e.item("colorPanelEmpty");
        QVERIFY(empty);
        QTRY_VERIFY(empty->isVisible());
        QVERIFY(!e.item("colorPanelViewport")->isVisible());
        e.select("sound");
        QTRY_VERIFY(empty->isVisible());
        e.select("a");
        QTRY_VERIFY(!empty->isVisible());
        QVERIFY(e.item("colorPanelViewport")->isVisible());
    }

    void wheelDragIsOneUndoEntry() {
        Editor e({clipJson("a", 0, 1000)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* dial = e.item("colorWheelDial_gain");
        QVERIFY(dial);
        QTRY_VERIFY(dial->width() > 40);
        const auto at = e.reveal(dial, QPointF(dial->width() / 2, dial->height() / 2));
        const auto documentBefore = e.model.documentJson();
        const int undoBefore = e.model.undoStack()->count();
        QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, at);
        for (int step = 1; step <= 6; ++step) {
            QTest::mouseMove(&e.window, at + QPoint(step * 4, -step * 2));
            e.settle();
        }
        // A preview changes the picture and adds no entry.
        QCOMPARE(e.model.undoStack()->count(), undoBefore);
        QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, at + QPoint(24, -12));
        e.settle();
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 1);
        e.grab("color-panel-wheels");
        const auto effect = e.effectOf("liftGammaGain");
        QVERIFY(!effect.isEmpty());
        QVERIFY(effect.value("enabled").toBool());
        const auto gain = effect.value("gain").toArray();
        QCOMPARE(gain.size(), 3);
        QVERIFY2(gain[0].toDouble() != 1 || gain[1].toDouble() != 1, qPrintable(QJsonDocument(gain).toJson()));
        QCOMPARE(effect.value("lift").toArray()[0].toDouble(), 0.0);
        QCOMPARE(effect.value("gamma").toArray()[0].toDouble(), 1.0);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), documentBefore);
        e.model.undoStack()->redo();
        QCOMPARE(e.effectOf("liftGammaGain").value("gain").toArray(), gain);
        // A held arrow key is one entry on release, and Escape takes a held key back.
        dial->forceActiveFocus();
        e.settle();
        const auto beforeKeys = e.effectOf("liftGammaGain").value("gain").toArray();
        const int undoBeforeKeys = e.model.undoStack()->index();
        for (int repeat = 0; repeat < 5; ++repeat) {
            QTest::keyPress(&e.window, Qt::Key_Right);
            e.settle();
        }
        QCOMPARE(e.model.undoStack()->index(), undoBeforeKeys);
        QTest::keyRelease(&e.window, Qt::Key_Right);
        e.settle();
        QCOMPARE(e.model.undoStack()->index(), undoBeforeKeys + 1);
        const auto afterKeys = e.effectOf("liftGammaGain").value("gain").toArray();
        QVERIFY(afterKeys != beforeKeys);
        QTest::keyPress(&e.window, Qt::Key_Up);
        e.settle();
        QVERIFY(e.effectOf("liftGammaGain").value("gain").toArray() != afterKeys);
        QTest::keyClick(&e.window, Qt::Key_Escape);
        e.settle();
        QCOMPARE(e.effectOf("liftGammaGain").value("gain").toArray(), afterKeys);
        QTest::keyRelease(&e.window, Qt::Key_Up);
        e.settle();
        QCOMPARE(e.model.undoStack()->index(), undoBeforeKeys + 1);
        // A click changes nothing, and a double click on the wheel resets it as one entry.
        const int undoAfter = e.model.undoStack()->count();
        const auto again = e.reveal(dial, QPointF(dial->width() / 2, dial->height() / 2));
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, again);
        e.settle();
        QCOMPARE(e.model.undoStack()->count(), undoAfter);
        QTest::qWait(600);
        QTest::mouseDClick(&e.window, Qt::LeftButton, Qt::NoModifier, again);
        e.settle();
        QCOMPARE(e.model.undoStack()->count(), undoAfter + 1);
        const auto reset = e.effectOf("liftGammaGain").value("gain").toArray();
        QVERIFY2(std::abs(reset[0].toDouble() - 1) < 0.001, qPrintable(QJsonDocument(reset).toJson()));
    }

    void basicSliderWritesTheInspectorEffect() {
        Editor e({clipJson("a", 0, 1000)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* row = e.item("colorBasic_temperature");
        QVERIFY(row);
        QTRY_VERIFY(row->width() > 100);
        // The slider sits between the label and the value.
        const auto at = e.reveal(row, QPointF(row->width() * 0.7, row->height() / 2));
        const int undoBefore = e.model.undoStack()->count();
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, at);
        QTRY_COMPARE(e.model.undoStack()->count(), undoBefore + 1);
        const auto effect = e.effectOf("color");
        QCOMPARE(effect.value("id").toString(), QString("inspector:color"));
        QVERIFY(effect.value("enabled").toBool());
        QVERIFY(effect.value("temperature").toDouble() > 0);
    }

    void sectionSwitchAndReset() {
        Editor e({clipJson("a", 0, 1000)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* section = e.item("colorVignetteSection");
        QVERIFY(section);
        QTRY_VERIFY(section->width() > 100);
        auto* control = toggle(section);
        QVERIFY(control);
        const int undoBefore = e.model.undoStack()->count();
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(control, QPointF(control->width() / 2, control->height() / 2)));
        e.settle();
        // Off on an untouched section keeps a disabled effect that changes nothing.
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 1);
        auto effect = e.effectOf("vignette");
        QVERIFY(!effect.value("enabled").toBool(true));
        QCOMPARE(effect.value("amount").toDouble(), 0.0);
        QVERIFY(e.item("colorVignette_amount")->property("disabled").toBool());
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(control, QPointF(control->width() / 2, control->height() / 2)));
        e.settle();
        QVERIFY(e.effectOf("vignette").value("enabled").toBool());
        auto* reset = button(section, "Reset Vignette");
        QVERIFY(reset);
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(reset, QPointF(reset->width() / 2, reset->height() / 2)));
        e.settle();
        QVERIFY(e.effectOf("vignette").isEmpty());
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 3);
    }

    void lightRowsWriteTheExposureEffect() {
        Editor e({clipJson("a", 0, 1000)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* blacks = e.item("colorBasic_blacks");
        QVERIFY(blacks);
        QTRY_VERIFY(blacks->width() > 100);
        // The Premiere order of the tone rows.
        double previous = -1;
        for (const auto* key : {"exposure", "contrast", "highlights", "shadows", "whites", "blacks"}) {
            auto* row = e.item(QString("colorBasic_") + key);
            QVERIFY2(row, key);
            const double y = row->mapToScene(QPointF{}).y();
            QVERIFY2(y > previous, key);
            previous = y;
        }
        const int undoBefore = e.model.undoStack()->count();
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(blacks, QPointF(blacks->width() * 0.7, blacks->height() / 2)));
        QTRY_COMPARE(e.model.undoStack()->count(), undoBefore + 1);
        const auto exposure = e.effectOf("exposure");
        QVERIFY(exposure.value("enabled").toBool());
        QVERIFY(exposure.value("blacks").toDouble() > 0);
        QCOMPARE(exposure.value("exposure").toDouble(), 0.0);
        QVERIFY(e.effectOf("color").isEmpty());
        QVERIFY(std::abs(e.item("colorBasic_blacks")->property("value").toDouble() - exposure.value("blacks").toDouble()) < 1e-9);
        // The section switch turns the color and exposure effects off in one edit.
        auto* control = toggle(e.item("colorBasicSection"));
        QVERIFY(control);
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(control, QPointF(control->width() / 2, control->height() / 2)));
        e.settle();
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 2);
        QVERIFY(!e.effectOf("exposure").value("enabled").toBool(true));
        QVERIFY(!e.effectOf("color").value("enabled").toBool(true));
        QVERIFY(e.item("colorBasic_exposure")->property("disabled").toBool());
    }

    void roundnessCurvesAndTheFxButton() {
        auto a = clipJson("a", 0, 1000);
        a.insert("name", "Interview A");
        a.insert("effects", QJsonArray{QJsonObject{{"id", "soft"}, {"type", "blur"}, {"enabled", true}, {"radius", 3}},
            QJsonObject{{"id", "tone"}, {"type", "curves"}, {"enabled", false}, {"master", QJsonArray{}}},
            QJsonObject{{"id", "edge"}, {"type", "vignette"}, {"enabled", true}, {"amount", 0.3}, {"softness", 0.5}, {"roundness", -0.5}}});
        Editor e({a});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* scope = e.item("colorPanelScope");
        QVERIFY(scope);
        QCOMPARE(scope->property("text").toString(), QString("Interview A"));
        auto* roundness = e.item("colorVignette_roundness");
        QVERIFY(roundness);
        QCOMPARE(roundness->property("min").toDouble(), -1.0);
        QCOMPARE(roundness->property("value").toDouble(), -0.5);
        QCOMPARE(roundness->property("display").toString(), QString("-50"));
        // Hue Saturation Curves: one editor per curve, written to one hueSatCurves effect after the curves.
        for (const auto* key : {"hueVsSat", "hueVsHue", "hueVsLuma", "lumaVsSat", "satVsSat"}) {
            QVERIFY2(e.item(QString("colorHueSat_") + key), key);
        }
        const QVariantMap change{{"lumaVsSat", QVariantList{QVariantMap{{"x", 0}, {"y", 0.5}}, QVariantMap{{"x", 1}, {"y", 0.2}}}}};
        QVERIFY(QMetaObject::invokeMethod(e.item("colorPanel"), "writeSection", Q_ARG(QVariant, "hueSatCurves"),
            Q_ARG(QVariant, QVariant(change)), Q_ARG(QVariant, "apply")));
        e.settle();
        auto effects = e.effects();
        QCOMPARE(effects.size(), 4);
        QCOMPARE(effects[2].toObject().value("type").toString(), QString("hueSatCurves"));
        QCOMPARE(effects[2].toObject().value("lumaVsSat").toArray().size(), 2);
        const auto points = e.item("colorHueSat_lumaVsSat")->property("points").toList();
        QCOMPARE(points.size(), 2);
        QCOMPARE(points[1].toMap().value("y").toDouble(), 0.2);
        // fx turns every grade effect off in one edit and leaves the blur alone. On again turns them all on.
        auto* fx = e.item("colorPanelFx");
        QVERIFY(fx);
        QVERIFY(fx->property("active").toBool());
        const int undoBefore = e.model.undoStack()->count();
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(fx, QPointF(fx->width() / 2, fx->height() / 2)));
        e.settle();
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 1);
        effects = e.effects();
        QVERIFY(effects[0].toObject().value("enabled").toBool());
        for (int i = 1; i < effects.size(); ++i) { QVERIFY(!effects[i].toObject().value("enabled").toBool(true)); }
        QVERIFY(!fx->property("active").toBool());
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(fx, QPointF(fx->width() / 2, fx->height() / 2)));
        e.settle();
        for (const auto& effect : e.effects()) { QVERIFY(effect.toObject().value("enabled").toBool()); }
        e.grab("color-panel-curves-fx");
    }

    void newEffectsFollowThePanelOrderAndKeepOthers() {
        auto a = clipJson("a", 0, 1000);
        a.insert("effects", QJsonArray{QJsonObject{{"id", "soft"}, {"type", "blur"}, {"enabled", true}, {"radius", 3}},
            QJsonObject{{"id", "edge"}, {"type", "vignette"}, {"enabled", true}, {"amount", 0.2}, {"softness", 0.3}, {"custom", "keep"}}});
        Editor e({a});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* dial = e.item("colorWheelDial_lift");
        QVERIFY(dial);
        QTRY_VERIFY(dial->width() > 40);
        const QVariantMap change{{"lift", QVariantList{0.1, 0, 0}}};
        QVERIFY(QMetaObject::invokeMethod(e.item("colorPanel"), "writeSection", Q_ARG(QVariant, "liftGammaGain"),
            Q_ARG(QVariant, QVariant(change)), Q_ARG(QVariant, "apply")));
        e.settle();
        const auto effects = e.effects();
        QCOMPARE(effects.size(), 3);
        QCOMPARE(effects[0].toObject().value("type").toString(), QString("blur"));
        QCOMPARE(effects[1].toObject().value("type").toString(), QString("liftGammaGain"));
        QCOMPARE(effects[2].toObject().value("custom").toString(), QString("keep"));
    }

    void lockedClipDisablesEditing() {
        auto a = clipJson("a", 0, 1000);
        a.insert("locked", true);
        Editor e({a});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("a");
        auto* dial = e.item("colorWheelDial_gain");
        QVERIFY(dial);
        QTRY_VERIFY(dial->width() > 40);
        const auto before = e.model.documentJson();
        const auto at = e.reveal(dial, QPointF(dial->width() / 2, dial->height() / 2));
        QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, at);
        QTest::mouseMove(&e.window, at + QPoint(20, 0));
        QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, at + QPoint(20, 0));
        e.settle();
        QCOMPARE(e.model.documentJson(), before);
        QVERIFY(!e.item("colorMatchRun")->isEnabled());
    }

    void scopesRunOnlyWhileShown() {
        const auto path = image("scene-only", scene());
        Editor e({clipJson("a", 0, 2000, path)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        auto* panel = e.item("scopesPanel");
        QVERIFY(panel);
        auto* scopes = panel->findChild<ScopesController*>("scopesController");
        QVERIFY(scopes);
        QTRY_VERIFY_WITH_TIMEOUT(scopes->active(), 3000);
        QTRY_VERIFY_WITH_TIMEOUT(scopes->hasFrame(), 60000);
        QVERIFY2(scopes->error().isEmpty(), qPrintable(scopes->error()));
        QVERIFY(!scopes->waveform().isNull());
        QVERIFY(!scopes->parade().isNull());
        QVERIFY(!scopes->vectorscope().isNull());
        QVERIFY(!scopes->histogram().isNull());
        QVERIFY(scopes->lastComputeThreadForTest() != QThread::currentThreadId());
        e.grab("scopes-color-workspace");
        // A scope turned off is not computed.
        auto* parade = e.item("scopesShow_parade");
        QVERIFY(parade);
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, parade->mapToScene(QPointF(parade->width() / 2, parade->height() / 2)).toPoint());
        QTRY_VERIFY(scopes->parade().isNull());
        QVERIFY(!scopes->waveform().isNull());
        // Another workspace leaves the tab hidden, so the helper gets no work.
        e.workspace("Editing");
        const int computed = scopes->computedFramesForTest();
        e.settle();
        QVERIFY(!scopes->active());
        e.clock.seek(1000);
        QTest::qWait(300);
        QCOMPARE(scopes->computedFramesForTest(), computed);
        QCOMPARE(e.capture()->pending(), 0);
    }

    void scopeWorkLeavesTheModelAndGuiAlone() {
        const auto path = image("scene-play", scene());
        TimelineModel model;
        auto parsed = nt::parseTimeline(documentOf({clipJson("a", 0, 4000, path)}));
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        clock.setFps(30);
        clock.setDurationMs(4000);
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ScopesController scopes;
        scopes.setCapture(&capture);
        scopes.setClock(&clock);
        scopes.setPlayingIntervalMs(50);
        scopes.setActive(true);
        QTRY_VERIFY_WITH_TIMEOUT(scopes.hasFrame(), 60000);

        const auto documentBefore = model.documentJson();
        const auto generation = model.documentGeneration();
        const int undoBefore = model.undoStack()->count();
        QSignalSpy timelineChanged(&model, &TimelineModel::timelineChanged);
        QSignalSpy clipsChanged(&model, &TimelineModel::clipsChanged);
        QSignalSpy previewChanged(&model, &TimelineModel::previewChanged);
        QSignalSpy markersChanged(&model, &TimelineModel::markersChanged);
        // The longest gap between ticks of a 2 ms timer is how long the GUI thread was held.
        QElapsedTimer sinceBeat;
        qint64 worstGap = 0;
        QTimer heartbeat;
        heartbeat.setInterval(2);
        connect(&heartbeat, &QTimer::timeout, this, [&] {
            worstGap = std::max(worstGap, sinceBeat.restart());
        });
        const int computedBefore = scopes.computedFramesForTest();
        sinceBeat.start();
        heartbeat.start();

        // Playing.
        clock.play();
        QElapsedTimer elapsed;
        elapsed.start();
        while (elapsed.elapsed() < 2000) {
            clock.tick();
            QTest::qWait(16);
        }
        clock.pause();
        const int whilePlaying = scopes.computedFramesForTest() - computedBefore;
        QVERIFY2(whilePlaying >= 3, qPrintable(QString::number(whilePlaying)));
        // Paused: seeks.
        for (int ms : {100, 700, 1300, 1900}) {
            clock.seek(ms);
            const int seen = scopes.computedFramesForTest();
            QTRY_VERIFY_WITH_TIMEOUT(scopes.computedFramesForTest() > seen, 15000);
        }
        heartbeat.stop();
        qInfo().noquote() << "Scope work:" << whilePlaying << "frames during 2 s of playback, longest GUI gap" << worstGap << "ms";
        QCOMPARE(timelineChanged.count(), 0);
        QCOMPARE(clipsChanged.count(), 0);
        QCOMPARE(previewChanged.count(), 0);
        QCOMPARE(markersChanged.count(), 0);
        QCOMPARE(model.documentJson(), documentBefore);
        QCOMPARE(model.documentGeneration(), generation);
        QCOMPARE(model.undoStack()->count(), undoBefore);
        QVERIFY(scopes.lastComputeThreadForTest() != QThread::currentThreadId());
        // The shared machine adds scheduling delay, so this bound is far above one frame of work.
        QVERIFY2(worstGap < 250, qPrintable(QString::number(worstGap)));
    }

    void gradedFrameReachesTheScopes() {
        const auto path = image("scene-numbers", scene());
        auto a = clipJson("a", 0, 2000, path);
        TimelineModel model;
        auto parsed = nt::parseTimeline(documentOf({a}));
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ScopesController scopes;
        scopes.setCapture(&capture);
        QJsonObject before, after, invalid;
        scopes.readNumbers(500, {}, [&](const QJsonObject& numbers) { before = numbers; });
        QTRY_VERIFY_WITH_TIMEOUT(!before.isEmpty(), 60000);
        QVERIFY2(!before.contains("error"), qPrintable(before.value("error").toString()));
        QCOMPARE(before.value("timeMs").toDouble(), 500.0);
        QVERIFY(before.contains("waveform") && before.contains("parade") && before.contains("histogram") && before.contains("vectorscope"));
        QVERIFY(model.applyEdit("patchClip", {{"clipId", "a"}, {"patch", QJsonObject{{"effects", QJsonArray{QJsonObject{
            {"id", "g"}, {"type", "liftGammaGain"}, {"enabled", true}, {"lift", QJsonArray{0, 0, 0}},
            {"gamma", QJsonArray{1, 1, 1}}, {"gain", QJsonArray{0.5, 1, 1}}}}}}}}));
        scopes.readNumbers(500, {}, [&](const QJsonObject& numbers) { after = numbers; });
        QTRY_VERIFY_WITH_TIMEOUT(!after.isEmpty(), 60000);
        // Half the red gain halves the mean red. Green stays put.
        QVERIFY2(std::abs(meanOf(after, "r") - meanOf(before, "r") / 2) < 1.5, qPrintable(QString::number(meanOf(after, "r"))));
        QVERIFY(std::abs(meanOf(after, "g") - meanOf(before, "g")) < 0.5);
        nt::scopes::NumbersOptions options;
        options.scopes = QStringList{"nonsense"};
        scopes.readNumbers(500, options, [&](const QJsonObject& numbers) { invalid = numbers; });
        QTRY_VERIFY_WITH_TIMEOUT(!invalid.isEmpty(), 60000);
        QVERIFY(invalid.contains("error"));
    }

    void cpuModelAgreesWithTheRenderer() {
        const auto path = image("scene-model", scene());
        const QJsonArray effects{
            QJsonObject{{"id", "w"}, {"type", "liftGammaGain"}, {"enabled", true}, {"lift", QJsonArray{0.03, -0.02, 0.01}}, {"gamma", QJsonArray{1.2, 0.9, 1.1}}, {"gain", QJsonArray{0.9, 1.05, 1.1}}},
            QJsonObject{{"id", "c"}, {"type", "curves"}, {"enabled", true}, {"master", QJsonArray{QJsonObject{{"x", 0}, {"y", 0}}, QJsonObject{{"x", 0.5}, {"y", 0.56}}, QJsonObject{{"x", 1}, {"y", 1}}}}},
            QJsonObject{{"id", "e"}, {"type", "vignette"}, {"enabled", true}, {"amount", 0.5}, {"radius", 0.9}, {"softness", 0.5}, {"centerX", 0.35}, {"centerY", 0.65}, {"roundness", 1}},
            QJsonObject{{"id", "inspector:color"}, {"type", "color"}, {"enabled", true}, {"saturation", 1.2}, {"brightness", 0.02}, {"contrast", 1.05}, {"temperature", 0.1}, {"tint", -0.05}, {"shadows", 0.1}, {"highlights", -0.1}, {"hue", 4}}};
        auto a = clipJson("a", 0, 2000, path);
        TimelineModel model;
        auto parsed = nt::parseTimeline(documentOf({a}));
        QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        QImage plain, graded;
        capture.captureSequence(500, [&](const FrameCaptureResult& result) { plain = result.image; QVERIFY2(result.ok(), qPrintable(result.error)); });
        QTRY_VERIFY_WITH_TIMEOUT(!plain.isNull(), 60000);
        QVERIFY(model.applyEdit("patchClip", {{"clipId", "a"}, {"patch", QJsonObject{{"effects", effects}}}}));
        capture.captureSequence(500, [&](const FrameCaptureResult& result) { graded = result.image; QVERIFY2(result.ok(), qPrintable(result.error)); });
        QTRY_VERIFY_WITH_TIMEOUT(!graded.isNull(), 60000);
        const auto modelled = nt::color::applyGrade(plain, effects).convertToFormat(QImage::Format_RGBA8888);
        const auto rendered = graded.convertToFormat(QImage::Format_RGBA8888);
        QCOMPARE(modelled.size(), rendered.size());
        double sum = 0;
        int worst = 0;
        for (int y = 0; y < rendered.height(); ++y) {
            const auto* m = modelled.constScanLine(y);
            const auto* r = rendered.constScanLine(y);
            for (int x = 0; x < rendered.width() * 4; ++x) {
                if (x % 4 == 3) continue;
                const int delta = std::abs(int(m[x]) - int(r[x]));
                sum += delta;
                worst = std::max(worst, delta);
            }
        }
        const double mean = sum / (rendered.width() * rendered.height() * 3);
        qInfo().noquote() << "CPU model against the render: mean" << mean << "worst" << worst << "of 255";
        QVERIFY2(mean < 1.5, qPrintable(QString::number(mean)));
    }

    void matchFallsAndIsOneUndoEntry() {
        // The same picture with a known cast: red +28, blue -22.
        const auto reference = image("match-reference", scene());
        const auto current = image("match-current", scene(28, -22));
        Editor e({clipJson("a", 0, 1000, current), clipJson("r", 1000, 1000, reference)});
        QVERIFY2(e.object, qPrintable(e.error));
        e.workspace("Color");
        e.select("r");
        auto* panel = e.item("colorPanel");
        QVERIFY(panel);
        auto* matcher = panel->findChild<ColorMatchController*>("colorMatchController");
        QVERIFY(matcher);
        auto* useShot = e.item("colorMatchUseShot");
        QVERIFY(useShot);
        QTRY_VERIFY(useShot->width() > 20);
        const auto clickNamed = [&](const QString& name) {
            auto* target = e.item(name);
            QVERIFY(target);
            QTRY_VERIFY(target->isEnabled());
            QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(target, QPointF(target->width() / 2, target->height() / 2)));
            e.settle();
        };
        clickNamed("colorMatchUseShot");
        QTRY_VERIFY_WITH_TIMEOUT(matcher->hasReference(), 60000);
        QVERIFY2(matcher->error().isEmpty(), qPrintable(matcher->error()));
        QCOMPARE(matcher->referenceClipName(), QString("r"));
        // The picture itself, not a placeholder for media that failed to open.
        QVERIFY2(nt::color::meanColorDifference(matcher->referenceImage(), scene()) < 0.005,
            qPrintable(QString::number(nt::color::meanColorDifference(matcher->referenceImage(), scene()))));

        // The reference clip itself cannot be matched to itself.
        clickNamed("colorMatchRun");
        QTRY_VERIFY(!matcher->error().isEmpty());
        QVERIFY(e.effects("r").isEmpty());

        e.select("a");
        QVERIFY(matcher->error().isEmpty());
        const auto documentBefore = e.model.documentJson();
        const int undoBefore = e.model.undoStack()->count();
        QSignalSpy matched(matcher, &ColorMatchController::matched);
        const auto picture = [&] {
            QImage graded;
            bool done = false;
            e.capture()->captureSequence(500, [&](const FrameCaptureResult& result) { graded = result.image; done = true; });
            QTest::qWaitFor([&] { return done; }, 60000);
            return graded;
        };
        const auto referencePicture = scene();
        const double before = nt::color::meanColorDifference(scene(28, -22), referencePicture);
        QVERIFY2(before > 0.02, qPrintable(QString::number(before)));

        // By default skin tones limit the shift, and this picture's warm band reads as skin.
        clickNamed("colorMatchRun");
        QTRY_VERIFY_WITH_TIMEOUT(matched.count() == 1, 120000);
        QVERIFY2(matcher->error().isEmpty(), qPrintable(matcher->error()));
        // One action, one entry.
        QCOMPARE(e.model.undoStack()->count(), undoBefore + 1);
        const auto wheels = e.effectOf("liftGammaGain");
        QVERIFY(!wheels.isEmpty());
        QVERIFY(wheels.value("enabled").toBool());
        e.grab("color-panel-after-match");
        const double protectedAfter = nt::color::meanColorDifference(picture(), referencePicture);
        qInfo().noquote() << "Match with skin protection: mean color difference" << before << "before," << protectedAfter
                          << "after, in the render." << matcher->status();
        QVERIFY2(protectedAfter <= before * 0.5, qPrintable(QString("%1 %2").arg(before).arg(protectedAfter)));
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), documentBefore);

        // The switch is a real control, and without it the stated amount is 75 percent.
        auto* protect = toggle(e.item("colorMatchProtectSkin"));
        QVERIFY(protect);
        QTest::mouseClick(&e.window, Qt::LeftButton, Qt::NoModifier, e.reveal(protect, QPointF(protect->width() / 2, protect->height() / 2)));
        e.settle();
        QVERIFY(!matcher->protectSkin());
        const int undoNext = e.model.undoStack()->index();
        clickNamed("colorMatchRun");
        QTRY_VERIFY_WITH_TIMEOUT(matched.count() == 2, 120000);
        QCOMPARE(e.model.undoStack()->index(), undoNext + 1);
        const double after = nt::color::meanColorDifference(picture(), referencePicture);
        qInfo().noquote() << "Match: mean color difference" << before << "before," << after << "after, in the render. Solver:"
                          << matcher->lastDifferenceBefore() << matcher->lastDifferenceAfter() << matcher->status();
        QVERIFY2(after <= before * 0.25, qPrintable(QString("%1 %2").arg(before).arg(after)));
        e.model.undoStack()->undo();
        QCOMPARE(e.model.documentJson(), documentBefore);
    }

    void matchHoldsWithAVignetteAndATrackEffect() {
        // The shot sits on a brightened track with a vignette of its own, so its correction runs
        // before both. The reference is the same picture and vignette on a plain track.
        const auto reference = image("chain-reference", scene());
        const auto current = image("chain-current", scene(24, -18));
        const QJsonArray edge{QJsonObject{{"id", "edge"}, {"type", "vignette"}, {"enabled", true}, {"amount", 0.3}, {"radius", 0.9}, {"softness", 0.5}}};
        auto a = clipJson("a", 0, 1000, current);
        a.insert("trackId", "w");
        a.insert("effects", edge);
        auto r = clipJson("r", 1000, 1000, reference);
        r.insert("effects", edge);
        auto raw = documentOf({a, r});
        auto tracks = raw.value("tracks").toArray();
        tracks.append(QJsonObject{{"id", "w"}, {"type", "video"}, {"name", "Graded"}, {"index", 1}, {"visible", true}, {"locked", false},
            {"effects", QJsonArray{QJsonObject{{"id", "cc"}, {"type", "colorCorrection"}, {"enabled", true}, {"brightness", 0.08}}}}});
        raw.insert("tracks", tracks);
        TimelineModel model;
        auto parsed = nt::parseTimeline(raw);
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        clock.setFps(30);
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ColorMatchController matcher;
        matcher.setCapture(&capture);
        matcher.setClock(&clock);
        matcher.setProtectSkin(false);
        matcher.setClipId("r");
        matcher.useSelectedShot();
        QTRY_VERIFY_WITH_TIMEOUT(matcher.hasReference(), 60000);
        const auto frameAt = [&](double ms) {
            QImage out;
            bool done = false;
            capture.captureSequence(ms, [&](const FrameCaptureResult& result) { out = result.image; done = true; });
            QTest::qWaitFor([&] { return done; }, 60000);
            return out;
        };
        const auto target = frameAt(1500);
        const double before = nt::color::meanColorDifference(frameAt(500), target);
        matcher.setClipId("a");
        QSignalSpy matched(&matcher, &ColorMatchController::matched);
        matcher.match();
        QTRY_VERIFY_WITH_TIMEOUT(matched.count() == 1, 120000);
        const double after = nt::color::meanColorDifference(frameAt(500), target);
        qInfo().noquote() << "Match through a vignette and a track effect:" << before << "before," << after << "after, in the render. Solver:"
                          << matcher.lastDifferenceBefore() << matcher.lastDifferenceAfter();
        QVERIFY2(before > 0.02, qPrintable(QString::number(before)));
        QVERIFY2(after <= before * 0.25, qPrintable(QString("%1 %2").arg(before).arg(after)));
        // The solver's forecast is what the renderer drew.
        QVERIFY2(std::abs(matcher.lastDifferenceAfter() - after) < 0.01, qPrintable(QString("%1 %2").arg(matcher.lastDifferenceAfter()).arg(after)));
        // The wheels run before the clip's vignette.
        const auto effects = model.clipsJson()[0].toObject().value("effects").toArray();
        QCOMPARE(effects[0].toObject().value("type").toString(), QString("liftGammaGain"));
        QCOMPARE(effects[1].toObject().value("type").toString(), QString("vignette"));
    }

    void aTrackKeyStaysInThePicture() {
        // Two identical shots on a keyed track already match. Keying only one of them would read
        // the green as part of the picture and grade the subject for nothing.
        QImage keyed(640, 360, QImage::Format_RGB888);
        keyed.fill(QColor(0, 255, 0));
        QPainter(&keyed).drawImage(QRect(160, 0, 320, 360), scene());
        const auto path = image("keyed", keyed);
        auto a = clipJson("a", 0, 1000, path);
        auto r = clipJson("r", 1000, 1000, path);
        auto raw = documentOf({a, r});
        const QJsonObject key{{"id", "key"}, {"type", "chromaKey"}, {"enabled", true}, {"keyColor", "#00ff00"}, {"tolerance", 0.2}, {"softness", 0.1}, {"spill", 0.5}};
        auto tracks = raw.value("tracks").toArray();
        auto track = tracks[0].toObject();
        track.insert("effects", QJsonArray{key, QJsonObject{{"id", "cc"}, {"type", "colorCorrection"}, {"enabled", true}, {"brightness", 0.05}}});
        tracks[0] = track;
        raw.insert("tracks", tracks);
        const auto probe = nt::colorpanel::isolatedClipDocument(raw, "a", QJsonArray{}, false);
        QCOMPARE(probe.value("tracks").toArray()[0].toObject().value("effects").toArray(), QJsonArray{key});
        TimelineModel model;
        auto parsed = nt::parseTimeline(raw);
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(std::move(*parsed.timeline));
        PlaybackClock clock;
        clock.setFps(30);
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ColorMatchController matcher;
        matcher.setCapture(&capture);
        matcher.setClock(&clock);
        matcher.setProtectSkin(false);
        matcher.setClipId("r");
        matcher.useSelectedShot();
        QTRY_VERIFY_WITH_TIMEOUT(matcher.hasReference(), 60000);
        matcher.setClipId("a");
        QSignalSpy matched(&matcher, &ColorMatchController::matched);
        matcher.match();
        QTRY_VERIFY_WITH_TIMEOUT(matched.count() == 1, 120000);
        qInfo().noquote() << "Matching a keyed shot to itself:" << matcher.lastDifferenceBefore() << matcher.lastDifferenceAfter()
                          << QJsonDocument(model.clipsJson()[0].toObject().value("effects").toArray()).toJson(QJsonDocument::Compact);
        QVERIFY2(matcher.lastDifferenceBefore() < 0.003, qPrintable(QString::number(matcher.lastDifferenceBefore())));
        const auto wheels = model.clipsJson()[0].toObject().value("effects").toArray()[0].toObject();
        for (int c = 0; c < 3; ++c) {
            QVERIFY2(std::abs(wheels.value("gain").toArray()[c].toDouble() - 1) < 0.05, "A matching keyed shot was graded");
            QVERIFY2(std::abs(wheels.value("gamma").toArray()[c].toDouble() - 1) < 0.05, "A matching keyed shot was graded");
        }
    }

    void unrelatedMissingMediaDoesNotStopAMatch() {
        const auto reference = image("missing-reference", scene());
        const auto current = image("missing-current", scene(10, -5));
        auto absent = clipJson("absent", 2000, 1000);
        absent.insert("currentAssetId", QString(32, u'a'));
        TimelineModel model;
        auto parsed = nt::parseTimeline(documentOf({clipJson("a", 0, 1000, current), clipJson("r", 1000, 1000, reference), absent}));
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(std::move(*parsed.timeline));
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ColorMatchController matcher;
        matcher.setCapture(&capture);
        matcher.setClipId("r");
        matcher.useSelectedShot();
        QTRY_VERIFY_WITH_TIMEOUT(!matcher.busy(), 60000);
        QVERIFY2(matcher.error().isEmpty(), qPrintable(matcher.error()));
        QVERIFY(matcher.hasReference());
        // The whole timeline still needs that media.
        QString error;
        capture.captureSequence(500, [&](const FrameCaptureResult& result) { error = result.error; });
        QTRY_VERIFY_WITH_TIMEOUT(!error.isEmpty(), 60000);
    }

    void matchRefusesAColorEffectItCannotRun() {
        const auto reference = image("refuse-reference", scene());
        auto a = clipJson("a", 0, 1000, image("refuse-current", scene(10, -5)));
        a.insert("effects", QJsonArray{
            QJsonObject{{"id", "w"}, {"type", "liftGammaGain"}, {"enabled", true}, {"lift", QJsonArray{0, 0, 0}}, {"gamma", QJsonArray{1, 1, 1}}, {"gain", QJsonArray{1, 1, 1}}},
            QJsonObject{{"id", "steps"}, {"type", "posterize"}, {"enabled", true}, {"levels", 2}}});
        TimelineModel model;
        auto parsed = nt::parseTimeline(documentOf({a, clipJson("r", 1000, 1000, reference)}));
        QVERIFY2(parsed.timeline, qPrintable(parsed.error));
        model.setTimeline(std::move(*parsed.timeline));
        FrameCapture capture;
        capture.setExecutable(QStringLiteral(NT_TIMELINE_BINARY));
        capture.setTimeline(&model);
        ColorMatchController matcher;
        matcher.setCapture(&capture);
        matcher.setClipId("r");
        matcher.useSelectedShot();
        QTRY_VERIFY_WITH_TIMEOUT(matcher.hasReference(), 60000);
        const auto document = model.documentJson();
        matcher.setClipId("a");
        matcher.match();
        QVERIFY(!matcher.busy());
        QVERIFY2(matcher.error().contains("posterize"), qPrintable(matcher.error()));
        QCOMPARE(model.documentJson(), document);
    }

    void matchSurvivesAChangeWhileSolving() {
        const auto reference = image("race-reference", scene());
        const auto current = image("race-current", scene(20, -10));
        Editor e({clipJson("a", 0, 1000, current), clipJson("r", 1000, 1000, reference)});
        QVERIFY2(e.object, qPrintable(e.error));
        ColorMatchController matcher;
        matcher.setCapture(e.capture());
        matcher.setClock(&e.clock);
        matcher.setClipId("r");
        matcher.useSelectedShot();
        QTRY_VERIFY_WITH_TIMEOUT(matcher.hasReference(), 60000);
        matcher.setClipId("a");
        matcher.match();
        QVERIFY(matcher.busy());
        const QJsonArray edited{QJsonObject{{"id", "soft"}, {"type", "blur"}, {"enabled", true}, {"radius", 2}}};
        QVERIFY(e.model.applyEdit("patchClip", {{"clipId", "a"}, {"patch", QJsonObject{{"effects", edited}}}}));
        QTRY_VERIFY_WITH_TIMEOUT(!matcher.busy(), 60000);
        // The user's edit stays. Match says so instead of overwriting it.
        QCOMPARE(e.effects(), edited);
        QVERIFY2(!matcher.error().isEmpty(), "Match wrote over a newer edit");
        // A lock taken while matching also stops the write.
        auto lockTrack = [&](bool locked) {
            return e.model.applyEdit("setTrackLocked", {{"trackId", "v"}, {"locked", locked}});
        };
        matcher.match();
        QVERIFY(matcher.busy());
        QVERIFY(lockTrack(true));
        QTRY_VERIFY_WITH_TIMEOUT(!matcher.busy(), 60000);
        QCOMPARE(e.effects(), edited);
        QVERIFY2(!matcher.error().isEmpty(), "Match wrote to a track locked while it ran");
        matcher.match();
        QVERIFY(!matcher.busy());
        QVERIFY(matcher.error().contains("Unlock"));
        QVERIFY(lockTrack(false));
        // The same for a change that leaves the effects alone and gives a different picture.
        matcher.match();
        QVERIFY(matcher.busy());
        QVERIFY(e.model.applyEdit("patchClip", {{"clipId", "a"}, {"patch", QJsonObject{{"inPointMs", 250}}}}));
        QTRY_VERIFY_WITH_TIMEOUT(!matcher.busy(), 60000);
        QCOMPARE(e.effects(), edited);
        QVERIFY2(!matcher.error().isEmpty(), "Match used a picture of the clip from before the slip");
        // Cancel during the capture also leaves the document.
        const auto document = e.model.documentJson();
        matcher.match();
        QVERIFY(matcher.busy());
        matcher.cancel();
        QVERIFY(!matcher.busy());
        QTest::qWait(200);
        QCOMPARE(e.model.documentJson(), document);
    }
};

QTEST_MAIN(TestColorPanel)
#include "tst_colorpanel.moc"
