#include "edit/ClipGestureController.h"
#include "edit/clipeffects/ClipAnalysisController.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QPointer>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtQuickTest/quicktest.h>
#include <QUuid>
#include <QtTest>
#include <memory>
#include <algorithm>

namespace {
QQuickItem* find(QQuickItem* root, const QString& name) {
    if (!root) { return nullptr; }
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = find(child, name)) { return found; }
    }
    return nullptr;
}
QQuickItem* resetAction(QQuickItem* root) {
    if (!root) { return nullptr; }
    if (root->inherits("QQuickAbstractButton") && root->property("accessibleName").toString() == "Reset Basic Correction") { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = resetAction(child)) { return found; }
    }
    return nullptr;
}
QQuickItem* sliderControl(QQuickItem* root) {
    if (!root) { return nullptr; }
    if (root->inherits("QQuickSlider")) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = sliderControl(child)) { return found; }
    }
    return nullptr;
}
QStringList itemsAt(QQuickItem* root, const QPointF& scenePoint) {
    QStringList result;
    if (!root || !root->isVisible()) { return result; }
    const auto local = root->mapFromScene(scenePoint);
    const bool contains = root->contains(local);
    if (root->clip() && !contains) { return result; }
    if (contains) {
        result.append(QString("%1 name=%2 local=(%3,%4) size=(%5,%6) z=%7 enabled=%8")
            .arg(root->metaObject()->className(), root->objectName())
            .arg(local.x()).arg(local.y()).arg(root->width()).arg(root->height())
            .arg(root->z()).arg(root->isEnabled()));
    }
    for (auto* child : root->childItems()) { result.append(itemsAt(child, scenePoint)); }
    return result;
}
bool number(QObject* item, const char* signal, double value) {
    return item && QMetaObject::invokeMethod(item, signal, Q_ARG(double, value));
}
bool text(QObject* item, const char* signal, const QString& value) {
    return item && QMetaObject::invokeMethod(item, signal, Q_ARG(QString, value));
}
bool toggle(QObject* item, const char* signal, bool value) {
    return item && QMetaObject::invokeMethod(item, signal, Q_ARG(bool, value));
}
QJsonObject identityCurves() {
    return {{"type", "curves"}, {"enabled", true}, {"master", QJsonArray{QJsonObject{{"x", 0}, {"y", 0}}, QJsonObject{{"x", 1}, {"y", 1}}}}};
}
struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    Editor() {
        auto parsed = nt::parseTimelineJson(R"({"id":"d6-inspector","projectId":"native-prototype","name":"Effects inspector","width":640,"height":360,"fps":30,"durationMs":1000,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z","markers":[],"tracks":[{"id":"v","type":"video","name":"Video","index":0,"visible":true,"locked":false}],"clips":[
          {"id":"picture","name":"Picture","trackId":"v","mediaType":"image","sourceType":"imported","status":"generated","locked":false,"versions":[],"startMs":0,"durationMs":1000,"width":640,"height":360,"custom":"keep"},
          {"id":"other","name":"Other","trackId":"v","mediaType":"image","sourceType":"imported","status":"generated","locked":false,"versions":[],"startMs":1000,"durationMs":1000}
        ]})");
        if (!parsed.timeline) { error = "Invalid test document"; return; }
        model.setTimeline(std::move(*parsed.timeline));
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 800}}));
        error = component.errorString();
        window.resize(1280,800);
        if (auto* root = qobject_cast<QQuickItem*>(object.get())) { root->setParentItem(window.contentItem()); }
        window.show(); // Only the offscreen Qt platform is allowed by main().
        if (!QTest::qWaitForWindowExposed(&window)) { error = "Offscreen window did not expose"; object.reset(); return; }
        QCoreApplication::processEvents();
        // The dock layout is saved, so a case that showed another panel leaves it in front.
        if (object && !showPanel("effectControls")) { error = "Effect Controls did not open"; object.reset(); return; }
        if (object) { select("picture"); }
    }
    QQuickItem* item(const QString& name) {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        return find(window.contentItem(), name);
    }
    // The Color panel holds the same controls by name, in a tab that may be behind this one.
    QQuickItem* inEffectControls(const QString& name) {
        return find(item("effectControlsPanel"), name);
    }
    void select(const QString& id) {
        object->findChild<ClipGestureController*>("clipGestures")->setSelection({id});
        QCoreApplication::processEvents();
    }
    QJsonObject clip() const { return model.clipsJson()[0].toObject(); }
    QJsonArray effects() const { return clip()["effects"].toArray(); }
    // Brings a panel to the front through the same call as the Window menu.
    bool showPanel(const QString& id) {
        QVariant shown;
        if (!QMetaObject::invokeMethod(object.get(), "focusPanel", Q_RETURN_ARG(QVariant, shown), Q_ARG(QVariant, id)) || !shown.toBool()) { return false; }
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        return true;
    }
    void reveal(QQuickItem* target) {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        QQuickItem* viewport = target;
        while (viewport && !viewport->property("contentY").isValid()) { viewport = viewport->parentItem(); }
        if (!viewport) { return; }
        const auto y = target->mapToItem(viewport,QPointF{}).y();
        const double maximum = std::max(0.0, viewport->property("contentHeight").toDouble() - viewport->height());
        const double next = viewport->property("contentY").toDouble() + y - 10;
        viewport->setProperty("contentY", std::clamp(next, 0.0, maximum));
        QVERIFY(viewport->property("contentY").toDouble() >= 0);
        QVERIFY(viewport->property("contentY").toDouble() <= maximum);
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
    }
    void click(QQuickItem* target) {
        reveal(target);
        QVERIFY(target->isVisible());
        QVERIFY(target->isEnabled());
        window.requestActivate();
        QVERIFY(QTest::qWaitForWindowActive(&window));
        QQuickTest::qWaitForPolish(&window);
        const auto at = target->mapToScene(QPointF(target->width()/2,target->height()/2)).toPoint();
        for (auto* parent = target; parent; parent = parent->parentItem()) {
            if (parent->clip()) {
                QVERIFY2(parent->contains(parent->mapFromScene(at)),
                    qPrintable("Click outside clipped ancestor: " + parent->objectName()));
            }
        }
        const auto targetName = target->objectName();
        QSignalSpy clicked(target, SIGNAL(clicked()));
        QVERIFY(clicked.isValid());
        QTest::mouseClick(&window,Qt::LeftButton,Qt::NoModifier,at);
        QCoreApplication::processEvents();
        const auto diagnostic = QString("Click did not reach %1 at (%2,%3). Items under pointer:\n%4")
            .arg(targetName).arg(at.x()).arg(at.y())
            .arg(itemsAt(window.contentItem(), at).join('\n'));
        QVERIFY2(clicked.count() == 1, qPrintable(diagnostic));
    }
    // A grade, which the Effects panel leaves to the Color panel.
    bool addGrade(const QString& id, const QJsonObject& grade) {
        auto next = effects();
        auto effect = grade;
        effect.insert("id", id);
        next.append(effect);
        return model.applyEdit("patchClip", {{"clipId", "picture"}, {"patch", QJsonObject{{"effects", next}}}}) != 0;
    }
    // Through the panel, as a person does it: a double-click on its row.
    bool add(const QString& type) {
        if (!showPanel("effects")) { return false; }
        if (!QTest::qWaitFor([&] { auto* row = item("effectsAdd_"+type); return row && row->isVisible(); })) { return false; }
        auto* row = item("effectsAdd_"+type);
        reveal(row);
        window.requestActivate();
        if (!QTest::qWaitForWindowActive(&window)) { return false; }
        QTest::mouseDClick(&window,Qt::LeftButton,Qt::NoModifier,row->mapToScene(QPointF(row->width()/2,row->height()/2)).toPoint());
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        return true;
    }
    void patch(const QJsonObject& patch) {
        model.applyEdit("patchClip", {{"clipId","picture"},{"patch",patch}});
        model.undoStack()->clear();
        QCoreApplication::processEvents();
    }
};
}
class TestClipEffects : public QObject {
    Q_OBJECT
    // These groups vary only the effect. Keep the editor mounted and reset the document per row.
    std::unique_ptr<Editor> dataEditor;
    QByteArray dataDocument;
    QByteArray dataFunction;
    Editor& editorForDataRow() {
        const QByteArray function = QTest::currentTestFunction();
        if (!dataEditor || dataFunction != function) {
            dataEditor = std::make_unique<Editor>();
            dataDocument = dataEditor->model.documentJson();
            dataFunction = function;
        } else {
            auto parsed = nt::parseTimelineJson(dataDocument);
            dataEditor->model.setTimeline(std::move(*parsed.timeline));
            dataEditor->select("picture");
        }
        return *dataEditor;
    }
private slots:
    void init() {
        const QByteArray function = QTest::currentTestFunction();
        if (function != "catalogue" && function != "parameterFields") {
            dataEditor.reset();
        }
        QTest::failOnWarning(QRegularExpression("(EffectFields|ToneCurveEditor)\\.qml:.*(Unable to assign|TypeError|ReferenceError)"));
        QTest::failOnWarning(QRegularExpression(
            "(InspectorActionButton|InspectorSectionTitle)\\.qml:.*does not support customization"));
    }
    void registration();
    void gradesAreNotAddable();
    void effectControlsOpensTheColorPanel();
    void colorGestureUndoReset_data();
    void colorGestureUndoReset();
    void colorRangesAndPointerGesture();
    void catalogue_data();
    void catalogue();
    void analysisLifecycle();
    void stabilizationLifecycle();
    void listActionsAndParameterGesture_data();
    void listActionsAndParameterGesture();
    void dragReorder();
    void collapsedRowsReleaseSpace();
    void parameterFields_data();
    void parameterFields();
    void importedColorInstance();
    void fixedProcessingStages();
    void softVignettePreset();
    void invalidNumbersAndGestureCancellation();
    void curvePointEditing();
    void secondaryColorEditing();
    void cancellationLocksAndPlayhead();
    void groupSections();
    void foldsAndSearch();
    void exportDocuments();
};

