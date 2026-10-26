#include "app/EditRegistry.h"
#include "wiring/WiringFixture.h"
#include "model/TimelineJson.h"
#include "edit/ClipGestureController.h"
#include "playback/PlaybackClock.h"
#include "model/TimelineModel.h"
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QProcess>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQmlPropertyMap>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <cstdio>
#include <memory>

namespace {
QJsonObject fixture() {
    QFile file(QStringLiteral(NT_TRANSITION_SOURCE "/fixtures/overlaps.json"));
    if (!file.open(QIODevice::ReadOnly)) { return {}; }
    auto doc = QJsonDocument::fromJson(file.readAll()).object();
    auto clips = doc.value("clips").toArray();
    auto first = clips[0].toObject();
    auto second = clips[1].toObject();
    first.remove("fadeInMs"); first.remove("fadeInShape");
    first.insert("durationMs", 3200);
    second.insert("mediaType", "image"); second.remove("speedMultiplier");
    doc.insert("clips", QJsonArray{first, second});
    doc.insert("durationMs", 7000);
    return doc;
}
QJsonObject clip(const TimelineModel& model) { return model.clipsJson()[1].toObject(); }
QJsonObject transition(const TimelineModel& model) { return clip(model).value("transitionIn").toObject(); }
void load(TimelineModel& model, const QJsonObject& doc) {
    auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
    if (parsed.timeline) { model.setTimeline(std::move(*parsed.timeline)); }
}
std::unique_ptr<QObject> panel(QQmlEngine& engine, TimelineModel& model, QQmlPropertyMap& gestures) {
    QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/Inspector/TransitionSection.qml"));
    if (!component.isReady()) { qWarning().noquote() << component.errorString(); return {}; }
    return std::unique_ptr<QObject>(component.createWithInitialProperties({
        {"timelineModel", QVariant::fromValue(&model)}, {"gestures", QVariant::fromValue(&gestures)}, {"width", 360}}));
}
QObject* control(QObject* root, const char* name) { return root->findChild<QObject*>(QString::fromLatin1(name)); }
bool textSignal(QObject* item, const char* signal, const QString& value) {
    return item && QMetaObject::invokeMethod(item, signal, Q_ARG(QString, value));
}
}
class TestTransitions : public WiringFixture {
    Q_OBJECT
private slots:
    void cleanup() { view.reset(); }
    void init() { QTest::failOnWarning(QRegularExpression(".*Binding loop.*")); }
    void panelSelection() {
        TimelineModel model; load(model, fixture()); PlaybackClock clock;
        QQmlEngine engine;
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        QVERIFY2(component.isReady(), qPrintable(component.errorString()));
        std::unique_ptr<QObject> editor(component.createWithInitialProperties({
            {"timeline", QVariant::fromValue(&model)}, {"clock", QVariant::fromValue(&clock)}, {"width", 1000}, {"height", 700}}));
        QVERIFY2(editor, qPrintable(component.errorString()));
        auto* gestures = editor->findChild<ClipGestureController*>("clipGestures"); QVERIFY(gestures);
        const std::function<QQuickItem*(QQuickItem*)> findPanel = [&](QQuickItem* item) -> QQuickItem* {
            if (item->objectName() == "inspectorTransition") { return item; }
            for (auto* child : item->childItems()) { if (auto* found = findPanel(child)) { return found; } }
            return nullptr;
        };
        auto* section = findPanel(qobject_cast<QQuickItem*>(editor.get())); QVERIFY(section);
        QCOMPARE(section->property("implicitHeight").toDouble(), 0.0);
        gestures->setSelection({"cut-b"});
        QTRY_VERIFY(section->property("implicitHeight").toDouble() > 0);
        QVERIFY(textSignal(control(section, "transitionType"), "change", "wipe"));
        QCOMPARE(transition(model).value("type").toString(), QString("wipe"));
        gestures->setSelection({"cut-a", "cut-b"});
        QTRY_COMPARE(section->property("implicitHeight").toDouble(), 0.0);
    }
    void pointerAndKeyboard() {
        TimelineModel model; load(model, fixture());
        QVERIFY(model.applyEdit("setClipTransition", {{"clipId", "cut-b"}, {"mode", "wipe"}}));
        QQmlEngine engine; auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures); QVERIFY(root);
        auto* item = qobject_cast<QQuickItem*>(root.get()); QVERIFY(item);
        QQuickWindow window; window.resize(360, 900); item->setParentItem(window.contentItem());
        window.show(); QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* pill = qobject_cast<QQuickItem*>(control(root.get(), "transitionDuration")); QVERIFY(pill);
        const auto center = pill->mapToScene(QPointF(pill->width() / 2, pill->height() / 2)).toPoint();
        const auto verifyUndo = [&](const QByteArray& before, int count) {
            const auto after = model.documentJson(); QVERIFY(after != before);
            QCOMPARE(model.undoStack()->count(), count + 1);
            model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
            model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        };
        auto before = model.documentJson(); auto count = model.undoStack()->count();
        QTest::mouseClick(&window, Qt::LeftButton, Qt::NoModifier, center);
        QTest::keyClick(&window, Qt::Key_A, Qt::ControlModifier);
        for (const auto key : {Qt::Key_1, Qt::Key_Period, Qt::Key_2}) { QTest::keyClick(&window, key); }
        QCOMPARE(model.documentJson(), before);
        QTest::keyClick(&window, Qt::Key_Return);
        QCOMPARE(transition(model).value("durationMs").toDouble(), 1200.0);
        verifyUndo(before, count);
        before = model.documentJson(); count = model.undoStack()->count();
        item->forceActiveFocus();
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, center);
        QTest::mouseMove(&window, center + QPoint(10, 0));
        QTest::mouseMove(&window, center + QPoint(20, 0));
        QVERIFY(model.documentJson() != before); QCOMPARE(model.undoStack()->count(), count);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, center + QPoint(20, 0));
        verifyUndo(before, count);
    }
    void softnessKeyboard() {
        TimelineModel model; load(model, fixture());
        QVERIFY(model.applyEdit("setClipTransition", {{"clipId", "cut-b"}, {"mode", "wipe"}}));
        QQmlEngine engine; auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures); QVERIFY(root);
        auto* item = qobject_cast<QQuickItem*>(root.get()); QVERIFY(item);
        QQuickWindow window; window.resize(360, 900); item->setParentItem(window.contentItem());
        window.show(); QVERIFY(QTest::qWaitForWindowExposed(&window));
        auto* softness = control(root.get(), "transitionSoftness"); QVERIFY(softness);
        QQuickItem* slider = nullptr;
        for (auto* child : softness->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid()) { slider = child; break; }
        }
        QVERIFY(slider);
        slider->forceActiveFocus(); QTRY_VERIFY(slider->hasActiveFocus());
        double expected = transition(model).value("softness").toDouble();
        for (const auto key : {Qt::Key_Right, Qt::Key_Right, Qt::Key_Left}) {
            const auto before = model.documentJson(); const auto count = model.undoStack()->count();
            expected += key == Qt::Key_Right ? 0.01 : -0.01;
            QTest::keyClick(&window, key);
            QVERIFY(transition(model).contains("softness"));
            QVERIFY(qAbs(transition(model).value("softness").toDouble() - expected) < 1e-9);
            const auto after = model.documentJson(); QVERIFY(after != before);
            QCOMPARE(model.undoStack()->count(), count + 1);
            QCOMPARE(model.undoStack()->index(), count + 1);
            model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
            model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        }
    }
    void easingCaptions_data() {
        QTest::addColumn<QString>("objectName");
        QTest::addColumn<QString>("expectedText");
        QTest::newRow("warning") << QString("transitionEasingWarning")
            << QString("This build cannot read this easing; it will play as linear.");
        QTest::newRow("hint") << QString("transitionEasingHint")
            << QString("Use linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2), or spring(stiffness,damping,mass).");
    }
    void easingCaptions() {
        QFETCH(QString, objectName);
        QFETCH(QString, expectedText);
        TimelineModel model; load(model, fixture());
        QVERIFY(model.applyEdit("setClipTransition", {{"clipId", "cut-b"}, {"mode", "wipe"}}));
        QQmlEngine engine; auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures); QVERIFY(root);
        auto* caption = root->findChild<QObject*>(objectName); QVERIFY(caption);
        QCOMPARE(caption->property("text").toString(), expectedText);
        auto* warning = control(root.get(), "transitionEasingWarning"); QVERIFY(warning);
        auto* hint = control(root.get(), "transitionEasingHint"); QVERIFY(hint);
        for (const auto& easing : {"bogus(1)", "cubic-bezier(0.4,0,0.2,1)", "spring(170,26,1)"}) {
            QVERIFY(textSignal(control(root.get(), "transitionEasing"), "commit", QString::fromLatin1(easing)));
            QCOMPARE(transition(model).value("easing").toString(), QString::fromLatin1(easing));
            QTRY_COMPARE(warning->property("visible").toBool(), QString::fromLatin1(easing) == "bogus(1)");
            QVERIFY(hint->property("visible").toBool());
        }
    }
    void productionGrip_data() {
        QTest::addColumn<bool>("finite");
        QTest::newRow("B33-grip") << false;
        QTest::newRow("B29-probed-last-frame") << true;
    }
    void productionGrip() {
        QFETCH(bool, finite);
        open();
        QVERIFY(gestures());
        QTemporaryDir media;
        QVERIFY(media.isValid());
        auto fixture = doc();
        auto outgoing = clip("c");
        outgoing.insert("startMs", 0); outgoing.insert("durationMs", 4000);
        outgoing.insert("inPointMs", 0); outgoing.insert("outPointMs", 4000);
        if (finite) {
            const auto path = media.filePath("four-seconds.mp4");
            QProcess ffmpeg;
            ffmpeg.start("ffmpeg", {"-v", "error", "-f", "lavfi", "-i", "color=s=16x16:r=30:d=4", "-an", "-c:v", "mpeg4", path});
            QVERIFY(ffmpeg.waitForFinished(30000)); QCOMPARE(ffmpeg.exitCode(), 0);
            outgoing.insert("mediaType", "video"); outgoing.insert("mediaPath", path);
            outgoing.insert("versions", QJsonArray{});
        }
        auto incoming = clip("d"); incoming.insert("startMs", 4000); incoming.insert("durationMs", 2000);
        incoming.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 500}});
        fixture.insert("clips", QJsonArray{outgoing, incoming});
        auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson()); QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline));
        if (finite) { QTRY_COMPARE(gestures()->sourceCapMs("c"), 4000.0); }
        QCoreApplication::processEvents();
        auto* grip = item("clip-transition-handle-d");
        QVERIFY2(grip, "B33: production transition wedge needs its Transition length grip");
        QCOMPARE(grip->property("label").toString(), QString("Transition length"));
        const auto before = doc(); const auto from = center(grip); const auto to = from + QPoint(50, 0);
        QTest::mousePress(view.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(view.get(), from + QPoint(25, 0), 20);
        QTest::mouseMove(view.get(), to, 20);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::mouseRelease(view.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(clip("d")["transitionIn"].toObject()["durationMs"].toDouble(), 1000.0);
        QCOMPARE(clip("c")["outPointMs"].toDouble(), finite ? 4000.0 : 5000.0);
        QCOMPARE(clip("c")["durationMs"].toDouble(), finite ? 4000.0 : 5000.0);
        auto expected = before;
        auto nextIn = incoming; nextIn.insert("transitionIn", QJsonObject{{"type", "crossfade"}, {"durationMs", 1000}});
        auto nextOut = outgoing;
        if (!finite) { nextOut.insert("durationMs", 5000); nextOut.insert("outPointMs", 5000); }
        expected.insert("clips", QJsonArray{nextOut, nextIn});
        QCOMPARE(doc(), expected); QCOMPARE(model.undoStack()->count(), 1);
        click("undoButton"); QCOMPARE(doc(), before);
        view.reset();
    }
    void productionSoftnessPointer() {
        open();
        QVERIFY(gestures());
        auto fixture = doc(); auto clips = fixture["clips"].toArray();
        auto incoming = clips[0].toObject();
        incoming.insert("transitionIn", QJsonObject{{"type", "wipe"}, {"durationMs", 500}, {"softness", 0.1}});
        clips[0] = incoming; fixture.insert("clips", clips);
        auto parsed = nt::parseTimelineJson(QJsonDocument(fixture).toJson()); QVERIFY(parsed.timeline);
        model.setTimeline(std::move(*parsed.timeline)); QCoreApplication::processEvents();
        click("clip-c"); QCoreApplication::processEvents();
        auto* softness = item("transitionSoftness"); QVERIFY(softness);
        QVERIFY2(softness->isVisible() && softness->mapToScene({0, 0}).y() < view->height(),
            "Transition softness must be visible inside the production Inspector");
        QQuickItem* slider = nullptr;
        for (auto* child : softness->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid()) { slider = child; break; }
        }
        QVERIFY(slider); QVERIFY(slider->height() > 0);
        const auto before = doc(); const auto count = model.undoStack()->count();
        const auto from = center(slider);
        drag(from, from + QPoint(30, 0));
        QVERIFY(doc() != before); QCOMPARE(model.undoStack()->count(), count + 1);
        click("undoButton"); QCOMPARE(doc(), before);
        view.reset();
    }
    void softnessPointer() {
        TimelineModel model; load(model, fixture());
        QVERIFY(model.applyEdit("setClipTransition", {{"clipId", "cut-b"}, {"mode", "wipe"}}));
        QQmlEngine engine; auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures); QVERIFY(root);
        auto* item = qobject_cast<QQuickItem*>(root.get()); QVERIFY(item);
        QQuickWindow window; window.resize(360, 900); item->setParentItem(window.contentItem());
        window.show(); QVERIFY(QTest::qWaitForWindowExposed(&window));
        const auto before = model.documentJson(); const auto count = model.undoStack()->count();
        auto* softness = qobject_cast<QQuickItem*>(control(root.get(), "transitionSoftness")); QVERIFY(softness);
        QQuickItem* slider = nullptr;
        for (auto* child : softness->findChildren<QQuickItem*>()) {
            if (child->property("from").isValid()) { slider = child; break; }
        }
        QVERIFY(slider);
        QCoreApplication::processEvents();
        QVERIFY2(slider->height() > 0, "InspectorSliderRow.qml gives its Slider height 0, so it cannot receive a pointer drag");
        const auto start = slider->mapToScene(QPointF(slider->width() * 0.2, slider->height() / 2)).toPoint();
        QTest::mousePress(&window, Qt::LeftButton, Qt::NoModifier, start);
        QTest::mouseMove(&window, start + QPoint(30, 0));
        QCOMPARE(model.undoStack()->count(), count);
        QTest::mouseRelease(&window, Qt::LeftButton, Qt::NoModifier, start + QPoint(30, 0));
        const auto after = model.documentJson(); QVERIFY(after != before);
        QCOMPARE(model.undoStack()->count(), count + 1);
        model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
        model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        item->forceActiveFocus(); QCOMPARE(model.undoStack()->count(), count + 1);
    }
    void largeLinkGroup() {
        auto doc = fixture(); QJsonArray clips;
        const auto sample = doc.value("clips").toArray()[0].toObject();
        for (int i = 0; i < 32000; ++i) {
            auto c = sample; c.insert("id", QString::number(i)); c.insert("linkId", "L"); c.insert("durationMs", 1000); clips.append(c);
        }
        auto incoming = sample; incoming.insert("id", "incoming"); incoming.insert("startMs", 1000); clips.append(incoming); doc.insert("clips", clips);
        const auto edit = nt::app::findEdit("setTransitionDuration"); QVERIFY(edit);
        const auto result = edit(doc, {{"clipId", "incoming"}, {"durationMs", 500}}).value("clips").toArray();
        QCOMPARE(result.size(), clips.size());
        QCOMPARE(result[0].toObject().value("durationMs").toDouble(), 1500.0);
        QCOMPARE(result[31999].toObject().value("durationMs").toDouble(), 1500.0);
    }
    void uiUndo() {
        TimelineModel model; load(model, fixture());
        QQmlEngine engine;
        auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures);
        QVERIFY2(root, "TransitionSection must load");
        const auto action = [&](const std::function<bool()>& edit) {
            const auto before = model.documentJson();
            const auto count = model.undoStack()->count();
            QVERIFY(edit());
            const auto after = model.documentJson();
            QVERIFY(after != before);
            QCOMPARE(model.undoStack()->count(), count + 1);
            model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
            model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        };
        action([&] { return textSignal(control(root.get(), "transitionType"), "change", "wipe"); });
        QCOMPARE(transition(model).value("type").toString(), QString("wipe"));
        QCOMPARE(model.clipsJson()[0].toObject().value("durationMs").toDouble(), 3500.0);
        action([&] { return textSignal(control(root.get(), "transitionDuration"), "commit", "0.80s"); });
        QCOMPARE(transition(model).value("durationMs").toDouble(), 800.0);
        for (const auto& easing : {"easeIn", "cubic-bezier(0.2,0,0.8,1)", "spring(100,10,1)", "not-an-easing", ""}) {
            action([&] { return textSignal(control(root.get(), "transitionEasing"), "commit", QString::fromLatin1(easing)); });
            QCOMPARE(transition(model).contains("easing"), QString::fromLatin1(easing) != "");
        }
        action([&] { return textSignal(control(root.get(), "transitionDirection"), "change", "down"); });
        QCOMPARE(transition(model).value("direction").toString(), QString("down"));
        action([&] { return QMetaObject::invokeMethod(control(root.get(), "transitionSoftness"), "change", Q_ARG(double, 0.7)); });
        QCOMPARE(transition(model).value("softness").toDouble(), 0.7);
        action([&] { return textSignal(control(root.get(), "transitionType"), "change", "dipToColor"); });
        action([&] { return textSignal(control(root.get(), "transitionColour"), "commit", "#123456"); });
        QCOMPARE(transition(model).value("color").toString(), QString("#123456"));
        for (const auto& mode : {"push", "slide", "zoom", "crossfade", "none", "auto"}) {
            action([&] { return textSignal(control(root.get(), "transitionType"), "change", QString::fromLatin1(mode)); });
        }
        QVERIFY(!::clip(model).contains("transitionIn"));
        gestures->insert("selection", QVariantList{}); QCoreApplication::processEvents();
        QCOMPARE(root->property("implicitHeight").toDouble(), 0.0);
        auto audio = fixture(); auto clips = audio.value("clips").toArray(); auto c = clips[1].toObject();
        c.insert("mediaType", "audio"); clips[1] = c; audio.insert("clips", clips); load(model, audio);
        gestures->insert("selection", QVariantList{QString("cut-b")}); QCoreApplication::processEvents();
        QCOMPARE(root->property("implicitHeight").toDouble(), 0.0);
    }
    void locksAndGestures() {
        TimelineModel model; load(model, fixture());
        QVERIFY(model.applyEdit("setClipTransition", {{"clipId", "cut-b"}, {"mode", "wipe"}}));
        QQmlEngine engine; auto* gestures = QQmlPropertyMap::create(&engine); gestures->insert("selection", QVariantList{QString("cut-b")});
        auto root = panel(engine, model, *gestures); QVERIFY(root);
        for (const auto& name : {"transitionDuration", "transitionSoftness"}) {
            auto* field = control(root.get(), name); QVERIFY(field);
            const auto before = model.documentJson(); const auto count = model.undoStack()->count();
            QVERIFY(QMetaObject::invokeMethod(field, "gestureStarted"));
            if (QString::fromLatin1(name) == "transitionDuration") {
                QVERIFY(textSignal(field, "preview", "0.90"));
                QVERIFY(textSignal(field, "preview", "1.10"));
            } else {
                QVERIFY(QMetaObject::invokeMethod(field, "preview", Q_ARG(double, 0.2)));
                QVERIFY(QMetaObject::invokeMethod(field, "preview", Q_ARG(double, 0.4)));
            }
            QVERIFY(model.documentJson() != before); QCOMPARE(model.undoStack()->count(), count);
            if (QString::fromLatin1(name) == "transitionDuration") { QVERIFY(textSignal(field, "commit", "1.10")); }
            else { QVERIFY(QMetaObject::invokeMethod(field, "change", Q_ARG(double, 0.4))); }
            const auto after = model.documentJson(); QCOMPARE(model.undoStack()->count(), count + 1);
            model.undoStack()->undo(); QCOMPARE(model.documentJson(), before);
            model.undoStack()->redo(); QCOMPARE(model.documentJson(), after);
        }
        // A new document invalidates a pending gesture, including its eventual release.
        auto* duration = control(root.get(), "transitionDuration");
        QVERIFY(QMetaObject::invokeMethod(duration, "gestureStarted"));
        QVERIFY(textSignal(duration, "preview", "1.50"));
        load(model, fixture()); const auto replacement = model.documentJson();
        QVERIFY(textSignal(duration, "commit", "1.50")); QCOMPARE(model.documentJson(), replacement);
        for (const auto& lock : {"clip", "track"}) {
            auto doc = fixture();
            if (QString::fromLatin1(lock) == "clip") {
                auto clips = doc.value("clips").toArray(); auto c = clips[1].toObject(); c.insert("locked", true); clips[1] = c; doc.insert("clips", clips);
            } else {
                auto tracks = doc.value("tracks").toArray(); auto t = tracks[1].toObject(); t.insert("locked", true); tracks[1] = t; doc.insert("tracks", tracks);
            }
            load(model, doc); const auto before = model.documentJson();
            for (const auto& edit : {"setClipTransition", "setTransitionDuration", "removeTransition"}) {
                QVERIFY(!model.applyEdit(edit, {{"clipId", "cut-b"}, {"mode", "wipe"}, {"durationMs", 600}}));
            }
            QCOMPARE(model.documentJson(), before); QCOMPARE(model.undoStack()->count(), 0);
        }
    }
    void editedPlans() {
        const auto edit = nt::app::findEdit("setClipTransition");
        QVERIFY2(edit, "setClipTransition edit must exist before checking edited plans");
        QStringList files;
        for (const auto& mode : {"auto", "none", "crossfade", "dipToColor", "wipe", "push", "slide", "zoom"}) {
            for (const double duration : {100.0, 500.0, 1500.0}) {
                for (const auto& easing : {"linear", "easeInOut", "cubic-bezier(0.2,0,0.8,1)"}) {
                    auto doc = edit(fixture(), {{"clipId", "cut-b"}, {"mode", mode}});
                    if (QString::fromLatin1(mode) != "auto" && QString::fromLatin1(mode) != "none") {
                        doc = nt::app::findEdit("setTransitionDuration")(doc, {{"clipId", "cut-b"}, {"durationMs", duration}});
                        QJsonObject patch{{"easing", easing}};
                        if (QString::fromLatin1(mode) == "dipToColor") { patch.insert("color", "#234567"); }
                        if (QString::fromLatin1(mode) == "wipe") { patch.insert("softness", 0.65); }
                        if (QString::fromLatin1(mode) == "wipe" || QString::fromLatin1(mode) == "push" || QString::fromLatin1(mode) == "slide") {
                            patch.insert("direction", duration == 100 ? "right" : duration == 500 ? "up" : "down");
                        }
                        doc = edit(doc, {{"clipId", "cut-b"}, {"patch", patch}});
                    }
                    const auto path = QStringLiteral(NT_TRANSITION_BUILD "/transition-%1.json").arg(files.size());
                    QFile file(path); QVERIFY(file.open(QIODevice::WriteOnly)); file.write(QJsonDocument(doc).toJson()); files.append(path);
                }
            }
        }
        QProcess process;
        process.start("node", QStringList{QStringLiteral(NT_TRANSITION_SOURCE "/scripts/plan-conformance.mjs"), "--bin", QStringLiteral(NT_TRANSITION_BUILD "/nodetool-timeline")} + files);
        QVERIFY(process.waitForFinished(180000));
        const auto output = process.readAllStandardOutput() + process.readAllStandardError();
        QVERIFY2(process.exitCode() == 0, output.constData());
        QVERIFY(output.contains("PASS:"));
        qInfo().noquote() << output;
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    if (app.arguments().contains("--edits")) {
        QFile input; if (!input.open(stdin, QIODevice::ReadOnly)) { return 1; }
        QJsonArray results;
        for (const auto& request : QJsonDocument::fromJson(input.readAll()).array()) {
            const auto r = request.toObject(); const auto edit = nt::app::findEdit(r.value("action").toString());
            const auto doc = r.value("doc").toObject(); results.append(edit ? edit(doc, r.value("payload").toObject()) : doc);
        }
        const auto bytes = QJsonDocument(results).toJson(QJsonDocument::Compact);
        std::fwrite(bytes.constData(), 1, static_cast<size_t>(bytes.size()), stdout); return 0;
    }
    TestTransitions tests; return QTest::qExec(&tests, argc, argv);
}
#include "tst_transitions.moc"
