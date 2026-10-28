#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "edit/ClipGestureController.h"
#include "playback/PlaybackClock.h"
#include <QGuiApplication>
#include <QFile>
#include <QJsonArray>
#include <QJsonDocument>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlProperty>
#include <QQmlListReference>
#include <QQuickItem>
#include <QQuickWindow>
#include <QJSValue>
#include <QtTest>
#include <memory>
#include <algorithm>

namespace {
const QByteArray document = R"({"name":"Audio","width":640,"height":360,"fps":30,"durationMs":5001,"tracks":[{"id":"a","type":"audio","index":0}],"clips":[{"id":"c","trackId":"a","durationMs":5001,"startMs":0,"mediaType":"audio","extra":{"keep":true}},{"id":"silent","trackId":"a","durationMs":1000,"startMs":0,"mediaType":"image"}]})";
void load(TimelineModel& model) {
    auto parsed = nt::parseTimelineJson(document);
    Q_ASSERT(parsed.timeline);
    model.setTimeline(std::move(*parsed.timeline));
}
QByteArray fadedDocument() {
    auto raw = QJsonDocument::fromJson(document).object();
    auto clip = raw["clips"].toArray()[0].toObject();
    clip.insert("startMs", 1000);
    clip.insert("fadeInMs", 600);
    clip.insert("fadeOutMs", 600);
    raw.insert("clips", QJsonArray{clip});
    return QJsonDocument(raw).toJson();
}
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (root->objectName() == name) {
        return root;
    }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) {
            return found;
        }
    }
    return nullptr;
}
struct AudioEditor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    explicit AudioEditor(const QByteArray& source = document) {
        auto parsed = nt::parseTimelineJson(source);
        Q_ASSERT(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 800}}));
        error = component.errorString();
        window.resize(1280, 800);
        if (root()) { root()->setParentItem(window.contentItem()); }
        window.show();
    }
    QQuickItem* root() const { return qobject_cast<QQuickItem*>(object.get()); }
    QQuickItem* item(const QString& name) const { return findItem(root(), name); }
    ClipGestureController* gestures() const { return object->findChild<ClipGestureController*>("clipGestures"); }
};
}
class TestClipAudio : public QObject {
    Q_OBJECT
    QJsonObject english;
private slots:
    void fadeObjectNamesPreserveClipDelegatePrefix() {
        AudioEditor e(fadedDocument());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        QTRY_VERIFY(e.item("fadeGrip-in-c"));
        auto* contribution = e.item("fadeGrip-in-c")->parentItem();
        QList<QQuickItem*> items{contribution};
        for (qsizetype i = 0; i < items.size(); ++i) {
            auto* item = items[i];
            QVERIFY2(!item->objectName().startsWith("clip-"), qPrintable(item->objectName()));
            items.append(item->childItems());
        }
        QVERIFY(items.size() > 1);
    }
    void fadePointerReleaseKeepsEditorKeys() {
        AudioEditor e(fadedDocument());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->viewState()->zoomTo(20, 0);
        e.gestures()->viewState()->flush();
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY(e.item("fadeGrip-in-c"));
        auto* grip = e.item("fadeGrip-in-c");
        const auto point = grip->mapToScene({4.5, 4.5}).toPoint();
        QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, point);
        const bool gripKeptFocus = grip->hasActiveFocus();
        QTest::keyClick(&e.window, Qt::Key_Delete);
        QCOMPARE(e.model.clipsJson().size(), 0);
        QCOMPARE(e.model.undoStack()->count(), 1);
        QVERIFY(!gripKeptFocus);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson().size(), 1);
    }
    void fadeTabFocusStepsAndForwardsEditorKeys() {
        AudioEditor e(fadedDocument());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY(e.item("fadeGrip-in-c"));
        auto* grip = e.item("fadeGrip-in-c");
        auto* previous = grip->nextItemInFocusChain(false);
        QVERIFY(previous != grip);
        previous->forceActiveFocus();
        QTest::keyClick(&e.window, Qt::Key_Tab);
        QVERIFY(grip->hasActiveFocus());
        const auto before = e.model.clipsJson();
        QTest::keyClick(&e.window, Qt::Key_Right);
        QCOMPARE(e.model.clipsJson()[0].toObject()["fadeInMs"].toDouble(), 700.0);
        QTRY_COMPARE_WITH_TIMEOUT(e.model.undoStack()->count(), 1, 1000);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson(), before);
        e.model.undoStack()->clear();
        QTest::keyClick(&e.window, Qt::Key_Delete);
        QCOMPARE(e.model.clipsJson().size(), 0);
        QCOMPARE(e.model.undoStack()->count(), 1);
    }
    void effectsSection() {
        AudioEditor e;
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY_WITH_TIMEOUT(e.item("audioEffectsSection"), 1000);
        auto* section = e.item("audioEffectsSection");
        QVERIFY(e.item("inspectorViewport")->isAncestorOf(section));
        section->setProperty("open", true);
        auto* add = findItem(section, "audioEffectsAdd");
        QVERIFY(add);
        QVERIFY(QMetaObject::invokeMethod(add, "clicked"));
        QTRY_VERIFY(section->findChild<QObject*>("audioEffectsAdd-gain"));
        QVERIFY(QMetaObject::invokeMethod(section->findChild<QObject*>("audioEffectsAdd-gain"), "triggered"));
        QCOMPARE(e.model.undoStack()->count(), 1);
        auto effects = e.model.clipsJson()[0].toObject()["audioEffects"].toArray();
        QCOMPARE(effects.size(), 1);
        QCOMPARE(effects[0].toObject()["type"].toString(), QString("gain"));
        const auto id = effects[0].toObject()["id"].toString();
        auto* knob = findItem(section, "audioEffectKnob-" + id + "-gainDb");
        QTRY_VERIFY(knob);
        QVERIFY(QMetaObject::invokeMethod(knob, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(knob, "preview", Q_ARG(double, 3.0)));
        QVERIFY(QMetaObject::invokeMethod(knob, "preview", Q_ARG(double, 6.0)));
        QCOMPARE(e.model.undoStack()->count(), 1);
        QVERIFY(QMetaObject::invokeMethod(knob, "change", Q_ARG(double, 6.0)));
        QCOMPARE(e.model.undoStack()->count(), 2);
        QCOMPARE(e.model.clipsJson()[0].toObject()["audioEffects"].toArray()[0].toObject()["gainDb"].toDouble(), 6.0);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson()[0].toObject()["audioEffects"].toArray(), effects);
    }
    void effectsActionsAndUndo() {
        TimelineModel model;
        load(model);
        const auto check = [&](const QString& name, QJsonObject payload, const std::function<void(const QJsonArray&)>& verify) {
            const auto before = model.clipsJson();
            const auto count = model.undoStack()->count();
            payload.insert("clipId", "c");
            QVERIFY(model.applyEdit(name, payload));
            QCOMPARE(model.undoStack()->count(), count + 1);
            const auto after = model.clipsJson();
            verify(after[0].toObject()["audioEffects"].toArray());
            QCOMPARE(after[1], before[1]);
            QCOMPARE(after[0].toObject()["extra"], before[0].toObject()["extra"]);
            model.undoStack()->undo();
            QCOMPARE(model.clipsJson(), before);
            model.undoStack()->redo();
            QCOMPARE(model.clipsJson(), after);
        };
        check("addClipAudioEffect", {{"type", "gain"}, {"id", "g"}}, [](const QJsonArray& effects) {
            QCOMPARE(effects, QJsonArray{QJsonObject({{"id", "g"}, {"type", "gain"}, {"enabled", true}, {"gainDb", 0}})});
        });
        check("addClipAudioEffect", {{"type", "filter"}, {"id", "f"}}, [](const QJsonArray& effects) {
            QCOMPARE(effects.size(), 2);
            QCOMPARE(effects[1].toObject()["mode"].toString(), QString("lowpass"));
        });
        check("patchClipAudioEffect", {{"effectId", "g"}, {"patch", QJsonObject{{"enabled", false}}}}, [](const QJsonArray& effects) {
            QCOMPARE(effects[0].toObject()["enabled"].toBool(), false);
        });
        check("patchClipAudioEffect", {{"effectId", "f"}, {"patch", QJsonObject{{"mode", "bandpass"}, {"frequency", 850}}}}, [](const QJsonArray& effects) {
            QCOMPARE(effects[1].toObject()["mode"].toString(), QString("bandpass"));
            QCOMPARE(effects[1].toObject()["frequency"].toDouble(), 850.0);
        });
        check("moveClipAudioEffect", {{"effectId", "f"}, {"delta", -1}}, [](const QJsonArray& effects) {
            QCOMPARE(effects[0].toObject()["id"].toString(), QString("f"));
        });
        check("moveClipAudioEffect", {{"effectId", "f"}, {"delta", 1}}, [](const QJsonArray& effects) {
            QCOMPARE(effects[1].toObject()["id"].toString(), QString("f"));
        });
        check("removeClipAudioEffect", {{"effectId", "g"}}, [](const QJsonArray& effects) {
            QCOMPARE(effects.size(), 1);
            QCOMPARE(effects[0].toObject()["id"].toString(), QString("f"));
        });
    }
    void effectsPointerGesture() {
        TimelineModel model;
        load(model);
        QVERIFY(model.applyEdit("addClipAudioEffect", {{"clipId", "c"}, {"type", "gain"}, {"id", "g"}}));
        model.undoStack()->clear();
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioEffects { selection: ["c"]; open: true; width: 400 })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(section.get());
        QQuickWindow window;
        window.resize(400, 300);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        section->setProperty("expandedId", "g");
        QTRY_VERIFY(findItem(root, "audioEffectKnob-g-gainDb"));
        auto* knob = findItem(root, "audioEffectKnob-g-gainDb");
        QVERIFY(knob);
        QQuickItem* slider = nullptr;
        for (auto* child : knob->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid() && child->property("pressed").isValid()) { slider = child; break; }
        }
        QVERIFY(slider);
        QTRY_VERIFY(slider->width() > 50);
        QTRY_VERIFY(slider->isVisible());
        auto* header = findItem(root, "audioEffectExpand-g");
        QVERIFY(header);
        QTRY_VERIFY(slider->mapToScene({0, 0}).y() >= header->mapToScene({0, header->height()}).y());
        const auto before = model.clipsJson();
        const auto press = slider->mapToScene({slider->width() / 2, slider->height() / 2}).toPoint();
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, press);
        QVERIFY2(slider->property("pressed").toBool(), qPrintable(QString("Slider press %1,%2 size %3,%4 root %5,%6")
            .arg(press.x()).arg(press.y()).arg(slider->width()).arg(slider->height()).arg(root->width()).arg(root->height())));
        QTest::mouseMove(&window, press + QPoint(10, 0));
        QTest::mouseMove(&window, press + QPoint(25, 0));
        const auto wanted = slider->property("value").toDouble();
        QVERIFY2(wanted > 0, qPrintable(QString("Slider value %1 pressed %2 at %3,%4 size %5,%6")
            .arg(wanted).arg(slider->property("pressed").toBool()).arg(press.x()).arg(press.y()).arg(slider->width()).arg(slider->height())));
        QCOMPARE(model.clipsJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, press + QPoint(25, 0));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.clipsJson()[0].toObject()["audioEffects"].toArray()[0].toObject()["gainDb"].toDouble(), wanted);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), before);
    }
    void fadeGrips_data() {
        QTest::addColumn<QString>("mediaType");
        QTest::addColumn<bool>("fadeable");
        QTest::newRow("audio") << QString("audio") << true;
        QTest::newRow("video-with-sound") << QString("video") << true;
        QTest::newRow("midi") << QString("midi") << true;
        QTest::newRow("image") << QString("image") << false;
        QTest::newRow("text") << QString("text") << false;
    }
    void fadeGrips() {
        QFETCH(QString, mediaType);
        QFETCH(bool, fadeable);
        auto raw = QJsonDocument::fromJson(document).object();
        auto clip = raw["clips"].toArray()[0].toObject();
        clip.insert("mediaType", mediaType);
        clip.insert("startMs", 1000);
        clip.insert("durationMs", 5000);
        clip.insert("fadeInMs", 600);
        clip.insert("fadeOutMs", 600);
        raw.insert("clips", QJsonArray{clip});
        raw.insert("durationMs", 7000);
        AudioEditor e(QJsonDocument(raw).toJson());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->viewState()->zoomTo(20, 0);
        e.gestures()->viewState()->setScrollLeftPx(0);
        e.gestures()->viewState()->flush();
        e.gestures()->setSelection({"c"});
        QCoreApplication::processEvents();
        const auto gripName = QString("fadeGrip-in-c");
        if (!fadeable) {
            QVERIFY(!e.item(gripName));
            return;
        }
        QTRY_VERIFY_WITH_TIMEOUT(e.item(gripName), 1000);
        auto* in = e.item(gripName);
        auto* out = e.item("fadeGrip-out-c");
        QVERIFY(out);
        QVERIFY(in->isVisible());
        const auto before = e.model.clipsJson();
        for (auto* grip : {in, out}) {
            const bool incoming = grip == in;
            const auto field = incoming ? "fadeInMs" : "fadeOutMs";
            for (const auto [delta, wanted] : {std::pair{180, 4200.0}, std::pair{-40, 0.0}, std::pair{500, 4400.0}}) {
                const auto point = grip->mapToScene({grip->width() / 2, grip->height() / 2}).toPoint();
                const auto end = point + QPoint(incoming ? delta : -delta, 0);
                QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, point);
                QTest::mouseMove(&e.window, end, 20);
                QCOMPARE(e.model.clipsJson()[0].toObject()[field].toDouble(), wanted);
                QCOMPARE(e.model.undoStack()->count(), 0);
                QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, end);
                QCOMPARE(e.model.clipsJson()[0].toObject()[field].toDouble(), wanted);
                QCOMPARE(e.model.undoStack()->count(), 1);
                e.model.undoStack()->undo();
                QCOMPARE(e.model.clipsJson(), before);
                e.model.undoStack()->clear();
            }
            grip->forceActiveFocus();
            QTest::keyClick(&e.window, incoming ? Qt::Key_Right : Qt::Key_Left);
            QCOMPARE(e.model.clipsJson()[0].toObject()[field].toDouble(), 700.0);
            QCOMPARE(e.model.undoStack()->count(), 0);
            QTRY_COMPARE_WITH_TIMEOUT(e.model.undoStack()->count(), 1, 1000);
            QTest::keyClick(&e.window, incoming ? Qt::Key_Right : Qt::Key_Left, Qt::ShiftModifier);
            QCOMPARE(e.model.clipsJson()[0].toObject()[field].toDouble(), 710.0);
            QCOMPARE(e.model.undoStack()->count(), 1);
            QTRY_COMPARE_WITH_TIMEOUT(e.model.undoStack()->count(), 2, 1000);
            e.model.undoStack()->undo();
            QCOMPARE(e.model.clipsJson()[0].toObject()[field].toDouble(), 700.0);
            e.model.undoStack()->undo();
            QCOMPARE(e.model.clipsJson(), before);
            e.model.undoStack()->clear();
        }
        const auto point = in->mapToScene({in->width() / 2, in->height() / 2}).toPoint();
        QVERIFY2(!in->parentItem()->findChild<QObject*>("clipFadeShapeMenu-c"),
            "Idle clips must not instantiate shape menus");
        QTest::mouseClick(&e.window, Qt::RightButton, Qt::NoModifier, point);
        QTRY_VERIFY(in->parentItem()->findChild<QQuickItem*>("fadeShape_sCurve"));
        auto* shape = in->parentItem()->findChild<QQuickItem*>("fadeShape_sCurve");
        auto* menu = in->parentItem()->findChild<QObject*>("clipFadeShapeMenu-c");
        QVERIFY(menu);
        QTRY_VERIFY(menu->property("opened").toBool());
        QVERIFY(shape->isVisible());
        QSignalSpy triggered(shape, SIGNAL(triggered()));
        const auto target = shape->mapToScene({shape->width() / 2, shape->height() / 2}).toPoint();
        auto* menuWindow = shape->window();
        QVERIFY(menuWindow);
        QTest::mouseMove(menuWindow, target);
        QTest::mouseClick(menuWindow, Qt::LeftButton, Qt::NoModifier, target);
        QCOMPARE(triggered.count(), 1);
        QCOMPARE(e.model.clipsJson()[0].toObject()["fadeInShape"].toString(), QString("sCurve"));
        QCOMPARE(e.model.undoStack()->count(), 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson(), before);
    }
    void fadeGripVisibility() {
        AudioEditor e;
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->viewState()->zoomTo(20, 0);
        e.gestures()->viewState()->flush();
        QTRY_VERIFY(e.item("fadeGrip-in-c"));
        auto* grip = e.item("fadeGrip-in-c");
        QCOMPARE(grip->width(), 9.0);
        QCOMPARE(grip->x(), 0.0);
        auto* dot = grip->childItems().first();
        QTest::mouseMove(&e.window, QPoint(10, 10));
        e.gestures()->setSelection({});
        QTRY_COMPARE(dot->opacity(), 0.0);
        e.gestures()->setSelection({"c"});
        QTRY_COMPARE(dot->opacity(), 1.0);
        e.gestures()->setSelection({});
        grip->forceActiveFocus();
        QTRY_COMPARE(dot->opacity(), 1.0);
        e.root()->forceActiveFocus();
        QTest::mouseMove(&e.window, e.item("clip-c")->mapToScene({50, 20}).toPoint());
        QTRY_COMPARE(dot->opacity(), 1.0);
        QTest::mouseMove(&e.window, QPoint(10, 10));
        QTRY_COMPARE(dot->opacity(), 0.0);
        e.gestures()->viewState()->zoomTo(200, 0);
        e.gestures()->viewState()->flush();
        QTRY_VERIFY(!e.item("fadeGrip-in-c"));
    }
    void fadeFromCorner_data() {
        QTest::addColumn<bool>("incoming");
        QTest::addColumn<double>("pressY");
        QTest::newRow("in") << true << 4.5;
        QTest::newRow("out") << false << 4.5;
        QTest::newRow("in-margin") << true << 12.0;
        QTest::newRow("out-margin") << false << 12.0;
    }
    void fadeFromCorner() {
        QFETCH(bool, incoming);
        QFETCH(double, pressY);
        auto raw = QJsonDocument::fromJson(document).object();
        auto sourceClip = raw["clips"].toArray()[0].toObject();
        sourceClip.insert("startMs", 1000);
        sourceClip.insert("inPointMs", 0);
        raw.insert("clips", QJsonArray{sourceClip});
        AudioEditor e(QJsonDocument(raw).toJson());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"c"});
        const auto gripName = incoming ? "fadeGrip-in-c" : "fadeGrip-out-c";
        QTRY_VERIFY(e.item(gripName));
        auto* grip = e.item(gripName);
        const auto before = e.model.clipsJson()[0].toObject();
        const auto point = grip->mapToScene({4.5, pressY}).toPoint();
        const auto end = point + QPoint(incoming ? 20 : -20, 0);
        QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseMove(&e.window, end);
        QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, end);
        const auto after = e.model.clipsJson()[0].toObject();
        QCOMPARE(after[incoming ? "fadeInMs" : "fadeOutMs"].toDouble(),
            std::round(20 * e.gestures()->viewState()->msPerPx()));
        QCOMPARE(after["startMs"], before["startMs"]);
        QCOMPARE(after["durationMs"], before["durationMs"]);
        QCOMPARE(after["inPointMs"], before["inPointMs"]);
        QCOMPARE(e.model.undoStack()->count(), 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson()[0].toObject(), before);
    }
    void trimOutsideFadeGrip_data() {
        QTest::addColumn<bool>("incoming");
        QTest::addColumn<bool>("slotProbe");
        QTest::newRow("start") << true << false;
        QTest::newRow("end") << false << false;
        QTest::newRow("start-unmarked-slot") << true << true;
        QTest::newRow("end-unmarked-slot") << false << true;
    }
    void trimOutsideFadeGrip() {
        QFETCH(bool, incoming);
        QFETCH(bool, slotProbe);
        auto raw = QJsonDocument::fromJson(document).object();
        auto sourceClip = raw["clips"].toArray()[0].toObject();
        sourceClip.insert("startMs", 1000);
        sourceClip.insert("inPointMs", 0);
        raw.insert("clips", QJsonArray{sourceClip});
        AudioEditor e(QJsonDocument(raw).toJson());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY(e.item("clip-c"));
        auto* clip = e.item("clip-c");
        auto* trim = findItem(clip, incoming ? "clipTrimStart" : "clipTrimEnd");
        QVERIFY(trim);
        QVERIFY(trim->isVisible());
        const auto point = trim->mapToScene({4, trim->height() - 4}).toPoint();
        for (const auto& name : {QString("fadePointer-in-c"), QString("fadePointer-out-c")}) {
            QTRY_VERIFY(e.item(name));
            auto* pointer = e.item(name);
            QVERIFY(!pointer->contains(pointer->mapFromScene(point)));
        }
        std::unique_ptr<QObject> probe;
        if (slotProbe) {
            auto* slot = e.item("fadeGrip-in-c")->parentItem();
            while (slot && slot->property("slot").toString() != "clipBody") {
                slot = slot->parentItem();
            }
            QVERIFY(slot);
            QQmlComponent component(&e.engine);
            component.setData(R"(import QtQuick
MouseArea { width: 28; height: 28; property int pressCount: 0; onPressed: ++pressCount })", QUrl());
            probe.reset(component.create());
            QVERIFY2(probe, qPrintable(component.errorString()));
            auto* area = qobject_cast<QQuickItem*>(probe.get());
            QVERIFY(area);
            area->setParentItem(slot);
            area->setPosition({incoming ? 0 : slot->width() - area->width(), slot->height() - area->height()});
            QVERIFY(area->isVisible() && area->isEnabled());
            QVERIFY(area->contains(area->mapFromScene(point)));
            QVERIFY(!area->property("takesTrimPress").isValid());
        }
        const auto before = e.model.clipsJson()[0].toObject();
        const auto end = point + QPoint(incoming ? 20 : -20, 0);
        QTest::mousePress(&e.window, Qt::LeftButton, Qt::NoModifier, point);
        QTest::mouseMove(&e.window, end);
        QTest::mouseRelease(&e.window, Qt::LeftButton, Qt::NoModifier, end);
        const auto after = e.model.clipsJson()[0].toObject();
        if (probe) {
            QCOMPARE(probe->property("pressCount").toInt(), 0);
        }
        QVERIFY(after["durationMs"].toDouble() < before["durationMs"].toDouble());
        if (incoming) {
            QVERIFY(after["startMs"].toDouble() > before["startMs"].toDouble());
            QVERIFY(after["inPointMs"].toDouble() > before["inPointMs"].toDouble());
        } else {
            QCOMPARE(after["startMs"], before["startMs"]);
            QCOMPARE(after["inPointMs"], before["inPointMs"]);
        }
        QCOMPARE(after["fadeInMs"].toDouble(), 0.0);
        QCOMPARE(after["fadeOutMs"].toDouble(), 0.0);
        QCOMPARE(e.model.undoStack()->count(), 1);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson()[0].toObject(), before);
    }
    void audioEligibility_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<bool>("sounding");
        QTest::newRow("audio") << QString("audio") << true;
        QTest::newRow("midi") << QString("midi") << true;
        QTest::newRow("video-with-audio") << QString("video") << false;
        QTest::newRow("image") << QString("image") << false;
    }
    void audioEligibility() {
        QFETCH(QString, type);
        QFETCH(bool, sounding);
        auto raw = QJsonDocument::fromJson(document).object();
        auto clip = raw["clips"].toArray()[0].toObject();
        clip.insert("mediaType", type);
        clip.insert("audioPath", "sound.wav");
        raw.insert("clips", QJsonArray{clip});
        AudioEditor e(QJsonDocument(raw).toJson());
        QVERIFY2(e.object, qPrintable(e.error));
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY(e.item("audioSection"));
        QTRY_VERIFY(e.item("audioEffectsSection"));
        QTRY_COMPARE_WITH_TIMEOUT(e.item("audioSection")->isVisible(), sounding, 1000);
        QTRY_COMPARE_WITH_TIMEOUT(e.item("audioEffectsSection")->isVisible(), sounding, 1000);
    }
    void audioInInspectorViewport() {
        auto raw = QJsonDocument::fromJson(document).object();
        auto clips = raw["clips"].toArray();
        auto clip = clips[0].toObject();
        clip.insert("timeRemap", QJsonObject{{"keyframes", QJsonArray{
            QJsonObject{{"t", 0}, {"sourceMs", 0}}, QJsonObject{{"t", 0.5}, {"sourceMs", 2500}},
            QJsonObject{{"t", 1}, {"sourceMs", 5001}}}}});
        clips[0] = clip;
        raw.insert("clips", clips);
        AudioEditor e(QJsonDocument(raw).toJson());
        QVERIFY2(e.object, qPrintable(e.error));
        QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"c"});
        QTRY_VERIFY(e.item("audioSection"));
        auto* audio = e.item("audioSection");
        auto* viewport = e.item("inspectorViewport");
        QVERIFY(viewport);
        e.item("inspectorMedia")->setProperty("open", true);
        e.item("inspectorTiming")->setProperty("open", true);
        e.item("inspectorTimeRemap")->setProperty("open", true);
        QTRY_VERIFY(audio->isVisible());
        QCoreApplication::processEvents();
        viewport->setProperty("contentY", std::clamp(audio->mapToItem(viewport, QPointF{}).y(), 0.0,
            std::max(0.0, viewport->property("contentHeight").toDouble() - viewport->height())));
        QCoreApplication::processEvents();
        const auto rect = audio->mapRectToItem(viewport, QRectF(0, 0, audio->width(), audio->height()));
        QVERIFY2(QRectF(0, 0, viewport->width(), viewport->height()).contains(rect), "Audio section lies outside the Inspector viewport");
        QVERIFY(viewport->property("contentY").toDouble() > 0);
        QCOMPARE(audio->property("timelineModel").value<QObject*>(), &e.model);
        QCOMPARE(audio->property("gestures").value<QObject*>(), e.gestures());
        QVERIFY(audio->property("controller").value<QObject*>());
        auto* volume = findItem(audio, "audioVolume");
        QVERIFY(volume);
        const auto before = e.model.clipsJson();
        QVERIFY(QMetaObject::invokeMethod(volume, "change", Q_ARG(double, -6.0)));
        QCOMPARE(e.model.undoStack()->count(), 1);
        QCOMPARE(e.model.clipsJson()[0].toObject()["volumeDb"].toDouble(), -6.0);
        e.model.undoStack()->undo();
        QCOMPARE(e.model.clipsJson(), before);
    }
    void initTestCase() {
        QFile file(QStringLiteral(NT_TIMELINE_DIR "/../../web/src/i18n/locales/en.json"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QJsonParseError error;
        const auto parsed = QJsonDocument::fromJson(file.readAll(), &error);
        QCOMPARE(error.error, QJsonParseError::NoError);
        QVERIFY(parsed.isObject());
        english = parsed.object();
    }
    void inspectorWording_data() {
        QTest::addColumn<QString>("control");
        QTest::addColumn<QString>("key");
        QTest::addColumn<bool>("pill");
        QTest::newRow("fade-in-seconds") << QString("audioFadeIn") << QString("fadeInSeconds") << true;
        QTest::newRow("fade-out-seconds") << QString("audioFadeOut") << QString("fadeOutSeconds") << true;
        QTest::newRow("fade-in-shape") << QString("audioFadeInShape") << QString("fadeInShape") << false;
        QTest::newRow("fade-out-shape") << QString("audioFadeOutShape") << QString("fadeOutShape") << false;
    }
    void inspectorWording() {
        QFETCH(QString, control);
        QFETCH(QString, key);
        QFETCH(bool, pill);
        const auto wording = english["pass3_22"].toObject()["timeline"].toObject()
            ["inspector"].toObject()["clipAdjustments"].toObject();
        const auto expected = wording[key].toString();
        QVERIFY(!expected.isEmpty());
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* item = section->findChild<QObject*>(control);
        QVERIFY(item);
        if (pill) {
            QObject* input = nullptr;
            for (auto* child : item->findChildren<QObject*>()) {
                if (child->property("selectByMouse").isValid()) {
                    input = child;
                    break;
                }
            }
            QVERIFY(input);
            QCOMPARE(QQmlProperty::read(input, "Accessible.name", qmlContext(input)).toString(), expected);
        } else {
            QCOMPARE(item->property("label").toString(), expected);
            QCOMPARE(QQmlProperty::read(item, "Accessible.name", qmlContext(item)).toString(), expected);
        }
    }
    void shapeMenuWording_data() {
        QTest::addColumn<QString>("edge");
        QTest::addColumn<QString>("key");
        QTest::newRow("in") << QString("in") << QString("fadeIn");
        QTest::newRow("out") << QString("out") << QString("fadeOut");
    }
    void shapeMenuWording() {
        QFETCH(QString, edge);
        QFETCH(QString, key);
        const auto expected = english["i18n-next59"].toObject()["fadeShapes"].toObject()[key].toString();
        QVERIFY(!expected.isEmpty());
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
ClipFadeShapeMenu {})", QUrl());
        std::unique_ptr<QObject> menu(component.createWithInitialProperties({{"edge", edge}}));
        QVERIFY2(menu, qPrintable(component.errorString()));
        auto* content = menu->property("contentItem").value<QQuickItem*>();
        QVERIFY(content);
        QCOMPARE(QQmlProperty::read(content, "Accessible.name", qmlContext(content)).toString(), expected);
    }
    void gainDialogWording() {
        const auto wording = english["batch2_25"].toObject()["audioGain"].toObject();
        QVERIFY(!wording.isEmpty());
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioGainDialog { clipIds: ["c", "silent"] })", QUrl());
        std::unique_ptr<QObject> dialog(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(dialog, qPrintable(component.errorString()));
        QCOMPARE(dialog->property("title").toString(), wording["title"].toString());
        auto* content = dialog->property("contentItem").value<QQuickItem*>();
        QVERIFY(content);
        const auto items = content->childItems();
        QCOMPARE(items.size(), 7);
        QCOMPARE(items[0]->property("text").toString(), wording["change"].toString());
        QCOMPARE(items[1]->property("text").toString(), wording["setGainTo"].toString());
        QCOMPARE(items[2]->property("text").toString(), wording["adjustGainBy"].toString());
        auto* input = dialog->findChild<QObject*>("gainInput");
        QVERIFY(input);
        for (const auto& mode : {QString("set"), QString("adjust")}) {
            QVERIFY(dialog->setProperty("mode", mode));
            const auto expected = wording[mode == "set" ? "gain" : "change"].toString();
            QCOMPARE(items[3]->property("text").toString(), expected);
            QCOMPARE(QQmlProperty::read(input, "Accessible.name", qmlContext(input)).toString(), expected);
        }
        QVERIFY(dialog->setProperty("mode", "set"));
        QVERIFY(dialog->setProperty("dbText", "25"));
        QVERIFY(!dialog->property("valid").toBool());
        QCOMPARE(items[5]->property("text").toString(), wording["rangeError"].toString()
            .replace("{{min}}", "-120").replace("{{max}}", "24"));
        QCOMPARE(items[6]->property("text").toString(), wording["appliesToOne"].toString());
        QVERIFY(dialog->setProperty("clipIds", QStringList{"silent"}));
        QCOMPARE(items[6]->property("text").toString(), wording["noAudio"].toString());
        const auto parsed = QJsonDocument::fromJson(model.documentJson()).object();
        auto multiple = parsed;
        auto clips = multiple["clips"].toArray();
        auto second = clips[0].toObject();
        second.insert("id", "second");
        clips.append(second);
        multiple.insert("clips", clips);
        auto timeline = nt::parseTimelineJson(QJsonDocument(multiple).toJson());
        QVERIFY(timeline.timeline);
        model.setTimeline(std::move(*timeline.timeline));
        QVERIFY(dialog->setProperty("clipIds", QStringList{"c", "second", "silent"}));
        QCOMPARE(items[6]->property("text").toString(), wording["appliesToMany_other"].toString().replace("{{count}}", "2"));
        auto* footer = dialog->property("footer").value<QObject*>();
        QVERIFY(footer);
        QQmlListReference buttons(footer, "contentChildren");
        QVERIFY(buttons.isReadable());
        QCOMPARE(buttons.count(), 2);
        QCOMPARE(buttons.at(1)->property("text").toString(), english["batch2_25"].toObject()["common"].toObject()["apply"].toString());
    }
    void registeredEdits() {
        TimelineModel model;
        load(model);
        const auto before = model.clipsJson();
        QVERIFY2(model.applyEdit("setClipAudio", {{"clipId", "c"}, {"field", "volumeDb"}, {"value", -4.5}}), "setClipAudio must be registered");
        QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), -4.5);
        QCOMPARE(model.undoStack()->count(), 1);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), before);
    }
    void inspectorControls() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* volume = section->findChild<QObject*>("audioVolume");
        QVERIFY2(volume, "Audio section must contain the Volume slider");
        auto* root = qobject_cast<QQuickItem*>(section.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(400, 220);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto check = [&](const std::function<void()>& action, const QString& field, const QJsonValue& expected) {
            const auto before = model.clipsJson();
            const int count = model.undoStack()->count();
            action();
            QCOMPARE(model.undoStack()->count(), count + 1);
            auto after = before;
            auto clip = after[0].toObject();
            clip.insert(field, expected);
            after[0] = clip;
            QCOMPARE(model.clipsJson(), after);
            model.undoStack()->undo();
            QCOMPARE(model.clipsJson(), before);
            model.undoStack()->redo();
            QCOMPARE(model.clipsJson(), after);
        };
        check([&] {
            QVERIFY(QMetaObject::invokeMethod(volume, "gestureStarted"));
            QVERIFY(QMetaObject::invokeMethod(volume, "preview", Q_ARG(double, -9.0)));
            QVERIFY(QMetaObject::invokeMethod(volume, "preview", Q_ARG(double, -4.5)));
            QCOMPARE(model.undoStack()->count(), 0);
            QVERIFY(!model.clipsJson()[0].toObject().contains("volumeDb"));
            QVERIFY(QMetaObject::invokeMethod(volume, "change", Q_ARG(double, -4.5)));
        }, "volumeDb", -4.5);
        for (const auto& edge : {QString("In"), QString("Out")}) {
            auto* pill = section->findChild<QObject*>("audioFade" + edge);
            QVERIFY(pill);
            check([&] {
                const auto count = model.undoStack()->count();
                QVERIFY(QMetaObject::invokeMethod(pill, "gestureStarted"));
                QVERIFY(QMetaObject::invokeMethod(pill, "preview", Q_ARG(QString, "1.23")));
                QCOMPARE(model.undoStack()->count(), count);
                QVERIFY(QMetaObject::invokeMethod(pill, "commit", Q_ARG(QString, "9.5s")));
            }, "fade" + edge + "Ms", 2500);
            const auto before = model.clipsJson();
            for (const auto& invalid : {QString(""), QString("-2"), QString("Infinity"), QString("bad")}) {
                QVERIFY(QMetaObject::invokeMethod(pill, "commit", Q_ARG(QString, invalid)));
                QCOMPARE(model.clipsJson(), before);
            }
            auto* select = section->findChild<QObject*>("audioFade" + edge + "Shape");
            QVERIFY(select);
            for (const auto& shape : {QString("linear"), QString("sCurve"), QString("plus3dB"), QString("minus3dB")}) {
                check([&] { QVERIFY(QMetaObject::invokeMethod(select, "change", Q_ARG(QString, shape))); }, "fade" + edge + "Shape", shape);
            }
        }
    }
    void sliderPointerGesture() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(section.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(400, 220);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* volume = section->findChild<QQuickItem*>("audioVolume");
        QVERIFY(volume);
        QQuickItem* slider = nullptr;
        for (auto* child : volume->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid() && child->property("pressed").isValid()) {
                slider = child;
                break;
            }
        }
        QVERIFY(slider);
        const auto before = model.clipsJson();
        const auto press = slider->mapToScene({slider->width() / 2, slider->height() / 2}).toPoint();
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, press);
        QTest::mouseMove(&window, press + QPoint(12, 0));
        QTest::mouseMove(&window, press + QPoint(24, 0));
        QCOMPARE(model.clipsJson(), before);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, press + QPoint(24, 0));
        QCOMPARE(model.undoStack()->count(), 1);
        const double wanted = slider->property("value").toDouble();
        QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), wanted);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), before);
    }
    void pillPointerGesture() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(section.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(400, 220);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        for (const auto& edge : {QString("In"), QString("Out")}) {
            auto* pill = section->findChild<QQuickItem*>("audioFade" + edge);
            QVERIFY(pill);
            const auto prior = model.clipsJson();
            const int count = model.undoStack()->count();
            const auto point = pill->mapToScene({10, pill->height() / 2}).toPoint();
            QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, point);
            QTest::mouseMove(&window, point + QPoint(10, 0));
            QCOMPARE(model.undoStack()->count(), count);
            QCOMPARE(model.clipsJson(), prior);
            QTest::mouseMove(&window, point + QPoint(20, 0));
            QCOMPARE(model.undoStack()->count(), count);
            QCOMPARE(model.clipsJson(), prior);
            QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, point + QPoint(20, 0));
            QCOMPARE(model.undoStack()->count(), count + 1);
            QCOMPARE(model.clipsJson()[0].toObject().value("fade" + edge + "Ms").toDouble(), 400.0);
            model.undoStack()->undo();
            QCOMPARE(model.clipsJson(), prior);
            model.undoStack()->redo();
        }
    }
    void sliderKeyboardGesture() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(section.get());
        QVERIFY(root);
        QQuickWindow window;
        window.resize(400, 220);
        root->setParentItem(window.contentItem());
        window.show();
        QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* volume = section->findChild<QQuickItem*>("audioVolume");
        QVERIFY(volume);
        QQuickItem* slider = nullptr;
        for (auto* child : volume->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid() && child->property("pressed").isValid()) {
                slider = child;
                break;
            }
        }
        QVERIFY(slider);
        slider->forceActiveFocus();
        QVERIFY(slider->hasActiveFocus());
        const auto before = model.clipsJson();
        for (int press = 1; press <= 2; ++press) {
            QTest::keyPress(&window, Qt::Key_Right);
            QTest::keyRelease(&window, Qt::Key_Right);
            QCOMPARE(model.undoStack()->count(), press);
            QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), press * 0.5);
            QCOMPARE(slider->property("value").toDouble(), press * 0.5);
        }
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), 0.5);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), before);
    }
    void staleGestureDoesNotEditAnotherDocument_data() {
        QTest::addColumn<bool>("replaceModel");
        QTest::newRow("model") << true;
        QTest::newRow("document") << false;
    }
    void staleGestureDoesNotEditAnotherDocument() {
        QFETCH(bool, replaceModel);
        TimelineModel first;
        TimelineModel second;
        load(first);
        load(second);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioSection { selection: ["c"] })", QUrl());
        std::unique_ptr<QObject> section(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&first)}}));
        QVERIFY2(section, qPrintable(component.errorString()));
        auto* volume = section->findChild<QObject*>("audioVolume");
        QVERIFY(volume);
        const auto before = first.clipsJson();
        QVERIFY(QMetaObject::invokeMethod(volume, "gestureStarted"));
        QVERIFY(QMetaObject::invokeMethod(volume, "preview", Q_ARG(double, -10.0)));
        if (replaceModel) {
            section->setProperty("timeline", QVariant::fromValue(&second));
        } else {
            load(first);
        }
        QVERIFY(QMetaObject::invokeMethod(volume, "preview", Q_ARG(double, -11.0)));
        QVERIFY(QMetaObject::invokeMethod(volume, "change", Q_ARG(double, -11.0)));
        QCOMPARE(first.undoStack()->count(), 0);
        QCOMPARE(second.undoStack()->count(), 0);
        QCOMPARE(first.clipsJson(), before);
        QCOMPARE(second.clipsJson(), before);
    }
    void shapeMenu() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