void TestClipEffects::stabilizationLifecycle() {
    Editor editor; QVERIFY2(editor.object,qPrintable(editor.error));
    const auto directory=QString(NT_TIMELINE_DIR)+"/src/preview/effects/fixtures/";
    const auto path=directory+"source-jitter.mp4"; QVERIFY(QFile::exists(path));
    QJsonObject effect{{"id","analysis"},{"type","stabilize"},{"enabled",true}};
    editor.patch({{"mediaType","video"},{"mediaPath",path},{"durationMs",2000},{"effects",QJsonArray{effect}}});
    auto media=*editor.model.findClip("picture"); media.mediaPath=path.toStdString(); editor.model.registerMedia(media);
    ClipAnalysisController controller;
    controller.setModel(&editor.model); controller.setClipId("picture"); controller.setEffectId("analysis");
    controller.analyze(); QVERIFY(controller.busy()); QTRY_VERIFY_WITH_TIMEOUT(!controller.busy(),30000);
    QVERIFY2(controller.status().startsWith("Analysis ready"),qPrintable(controller.status()));
    const auto data=editor.model.findClip("picture")->raw.value("effects").toArray()[0].toObject().value("analysis").toObject();
    QCOMPARE(data.value("kind").toString(),QString("stabilize")); QVERIFY(data.value("trackedFrames").toInt()>=50);
    const auto samples=data.value("samples").toArray(); QCOMPARE(samples.size(),60);
    QFile reference(directory+"clip-stabilize.json"); QVERIFY(reference.open(QIODevice::ReadOnly));
    const auto expected=QJsonDocument::fromJson(reference.readAll()).object().value("clips").toArray()[0].toObject()
        .value("effects").toArray()[0].toObject().value("analysis").toObject().value("samples").toArray();
    for (int i : {10,11,20,31,40,50}) { for (const auto* axis : {"x","y"}) {
        QVERIFY2(std::abs(samples[i].toObject().value(axis).toDouble()-expected[i].toObject().value(axis).toDouble())<.004,axis);
    } }
    QVERIFY(data.value("requiredZoom").toDouble()>1.01); QVERIFY(data.value("requiredZoom").toDouble()<1.15);
    QCOMPARE(editor.model.undoStack()->count(),1); const auto saved=editor.model.documentJson();
    editor.model.undoStack()->undo(); QVERIFY(controller.status().startsWith("Analyze the source"));
    editor.model.undoStack()->redo(); QCOMPARE(editor.model.documentJson(),saved);
    controller.analyze(); controller.cancel(); QTest::qWait(50); QCOMPARE(editor.model.documentJson(),saved);
}
void TestClipEffects::analysisLifecycle() {
    Editor editor; QVERIFY2(editor.object,qPrintable(editor.error));
    const auto path=QString(NT_TIMELINE_DIR)+"/src/preview/effects/fixtures/source-flicker.mp4";
    QVERIFY(QFile::exists(path));
    QJsonObject effect{{"id","analysis"},{"type","deflicker"},{"enabled",true},{"windowMs",500},{"maxCorrection",1}};
    editor.patch({{"mediaType","video"},{"mediaPath",path},{"durationMs",3000},{"effects",QJsonArray{effect}}});
    auto media=*editor.model.findClip("picture"); media.mediaPath=path.toStdString();
    editor.model.registerMedia(media);
    ClipAnalysisController controller;
    controller.setModel(&editor.model); controller.setClipId("picture"); controller.setEffectId("analysis");
    controller.analyze(); QVERIFY(controller.busy());
    QTRY_VERIFY_WITH_TIMEOUT(!controller.busy(),10000);
    QVERIFY2(controller.status().startsWith("Analysis ready"),qPrintable(controller.status()));
    QCOMPARE(editor.model.undoStack()->count(),1);
    const auto samples=editor.model.findClip("picture")->raw.value("effects").toArray()[0].toObject()
        .value("analysis").toObject().value("samples").toArray();
    QCOMPARE(samples.size(),90);
    for (int i=8;i<22;++i) {
        const double expected=i%2 ? -.5 : .5;
        QVERIFY(std::abs(samples[i].toObject().value("stops").toDouble()-expected)<.1);
    }
    for (int i=60;i<90;++i) { QCOMPARE(samples[i].toObject().value("stops").toDouble(),0.); }
    const auto saved=editor.model.documentJson();
    editor.model.undoStack()->undo(); QVERIFY(controller.status().startsWith("Analyze the source"));
    editor.model.undoStack()->redo(); QCOMPARE(editor.model.documentJson(),saved);
    controller.analyze(); QVERIFY(controller.busy()); controller.cancel();
    QTest::qWait(50); QCOMPARE(editor.model.documentJson(),saved); QCOMPARE(editor.model.undoStack()->count(),1);
    controller.analyze(); QVERIFY(controller.busy());
    effect=editor.model.findClip("picture")->raw.value("effects").toArray()[0].toObject();
    const auto oldAnalysis=effect.value("analysis"); effect.insert("windowMs",1000);
    editor.model.applyEdit("patchClip",{{"clipId","picture"},{"patch",QJsonObject{{"effects",QJsonArray{effect}}}}});
    QTRY_VERIFY(!controller.busy()); QTest::qWait(50);
    QCOMPARE(editor.model.findClip("picture")->raw.value("effects").toArray()[0].toObject().value("analysis"),oldAnalysis);
    QCOMPARE(editor.model.undoStack()->count(),2);
    controller.analyze(); QVERIFY(controller.busy()); editor.model.close();
    QTRY_VERIFY(!controller.busy()); QTest::qWait(50); QCOMPARE(editor.model.clipCount(),0);
    QCOMPARE(editor.model.undoStack()->count(),0);
}

void TestClipEffects::registration() {
        InspectorSectionRegistry registry;
        const auto sections = registry.sections();
        // The Color panel owns the grades and the Effects panel adds the rest, so the Inspector has neither section.
        QVERIFY(!sections.isEmpty());
        for (const auto* id : {"color", "effects", "audioEffects"}) {
            QVERIFY2(std::none_of(sections.begin(), sections.end(), [&](const QVariant& entry) { return entry.toMap()["id"].toString() == id; }), id);
        }
    }

void TestClipEffects::colorGestureUndoReset_data() {
    QTest::addColumn<int>("scrollBarWidth");
    QTest::newRow("platform-scrollbar") << -1;
    // The macOS native scrollbar occupies 14 pixels of the viewport.
    QTest::newRow("wide-scrollbar") << 14;
}

void TestClipEffects::listActionsAndParameterGesture_data() {
    colorGestureUndoReset_data();
}

void TestClipEffects::gradesAreNotAddable() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        QVERIFY(e.showPanel("effects"));
        QVERIFY(QTest::qWaitFor([&] { return e.item("effectsAdd_blur") != nullptr; }));
        for (const auto* type : {"color", "curves", "liftGammaGain", "vignette"}) {
            QVERIFY2(!e.item("effectsAdd_" + QString::fromLatin1(type)), type);
        }
    }

void TestClipEffects::effectControlsOpensTheColorPanel() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        e.patch({{"effects",QJsonArray{
            QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true}},
            QJsonObject{{"id","c"},{"type","curves"},{"enabled",true},{"master",QJsonArray{}}},
            QJsonObject{{"id","l"},{"type","liftGammaGain"},{"enabled",true}},
            QJsonObject{{"id","v"},{"type","vignette"},{"enabled",true}},
            QJsonObject{{"id","b"},{"type","blur"},{"enabled",true},{"radius",8}}}}});
        QVERIFY(e.showPanel("effectControls"));
        QVERIFY(QTest::qWaitFor([&] { auto* row = e.item("effectControlsGroup_effect:c"); return row && row->isVisible(); }));
        QVERIFY(!e.item("effectControlsOpenColor_b")->isVisible());
        if (const auto screenshot = qEnvironmentVariable("NT_EFFECT_CONTROLS_SCREENSHOT"); !screenshot.isEmpty()) {
            QVERIFY(e.window.grabWindow().save(screenshot));
        }
        const auto before = e.model.documentJson();
        for (const auto* id : {"inspector:color", "c", "l", "v"}) {
            QVERIFY(e.showPanel("effectControls"));
            auto* open = e.item("effectControlsOpenColor_" + QString::fromLatin1(id)); QVERIFY2(open, id);
            QTRY_VERIFY2(open->isVisible(), id);
            QVERIFY(!e.item("colorPanel")->isVisible());
            e.click(open);
            QTRY_VERIFY2(e.item("colorPanel")->isVisible(), id);
        }
        QCOMPARE(e.model.documentJson(),before);
    }

void TestClipEffects::colorGestureUndoReset() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        QVERIFY(e.showPanel("color"));
        QFETCH(int, scrollBarWidth);
        if (scrollBarWidth > 0) {
            auto* scrollBar = e.item("colorPanelScrollBar"); QVERIFY(scrollBar);
            scrollBar->setProperty("implicitWidth", scrollBarWidth);
            scrollBar->setWidth(scrollBarWidth);
            scrollBar->setProperty("policy", 2); // ScrollBar.AlwaysOn
            scrollBar->setProperty("active", true);
            QCOMPARE(scrollBar->width(), qreal(scrollBarWidth));
        }
        auto* color = e.item("colorBasicSection"); QVERIFY(color);
        QVERIFY(QMetaObject::invokeMethod(color, "toggled", Q_ARG(bool, true)));
        const auto original = e.model.documentJson();
        QVERIFY(toggle(color,"checkedChangedByUser",true));
        QCOMPARE(e.effects(),QJsonArray({QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true}}}));
        QCOMPARE(e.model.undoStack()->count(),1);
        auto* brightness = e.item("colorBasic_brightness"); QVERIFY(brightness);
        QVERIFY(QMetaObject::invokeMethod(brightness,"gestureStarted"));
        QVERIFY(number(brightness,"preview",0.1)); QVERIFY(number(brightness,"preview",0.25));
        QCOMPARE(e.model.undoStack()->count(),1);
        QCOMPARE(e.effects()[0].toObject()["brightness"].toDouble(),0.25);
        QVERIFY(number(brightness,"change",0.25)); QCOMPARE(e.model.undoStack()->count(),2);
        const auto edited = e.model.documentJson();
        e.model.undoStack()->undo(); QVERIFY(!e.effects()[0].toObject().contains("brightness"));
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),original);
        e.model.undoStack()->redo(); e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),edited);
        auto* reset = resetAction(e.item("colorBasicSection")); QVERIFY(reset);
        e.click(reset); QCOMPARE(e.effects().size(),0);
        QCOMPARE(e.model.undoStack()->count(),3);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),edited);
        e.model.undoStack()->redo(); QCOMPARE(e.effects().size(),0);
        QCOMPARE(e.clip()["custom"].toString(),QString("keep"));
    }