ClipFadeShapeMenu { clipId: "c"; current: "plus3dB" })", QUrl());
        std::unique_ptr<QObject> menu(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(menu, qPrintable(component.errorString()));
        QSignalSpy selected(menu.get(), SIGNAL(select(QString)));
        QVERIFY(selected.isValid());
        for (const auto& edge : {QString("in"), QString("out")}) {
            menu->setProperty("edge", edge);
            for (const auto& shape : {QString("linear"), QString("sCurve"), QString("plus3dB"), QString("minus3dB")}) {
                const auto before = model.clipsJson();
                const int count = model.undoStack()->count();
                const int selections = selected.count();
                auto* item = menu->findChild<QObject*>("fadeShape_" + shape);
                QVERIFY(item);
                QCOMPARE(item->property("checked").toBool(), shape == "plus3dB");
                QVERIFY(QMetaObject::invokeMethod(item, "triggered"));
                QCOMPARE(selected.count(), selections + 1);
                QCOMPARE(selected.last()[0].toString(), shape);
                QCOMPARE(model.undoStack()->count(), count + 1);
                auto after = before;
                auto clip = after[0].toObject();
                clip.insert(edge == "in" ? "fadeInShape" : "fadeOutShape", shape);
                after[0] = clip;
                QCOMPARE(model.clipsJson(), after);
                QVERIFY(!menu->property("visible").toBool());
                model.undoStack()->undo();
                QCOMPARE(model.clipsJson(), before);
                model.undoStack()->redo();
            }
        }
    }
    void gainDialog() {
        TimelineModel model;
        load(model);
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQuick
import NodeTool.Timeline
AudioGainDialog { clipIds: ["c", "silent"] })", QUrl());
        std::unique_ptr<QObject> dialog(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)}}));
        QVERIFY2(dialog, qPrintable(component.errorString()));
        const auto original = model.clipsJson();
        dialog->setProperty("dbText", "25");
        QVERIFY(!dialog->property("valid").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "confirm"));
        QCOMPARE(model.clipsJson(), original);
        QCOMPARE(model.undoStack()->count(), 0);
        for (const auto& text : {QString("-120"), QString("24")}) {
            dialog->setProperty("dbText", text);
            QVERIFY(dialog->property("valid").toBool());
        }
        dialog->setProperty("dbText", "-8");
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "confirm"));
        QCOMPARE(model.undoStack()->count(), 1);
        QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), -8.0);
        QCOMPARE(model.clipsJson()[1], original[1]);
        const auto beforeAdjust = model.clipsJson();
        dialog->setProperty("mode", "adjust");
        dialog->setProperty("dbText", "500");
        QVERIFY(dialog->property("valid").toBool());
        QVERIFY(QMetaObject::invokeMethod(dialog.get(), "confirm"));
        QCOMPARE(model.undoStack()->count(), 2);
        QCOMPARE(model.clipsJson()[0].toObject().value("volumeDb").toDouble(), 24.0);
        QCOMPARE(model.clipsJson()[1], original[1]);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), beforeAdjust);
        model.undoStack()->undo();
        QCOMPARE(model.clipsJson(), original);
    }
    void panelReachesEditorSelection() {
        TimelineModel model;
        load(model);
        PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)},
            {"width", 1200}, {"height", 800}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* root = qobject_cast<QQuickItem*>(editor.get());
        QVERIFY(root);
        QTRY_VERIFY_WITH_TIMEOUT(findItem(root, "audioSection"), 1000);
        auto* section = findItem(root, "audioSection");
        auto* gestures = editor->findChild<ClipGestureController*>();
        QVERIFY(gestures);
        gestures->setSelection({"c"});
        QTRY_VERIFY(section->property("visible").toBool());
        QCOMPARE(section->property("timeline").value<TimelineModel*>(), &model);
        QCOMPARE(section->property("clip").toMap().value("id").toString(), QString("c"));
        gestures->setSelection({"silent"});
        QTRY_VERIFY(!section->property("visible").toBool());
        gestures->setSelection({"c", "silent"});
        QTRY_VERIFY(!section->property("visible").toBool());
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--json")) {
        QFile input;
        if (!input.open(stdin, QIODevice::ReadOnly)) {
            return 1;
        }
        QJsonParseError error;
        const auto parsed = QJsonDocument::fromJson(input.readAll(), &error);
        if (error.error != QJsonParseError::NoError || !parsed.isArray()) {
            qWarning() << "Expected a JSON request array";
            return 1;
        }
        QQmlEngine engine;
        QQmlComponent component(&engine);
        component.setData(R"(import QtQml
import "qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioFadeShapes.js" as Fades
import "qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/AudioEffectsKnobs.js" as Effects
QtObject {
    function call(name, args) {
        if (name === "effectsCatalog") return {types: Effects.types, knobs: Effects.knobs}
        if (name === "formatKnob") return Effects.formatKnob(args[0], args[1])
        if (name === "catalog") return {shapes: Fades.shapes, labels: Fades.labels, hints: Fades.hints, options: Fades.options}
        return Fades[name].apply(null, args)
    }
})", QUrl());
        std::unique_ptr<QObject> helper(component.create());
        if (!helper) {
            qWarning() << component.errors();
            return 1;
        }
        QJsonArray results;
        for (const auto& value : parsed.array()) {
            const auto request = value.toObject();
            if (request.contains("helper")) {
                QVariant result;
                if (!QMetaObject::invokeMethod(helper.get(), "call", Q_RETURN_ARG(QVariant, result),
                        Q_ARG(QVariant, request.value("helper").toString()),
                        Q_ARG(QVariant, request.value("args").toArray().toVariantList()))) {
                    return 1;
                }
                if (result.metaType() == QMetaType::fromType<QJSValue>()) {
                    result = result.value<QJSValue>().toVariant();
                }
                results.append(QJsonValue::fromVariant(result));
                continue;
            }
            auto document = nt::parseTimelineJson(QJsonDocument(request.value("document").toObject()).toJson());
            if (!document.timeline) {
                qWarning() << document.error;
                return 1;
            }
            TimelineModel model;
            model.setTimeline(std::move(*document.timeline));
            for (const auto& editValue : request.value("edits").toArray()) {
                const auto edit = editValue.toObject();
                model.applyEdit(edit.value("name").toString(), edit.value("payload").toObject());
            }
            results.append(request.value("fullDocument").toBool()
                ? QJsonValue(QJsonDocument::fromJson(model.documentJson()).object()) : QJsonValue(model.clipsJson()));
        }
        QFile output;
        if (!output.open(stdout, QIODevice::WriteOnly)) {
            return 1;
        }
        output.write(QJsonDocument(results).toJson(QJsonDocument::Compact));
        return 0;
    }
    TestClipAudio test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_clipaudio.moc"