void TestClipEffects::catalogue_data() {
        QTest::addColumn<QByteArray>("expected");
        // Creation defaults, including effects available only in the native inspector.
        const QList<QByteArray> rows{
            R"({"type":"denoise","enabled":true,"lumaStrength":0,"chromaStrength":0,"temporalStrength":0,"radius":2})",
            R"({"type":"stabilize","enabled":true,"strength":1,"windowMs":500,"maxZoom":1.1})",
            R"({"type":"deflicker","enabled":true,"strength":1,"windowMs":500,"maxCorrection":1})",
            R"({"type":"deband","enabled":true,"strength":0,"range":16,"threshold":0.02,"dither":0.5})",
            R"({"type":"secondaryColor","enabled":true,"hueCenter":0,"hueWidth":180,"hueSoftness":15,"rangeSoftness":0.1,"saturationMin":0,"saturationMax":1,"lightnessMin":0,"lightnessMax":1,"hueShift":0,"saturation":1,"lightness":0})",
            R"({"type":"exposure","enabled":true,"exposure":0,"rolloff":0,"whites":0})",
            R"({"type":"blur","enabled":true,"radius":8})",
            R"({"type":"glow","enabled":true,"radius":8,"intensity":1})",
            R"({"type":"dropShadow","enabled":true,"offsetX":8,"offsetY":8,"blur":12,"color":"#000000","opacity":0.6})",
            R"({"type":"sharpen","enabled":true,"amount":0.5,"radius":1})",
            R"({"type":"chromaKey","enabled":true,"color":"#00ff00","tolerance":0.2,"softness":0.1,"spill":0.5})",
            R"({"type":"levels","enabled":true,"inBlack":0,"inWhite":1,"gamma":1,"outBlack":0,"outWhite":1})",
            R"({"type":"grain","enabled":true,"amount":0.25,"size":1,"colorAmount":0,"roughness":0.5,"softness":0.25,"animate":true})",
            R"({"type":"pixelate","enabled":true,"cellSize":8})",
            R"({"type":"posterize","enabled":true,"levels":4})",
            R"({"type":"directionalBlur","enabled":true,"radius":8,"angle":0})",
            R"({"type":"lensDistortion","enabled":true,"amount":0.5})"};
        for (const auto& row : rows) { QTest::newRow(qPrintable(QJsonDocument::fromJson(row).object()["type"].toString())) << row; }
    }

void TestClipEffects::catalogue() {
        QFETCH(QByteArray,expected);
        const auto wanted = QJsonDocument::fromJson(expected).object();
        Editor& e = editorForDataRow(); QVERIFY2(e.object,qPrintable(e.error));
        QCOMPARE(e.model.documentJson(), dataDocument);
        QCOMPARE(e.model.undoStack()->count(), 0);
        const auto before = e.model.documentJson();
        QVERIFY2(e.add(wanted["type"].toString()),"Add effect must be reachable through the searchable popover");
        QCOMPARE(e.effects().size(),1); auto actual = e.effects()[0].toObject();
        QVERIFY(!QUuid(actual["id"].toString()).isNull()); actual.remove("id"); QCOMPARE(actual,wanted);
        QCOMPARE(e.model.undoStack()->count(),1);
        const auto after = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
    }

void TestClipEffects::listActionsAndParameterGesture() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        QFETCH(int, scrollBarWidth);
        if (scrollBarWidth > 0) {
            auto* scrollBar = e.item("effectControlsRowsScroll"); QVERIFY(scrollBar);
            scrollBar->setProperty("implicitWidth", scrollBarWidth);
            scrollBar->setWidth(scrollBarWidth);
            scrollBar->setProperty("policy", 2); // ScrollBar.AlwaysOn
            scrollBar->setProperty("active", true);
            QCOMPARE(scrollBar->width(), qreal(scrollBarWidth));
        }
        e.patch({{"effects",QJsonArray{
            QJsonObject{{"id","a"},{"type","directionalBlur"},{"enabled",true},{"radius",8},{"angle",0},{"sigma",2}},
            QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true},{"contrast",1.3}},
            QJsonObject{{"id","future"},{"type","futureEffect"},{"enabled",true},{"opaque",QJsonObject{{"x",7}}}},
            QJsonObject{{"id","b"},{"type","vignette"},{"enabled",false},{"amount",0.4},{"softness",0.5}}}}});
        QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsGroup_effect:inspector:color") != nullptr; }));
        QVERIFY(!e.item("effectsReorder_inspector:color")->isVisible());
        const auto before = e.model.documentJson();
        auto* reorder = e.item("effectsReorder_a"); QVERIFY(reorder); reorder->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Down,Qt::AltModifier);
        QCOMPARE(e.effects()[0].toObject()["id"].toString(),QString("future"));
        QCOMPARE(e.effects()[1].toObject()["id"].toString(),QString("inspector:color"));
        QCOMPARE(e.effects()[2].toObject()["id"].toString(),QString("a"));
        QCOMPARE(e.model.undoStack()->count(),1);
        const auto moved = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),moved);
        auto* enabled = e.item("effectControlsEnable_effect:b"); QVERIFY(enabled); e.click(enabled);
        QCOMPARE(e.effects()[3].toObject()["enabled"].toBool(),true); QCOMPARE(e.model.undoStack()->count(),2);
        auto* radius = e.item("effectControls_effect:a:radius_input_0"); QVERIFY(radius);
        QVERIFY(QMetaObject::invokeMethod(radius,"gestureStarted"));
        QVERIFY(text(radius,"preview","10")); QVERIFY(text(radius,"preview","12.5"));
        QCOMPARE(e.model.undoStack()->count(),2);
        QVERIFY(text(radius,"commit","12.5")); QCOMPARE(e.model.undoStack()->count(),3);
        QCOMPARE(e.effects()[2].toObject()["radius"].toDouble(),12.5);
        QCOMPARE(e.effects()[2].toObject()["sigma"].toDouble(),2.0);
        auto* remove = e.item("effectsRemove_future"); QVERIFY(remove);
        const auto beforeRemove = e.model.documentJson(); e.click(remove);
        QCOMPARE(e.effects().size(),3); QCOMPARE(e.model.undoStack()->count(),4);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),beforeRemove);
        e.model.undoStack()->redo(); QCOMPARE(e.effects().size(),3);
        for (int i = 0; i < 4; ++i) { e.model.undoStack()->undo(); }
        QCOMPARE(e.model.documentJson(),before);
    }

void TestClipEffects::parameterFields_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<QString>("field");
        QTest::addColumn<QString>("input"); QTest::addColumn<QByteArray>("expected");
        const auto row = [](const char* name,const QString& type,const QString& field,const QString& input,const QByteArray& expected) {
            QTest::newRow(name) << type << field << input << expected;
        };
        row("exposure-stops","exposure","exposure","1.5",R"({"exposure":1.5})");
        row("exposure-rolloff","exposure","rolloff","0.7",R"({"rolloff":0.7})");
        row("denoise-luma","denoise","lumaStrength","0.7",R"({"lumaStrength":0.7})");
        row("denoise-chroma","denoise","chromaStrength","0.8",R"({"chromaStrength":0.8})");
        row("denoise-temporal","denoise","temporalStrength","0.9",R"({"temporalStrength":0.9})");
        row("denoise-radius","denoise","radius","3",R"({"radius":3})");
        row("stabilize-strength","stabilize","strength","0.8",R"({"strength":0.8})");
        row("stabilize-window","stabilize","windowMs","1000",R"({"windowMs":1000})");
        row("stabilize-zoom","stabilize","maxZoom","1.2",R"({"maxZoom":1.2})");
        row("deflicker-strength","deflicker","strength","0.8",R"({"strength":0.8})");
        row("deflicker-window","deflicker","windowMs","1000",R"({"windowMs":1000})");
        row("deflicker-limit","deflicker","maxCorrection","2",R"({"maxCorrection":2})");
        row("deband-strength","deband","strength","0.8",R"({"strength":0.8})");
        row("deband-range","deband","range","24",R"({"range":24})");
        row("deband-threshold","deband","threshold","0.025",R"({"threshold":0.025})");
        row("deband-dither","deband","dither","0.9",R"({"dither":0.9})");
        row("exposure-whites","exposure","whites","-0.5",R"({"whites":-0.5})");
        row("glow-radius","glow","radius","27",R"({"radius":27})");
        row("shadow-offset","dropShadow","offsetX","-18",R"({"offsetX":-18})");
        row("shadow-color","dropShadow","color","#123456",R"({"color":"#123456"})");
        row("sharpen-radius","sharpen","radius","2.5",R"({"radius":2.5})");
        row("levels-gamma","levels","gamma","1.35",R"({"gamma":1.35})");
        row("lift-red","liftGammaGain","lift_0","-0.2",R"({"lift":[-0.2,0,0]})");
        row("gamma-green","liftGammaGain","gamma_1","1.4",R"({"gamma":[1,1.4,1]})");
        row("gain-blue","liftGammaGain","gain_2","0.8",R"({"gain":[1,1,0.8]})");
        row("key-color","chromaKey","color","#778899",R"({"color":"#778899"})");
    }

void TestClipEffects::parameterFields() {
        QFETCH(QString,type); QFETCH(QString,field); QFETCH(QString,input); QFETCH(QByteArray,expected);
        Editor& e = editorForDataRow(); QVERIFY2(e.object,qPrintable(e.error));
        QCOMPARE(e.model.documentJson(), dataDocument);
        QCOMPARE(e.model.undoStack()->count(), 0);
        if (type=="denoise") { e.patch({{"mediaType","video"}}); e.model.undoStack()->clear(); }
        if (type == "liftGammaGain") { QVERIFY(e.addGrade("grade",{{"type",type},{"enabled",true},{"lift",QJsonArray{0,0,0}},{"gamma",QJsonArray{1,1,1}},{"gain",QJsonArray{1,1,1}}})); }
        else { QVERIFY(e.add(type)); }
        const auto id = e.effects()[0].toObject()["id"].toString();
        // A keyed field is a row, and any other is a control below the rows.
        auto* row = e.item("effectControls_effect:"+id+":"+field+"_input_0");
        auto* control = row ? row : e.item("effects_"+id+"_"+field); QVERIFY(control);
        const auto before = e.model.documentJson();
        if (!row && (type == "exposure" || type == "deband" || type == "deflicker" || type == "stabilize" || type == "denoise")) { QVERIFY(number(control,"change",input.toDouble())); }
        else { QVERIFY(text(control,"commit",input)); }
        QCOMPARE(e.model.undoStack()->count(),2);
        const auto wanted = QJsonDocument::fromJson(expected).object();
        for (auto it = wanted.begin(); it != wanted.end(); ++it) { QCOMPARE(e.effects()[0].toObject()[it.key()],it.value()); }
        const auto after = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
    }

void TestClipEffects::importedColorInstance() {
    Editor e; QVERIFY2(e.object, qPrintable(e.error));
    const QJsonObject first{{"id", "first"}, {"type", "color"}, {"enabled", true}, {"brightness", 0.1}};
    const QJsonObject second{{"id", "second"}, {"type", "color"}, {"enabled", true}, {"brightness", -0.1}, {"custom", "keep"}};
    e.patch({{"effects", QJsonArray{first, second}}});
    auto* brightness = e.item("effects_second_brightness"); QVERIFY(brightness);
    const auto before = e.model.documentJson();
    QVERIFY(QMetaObject::invokeMethod(brightness, "gestureStarted"));
    QVERIFY(number(brightness, "preview", 0.25));
    QCOMPARE(e.effects().size(), 2);
    QCOMPARE(e.effects()[0], QJsonValue(first));
    QCOMPARE(e.effects()[1].toObject()["brightness"].toDouble(), 0.25);
    QCOMPARE(e.model.undoStack()->count(), 0);
    QVERIFY(number(brightness, "change", 0.25));
    QCOMPARE(e.model.undoStack()->count(), 1);
    QCOMPARE(e.effects()[1].toObject()["custom"].toString(), QString("keep"));
    const auto after = e.model.documentJson();
    e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(), before);
    e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(), after);
}

void TestClipEffects::invalidNumbersAndGestureCancellation() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add("levels"));
        const auto id = e.effects()[0].toObject()["id"].toString();
        auto* gamma = e.item("effectControls_effect:"+id+":gamma_input_0"); QVERIFY(gamma);
        const auto before = e.model.documentJson();
        for (const auto& raw : {QString(""),QString("NaN"),QString("Infinity"),QString("1x")}) {
            QVERIFY(text(gamma,"commit",raw)); QCOMPARE(e.model.documentJson(),before);
        }
        QVERIFY(QMetaObject::invokeMethod(gamma,"gestureStarted"));
        QVERIFY(text(gamma,"preview","2")); QVERIFY(text(gamma,"preview","3"));
        QCOMPARE(e.model.undoStack()->count(),1); QVERIFY(text(gamma,"commit","3"));
        QCOMPARE(e.model.undoStack()->count(),2); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        QVERIFY(QMetaObject::invokeMethod(gamma,"gestureStarted")); QVERIFY(text(gamma,"preview","4"));
        const QPointer<QQuickItem> pending = gamma;
        e.select("other"); QCOMPARE(e.model.documentJson(),before);
        if (pending) { QVERIFY(text(pending,"commit","4")); }
        QCOMPARE(e.model.documentJson(),before);
    }

void TestClipEffects::softVignettePreset() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.addGrade("soft",{{"type","vignette"},{"enabled",true},{"amount",0.4},{"softness",0.5}}));
    const auto original=e.effects()[0].toObject();
    const auto before=e.model.documentJson();
    auto* preset=e.item("effects_"+original["id"].toString()+"_softPreset"); QVERIFY(preset);
    e.click(preset);
    const auto changed=e.effects()[0].toObject();
    QCOMPARE(changed["radius"].toDouble(),1.5); QCOMPARE(changed["softness"].toDouble(),1.0);
    QCOMPARE(changed["centerX"].toDouble(),0.5); QCOMPARE(changed["roundness"].toDouble(),0.0);
    QCOMPARE(changed["amount"],original["amount"]);
    QCOMPARE(e.model.undoStack()->count(),2);
    e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
}

void TestClipEffects::fixedProcessingStages() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error));
    e.patch({{"effects",QJsonArray{
        QJsonObject{{"id","blur"},{"type","blur"},{"enabled",true},{"radius",8}},
        QJsonObject{{"id","color"},{"type","color"},{"enabled",true},{"brightness",0.2}},
        QJsonObject{{"id","v"},{"type","vignette"},{"enabled",true},{"amount",0.5}}
    }}});
    const auto before=e.model.documentJson();
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsGroup_effect:blur") != nullptr; }));
    QQuickTest::qWaitForPolish(&e.window);
    auto* v=e.item("effectControlsGroup_effect:v")->parentItem(); auto* color=e.item("effectControlsGroup_effect:color")->parentItem(); auto* blur=e.item("effectControlsGroup_effect:blur")->parentItem();
    QVERIFY(v && color && blur);
    QVERIFY(v->y()<color->y()); QVERIFY(color->y()<blur->y());
    QVERIFY(e.item("effectsReorder_v")->isVisible());
    QVERIFY(!e.item("effectsReorder_color")->isVisible());
    QVERIFY(!e.item("effectsReorder_blur")->isVisible());
    QCOMPARE(e.model.documentJson(),before);
}

void TestClipEffects::secondaryColorEditing() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add("secondaryColor"));
    const auto id=e.effects()[0].toObject()["id"].toString();
    e.model.undoStack()->clear();
    const auto before=e.model.documentJson();
    auto* matte=e.item("effects_"+id+"_matte"); QVERIFY(matte); e.click(matte);
    QCOMPARE(e.model.effectMatteId(),id); QCOMPARE(e.model.documentJson(),before); QCOMPARE(e.model.undoStack()->count(),0);
    auto* width=e.item("effectControls_effect:"+id+":hueWidth_input_0"); QVERIFY(width);
    QVERIFY(text(width,"commit","30"));
    QCOMPARE(e.effects()[0].toObject()["hueWidth"].toDouble(),30.);
    QCOMPARE(e.model.effectMatteId(),id); QCOMPARE(e.model.undoStack()->count(),1);
    e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
    auto* curves=e.item("effects_"+id+"_secondaryCurves"); QVERIFY(curves);
    const QVariant nextPoint=QVariantMap{{"x",0.5},{"y",0.75}};
    QVERIFY(QMetaObject::invokeMethod(curves,"addPoint",Q_ARG(QVariant,nextPoint)));
    const auto points=e.effects()[0].toObject()["hueCurve"].toArray(); QCOMPARE(points.size(),3);
    QCOMPARE(points[0].toObject()["y"],points[2].toObject()["y"]);
    auto* first=find(curves,"toneCurvePoint_0"); QVERIFY(first); first->forceActiveFocus();
    QTest::keyClick(&e.window,Qt::Key_Up);
    const auto changed=e.effects()[0].toObject()["hueCurve"].toArray();
    QCOMPARE(changed[0].toObject()["y"],changed[2].toObject()["y"]);
    QVERIFY(changed[0].toObject()["y"].toDouble()>0.5);
    const QList<QPair<QJsonArray,double>> importedCurves{
        {QJsonArray{QJsonObject{{"x",0.5},{"y",0.25}}},0.25},
        {QJsonArray{QJsonObject{{"x",1},{"y",0.8}},QJsonObject{{"x",0},{"y",0.6}},QJsonObject{{"x",0},{"y",0.7}}},0.7}};
    for (const auto& [input,red] : importedCurves) {
        auto imported=e.effects()[0].toObject(); imported.insert("hueCurve",input);
        e.patch({{"effects",QJsonArray{imported}}});
        auto* current=e.item("effects_"+id+"_secondaryCurves"); QVERIFY(current);
        auto displayed=current->property("points");
        if (displayed.canConvert<QJSValue>()) { displayed=displayed.value<QJSValue>().toVariant(); }
        const auto knots=displayed.toList(); QVERIFY(knots.size()>=2);
        QCOMPARE(knots.first().toMap()["y"].toDouble(),red);
        QCOMPARE(knots.last().toMap()["y"].toDouble(),red);
    }
    const auto saved=e.model.documentJson();
    e.select("other"); QVERIFY(e.model.effectMatteId().isEmpty()); QCOMPARE(e.model.documentJson(),saved);
    e.model.setEffectMattePreview("picture",id); QCOMPARE(e.model.effectMatteId(),id);
    e.model.close(); QVERIFY(e.model.effectMatteId().isEmpty());
}

void TestClipEffects::curvePointEditing() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.addGrade("curve",identityCurves()));
        auto* graph = e.inEffectControls("toneCurveGraph"); QVERIFY(graph); e.reveal(graph);
        const auto before = e.model.documentJson();
        const auto pointAt = [&](double x,double y) { return graph->mapToScene({x*graph->width(),(1-y)*graph->height()}).toPoint(); };
        QTest::mouseClick(&e.window,Qt::LeftButton,Qt::NoModifier,pointAt(0.5,0.7));
        auto points = e.effects()[0].toObject()["master"].toArray(); QCOMPARE(points.size(),3);
        QVERIFY(qAbs(points[1].toObject()["x"].toDouble()-0.5)<0.01);
        QVERIFY(qAbs(points[1].toObject()["y"].toDouble()-0.7)<0.01);
        QCOMPARE(e.model.undoStack()->count(),2);
        const auto added = e.model.documentJson();
        QTest::mousePress(&e.window,Qt::LeftButton,Qt::NoModifier,pointAt(0.5,0.7));
        QTest::mouseMove(&e.window,pointAt(0.6,0.8)); QTest::mouseMove(&e.window,pointAt(0.65,0.85));
        QCOMPARE(e.model.undoStack()->count(),2);
        QTest::mouseRelease(&e.window,Qt::LeftButton,Qt::NoModifier,pointAt(0.65,0.85));
        QCOMPARE(e.model.undoStack()->count(),3);
        const auto dragged = e.model.documentJson(); QVERIFY(dragged != added);
        points = e.effects()[0].toObject()["master"].toArray();
        QVERIFY(qAbs(points[1].toObject()["x"].toDouble()-0.65)<0.01);
        QVERIFY(qAbs(points[1].toObject()["y"].toDouble()-0.85)<0.01);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),added);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),dragged);
        auto* point = e.inEffectControls("toneCurvePoint_1"); QVERIFY(point); point->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Left,Qt::ShiftModifier); QCOMPARE(e.model.undoStack()->count(),4);
        QVERIFY(qAbs(e.effects()[0].toObject()["master"].toArray()[1].toObject()["x"].toDouble()-0.6)<0.01);
        QTest::keyClick(&e.window,Qt::Key_Delete); QCOMPARE(e.model.undoStack()->count(),5);
        QCOMPARE(e.effects()[0].toObject()["master"].toArray().size(),2);
        e.model.undoStack()->undo(); QCOMPARE(e.effects()[0].toObject()["master"].toArray().size(),3);
        auto* reset = e.inEffectControls("toneCurveReset"); QVERIFY(reset); e.click(reset);
        QCOMPARE(e.effects()[0].toObject()["master"],QJsonValue(QJsonArray{QJsonObject{{"x",0},{"y",0}},QJsonObject{{"x",1},{"y",1}}}));
        e.model.undoStack()->undo(); QVERIFY(e.effects()[0].toObject()["master"].toArray().size()==3);
        // RGB reset removes the optional channel, rather than writing null or identity.
        auto* red = e.inEffectControls("toneCurveChannel_r"); QVERIFY(red); e.click(red); e.reveal(graph);
        QTest::mouseClick(&e.window,Qt::LeftButton,Qt::NoModifier,pointAt(0.5,0.4));
        QVERIFY(e.effects()[0].toObject().contains("r")); e.click(reset);
        QVERIFY(!e.effects()[0].toObject().contains("r"));
        e.model.undoStack()->undo(); QVERIFY(e.effects()[0].toObject().contains("r"));
        while (e.model.undoStack()->index()>1) { e.model.undoStack()->undo(); }
        QCOMPARE(e.model.documentJson(),before);
    }

void TestClipEffects::cancellationLocksAndPlayhead() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        QVERIFY(e.showPanel("color"));
        auto* color = e.item("colorBasicSection"); QVERIFY(color); color->setProperty("open",true);
        QVERIFY(toggle(color,"checkedChangedByUser",true)); e.model.undoStack()->clear();
        const auto before = e.model.documentJson();
        auto* brightness = e.item("colorBasic_brightness"); QVERIFY(brightness);
        QVERIFY(QMetaObject::invokeMethod(brightness,"gestureStarted")); QVERIFY(number(brightness,"preview",0.4));
        e.select("other"); QCOMPARE(e.model.documentJson(),before);
        QVERIFY(number(brightness,"change",0.4)); QCOMPARE(e.model.documentJson(),before);
        QCOMPARE(e.model.undoStack()->count(),0);
        e.select("picture");
        e.patch({{"locked",true}}); const auto locked = e.model.documentJson();
        QVERIFY(brightness->property("disabled").toBool());
        QVERIFY(number(brightness,"change",0.3)); QVERIFY(toggle(color,"checkedChangedByUser",false));
        QCOMPARE(e.model.documentJson(),locked); QCOMPARE(e.model.undoStack()->count(),0);
        e.patch({{"locked",false}});
        const auto unedited = e.model.documentJson();
        QSignalSpy clips(&e.model,&TimelineModel::clipsChanged);
        QSignalSpy timeline(&e.model,&TimelineModel::timelineChanged);
        for (int i = 0; i < 100; ++i) { e.clock.seek(i*10); }
        QCOMPARE(clips.count(),0); QCOMPARE(timeline.count(),0); QCOMPARE(e.model.documentJson(),unedited);
    }

void TestClipEffects::groupSections() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); e.patch({{"mediaType","group"}});
        QVERIFY(e.showPanel("inspector"));
        auto* panel = e.item("clipGroupPanel"); QVERIFY(panel); QVERIFY(panel->isVisible());
        // The Color panel grades a group, in place of the web's Color section in ClipGroupPanel.
        QVERIFY(!find(panel,"clipAdjustments"));
        // Effect Controls lists a group's effects, in place of the web's Effects section in ClipGroupPanel.
        QVERIFY(!find(panel,"clipEffectsList"));
        QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsGroup_motion") != nullptr; }));
        QVERIFY(e.showPanel("color"));
        auto* color = e.item("colorBasicSection");
        QVERIFY(color); QTRY_VERIFY(color->isVisible()); QVERIFY(toggle(color,"checkedChangedByUser",true));
        QCOMPARE(e.effects()[0].toObject()["enabled"].toBool(),true); QCOMPARE(e.model.undoStack()->count(),1);
    }

void TestClipEffects::exportDocuments() {
        if (qEnvironmentVariableIsEmpty("NT_D6_OUTPUT")) { QSKIP("Set NT_D6_OUTPUT for the GPU golden runner"); }
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        e.patch({{"mediaPath",QString(NT_TIMELINE_DIR)+"/src/preview/effects/fixtures/visual-source.png"}});
        const QDir directory(qEnvironmentVariable("NT_D6_OUTPUT")); QVERIFY(QDir().mkpath(directory.path()));
        const auto save = [&](const QString& name) {
            QFile file(directory.filePath(name+".json"));
            if (!file.open(QIODevice::WriteOnly)) { return false; }
            if (name == "curves") { e.reveal(e.item("colorCurvesSection")); }
            if (name == "effects") { e.reveal(e.item("colorVignetteSection")); }
            QQuickTest::qWaitForPolish(&e.window);
            if (!e.window.grabWindow().save(directory.filePath(name+"-ui.png"))) { return false; }
            return file.write(e.model.documentJson())>0;
        };
        QVERIFY(save("base"));
        QVERIFY(e.showPanel("color"));
        auto* color = e.item("colorBasicSection"); QVERIFY(color); color->setProperty("open",true);
        QVERIFY(toggle(color,"checkedChangedByUser",true));
        QVERIFY(number(e.item("colorBasic_brightness"),"change",0.15));
        QVERIFY(number(e.item("colorBasic_contrast"),"change",1.2)); QVERIFY(save("color"));
        auto* graph = e.item("toneCurveGraph"); QVERIFY(graph); e.reveal(graph);
        QTest::mouseClick(&e.window,Qt::LeftButton,Qt::NoModifier,graph->mapToScene({graph->width()*0.5,graph->height()*0.3}).toPoint());
        QCOMPARE(e.effects()[1].toObject()["master"].toArray().size(),3); QVERIFY(save("curves"));
        QVERIFY(number(e.item("colorVignette_amount"),"change",0.7)); QVERIFY(save("effects"));
        QCOMPARE(e.effects()[2].toObject()["type"].toString(),QString("vignette"));
        // Select the group through the normal Inspector. Its image remains a child.
        auto clips = e.model.clipsJson(); auto child = clips[0].toObject();
        auto group = child; group.insert("id","group"); group.insert("mediaType","group"); group.remove("mediaPath");
        child.insert("parentId","group"); child.remove("effects"); clips[0] = child; clips.append(group);
        e.model.replaceClips(clips); e.select("group");
        QVERIFY(e.item("clipGroupPanel"));
        QVERIFY(number(e.item("colorBasic_saturation"),"change",0.5)); QVERIFY(save("group"));
    }

int main(int argc, char** argv) {
    if (qgetenv("QT_QPA_PLATFORM") != "offscreen") { qFatal("D6 tests require QT_QPA_PLATFORM=offscreen"); }
    if (qEnvironmentVariableIsEmpty("NODETOOL_TIMELINE_PREFERENCES")) { qFatal("D6 tests require isolated preferences"); }
    QGuiApplication app(argc,argv);
    TestClipEffects test;
    return QTest::qExec(&test,argc,argv);
}

void TestClipEffects::foldsAndSearch() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error));
    const auto cornersOpen = [](Editor& editor) { return editor.item("effectControlsCollapse_borderRadius")->property("iconName").toString() == "arrowDropDown"; };
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsCollapse_borderRadius") != nullptr; }));
    QVERIFY(!cornersOpen(e));
    e.click(e.item("effectControlsCollapse_borderRadius"));
    QVERIFY(cornersOpen(e));
    e.patch({{"mediaType","group"}});
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsCollapse_borderRadius") != nullptr && cornersOpen(e); }));
    e.patch({{"mediaType","image"}});
    Editor restored; QVERIFY(restored.object);
    QVERIFY(QTest::qWaitFor([&] { return restored.item("effectControlsCollapse_borderRadius") != nullptr; }));
    QVERIFY(cornersOpen(restored));
    restored.click(restored.item("effectControlsCollapse_borderRadius"));
    QVERIFY(restored.showPanel("effects"));
    QQuickTest::qWaitForPolish(&restored.window);
    auto* search = restored.item("effectsSearch"); QVERIFY(search); search->forceActiveFocus();
    for (const char key : QByteArray("gRAin")) { QTest::keyClick(&restored.window,key); }
    QQuickTest::qWaitForPolish(&restored.window);
    QVERIFY(restored.item("effectsAdd_grain")); QVERIFY(!restored.item("effectsAdd_blur"));
    QCOMPARE(restored.model.undoStack()->count(),0);
    auto* grain = restored.item("effectsAdd_grain");
    QTest::mouseDClick(&restored.window,Qt::LeftButton,Qt::NoModifier,grain->mapToScene({grain->width()/2,grain->height()/2}).toPoint());
    QCoreApplication::processEvents();
    QCOMPARE(restored.effects().size(),1); QCOMPARE(restored.effects()[0].toObject()["type"].toString(),QString("grain"));
    QCOMPARE(restored.model.undoStack()->count(),1);
}

void TestClipEffects::colorRangesAndPointerGesture() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error));
    QVERIFY(e.showPanel("color"));
    auto* color = e.item("colorBasicSection"); QVERIFY(color); color->setProperty("open",true);
    QVERIFY(toggle(color,"checkedChangedByUser",true));
    struct Range { QString name; double min; double max; double step; double origin; };
    const QList<Range> ranges{{"Brightness",-1,1,0.01,0},{"Contrast",0,4,0.01,1},
        {"Saturation",0,4,0.01,1},{"Hue",-180,180,1,0},{"Temperature",-1,1,0.01,0},
        {"Tint",-1,1,0.01,0},{"Shadows",-1,1,0.01,0},{"Highlights",-1,1,0.01,0}};
    for (const auto& range : ranges) {
        auto* field = e.item("colorBasic_"+range.name.toLower()); QVERIFY(field);
        QCOMPARE(field->property("min").toDouble(),range.min); QCOMPARE(field->property("max").toDouble(),range.max);
        QCOMPARE(field->property("step").toDouble(),range.step); QCOMPARE(field->property("origin").toDouble(),range.origin);
        QCOMPARE(field->property("value").toDouble(),range.origin);
    }
    const auto before = e.model.documentJson();
    auto* slider = sliderControl(e.item("colorBasic_brightness")); QVERIFY(slider); e.reveal(slider);
    const auto at = [&](double x) { return slider->mapToScene({slider->width()*x,slider->height()/2}).toPoint(); };
    QTest::mousePress(&e.window,Qt::LeftButton,Qt::NoModifier,at(0.5));
    QTest::mouseMove(&e.window,at(0.6)); QTest::mouseMove(&e.window,at(0.7));
    QCOMPARE(e.model.undoStack()->count(),1);
    QTest::mouseRelease(&e.window,Qt::LeftButton,Qt::NoModifier,at(0.7));
    QCOMPARE(e.model.undoStack()->count(),2); const auto after = e.model.documentJson(); QVERIFY(after != before);
    e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
    e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
}

void TestClipEffects::dragReorder() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error));
    const QJsonObject owned{{"id","inspector:color"},{"type","color"},{"enabled",true},{"hue",12}};
    e.patch({{"effects",QJsonArray{
        QJsonObject{{"id","a"},{"type","glow"},{"enabled",true},{"radius",8},{"intensity",1}},owned,
        QJsonObject{{"id","b"},{"type","vignette"},{"enabled",true},{"amount",0.4},{"softness",0.5}},
        QJsonObject{{"id","c"},{"type","grain"},{"enabled",true},{"amount",0.25}}}}});
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectsReorder_a") != nullptr; }));
    QQuickTest::qWaitForPolish(&e.window);
    auto* handle = e.item("effectsReorder_a"); QVERIFY(handle); e.reveal(handle);
    auto* target = e.item("effectControlsGroup_effect:c"); QVERIFY(target);
    const auto start = handle->mapToScene({handle->width()/2,handle->height()/2}).toPoint();
    // Past the heading: the drag's threshold leaves the proxy behind the pointer, and the whole group takes a drop.
    const auto end = target->mapToScene({target->width()/2,target->height()+20}).toPoint();
    const auto before = e.model.documentJson();
    QTest::mousePress(&e.window,Qt::LeftButton,Qt::NoModifier,start);
    QTest::mouseMove(&e.window,start+QPoint(0,15)); QTest::mouseMove(&e.window,end);
    QCOMPARE(e.model.undoStack()->count(),0);
    QTest::mouseRelease(&e.window,Qt::LeftButton,Qt::NoModifier,end);
    QCOMPARE(e.model.undoStack()->count(),1);
    QCOMPARE(e.effects()[0].toObject()["id"].toString(),QString("b")); QCOMPARE(e.effects()[1].toObject(),owned);
    QCOMPARE(e.effects()[2].toObject()["id"].toString(),QString("c")); QCOMPARE(e.effects()[3].toObject()["id"].toString(),QString("a"));
    const auto after = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
    e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
}

void TestClipEffects::collapsedRowsReleaseSpace() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.addGrade("curve",identityCurves()));
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsGroup_effect:curve") != nullptr; }));
    QVERIFY(e.add("glow")); QQuickTest::qWaitForPolish(&e.window);
    const auto glowId = e.effects()[1].toObject()["id"].toString();
    QVERIFY(QTest::qWaitFor([&] { return e.item("effectControlsGroup_effect:" + glowId) != nullptr; }));
    auto* curveHeading = e.item("effectControlsGroup_effect:curve"); QVERIFY(curveHeading);
    auto* glowHeading = e.item("effectControlsGroup_effect:" + glowId); QVERIFY(glowHeading);
    QQuickTest::qWaitForPolish(&e.window);
    const auto gap = [&] { return glowHeading->mapToScene({}).y() - curveHeading->mapToScene({}).y(); };
    QVERIFY2(gap() > 300, "The open Curves group holds the tone graph");
    e.click(e.item("effectControlsCollapse_effect:curve"));
    QQuickTest::qWaitForPolish(&e.window);
    QVERIFY2(gap() < 80, "A collapsed Curves group retains the tone graph's height");
}
#include "tst_clipeffects.moc"
