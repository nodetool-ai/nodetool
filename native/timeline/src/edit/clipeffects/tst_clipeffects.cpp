#include "edit/ClipGestureController.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QDir>
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
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
    if (root->inherits("QQuickToolButton") && root->property("text").toString() == "↺") { return root; }
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
        if (object) { select("picture"); }
    }
    QQuickItem* item(const QString& name) {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        return find(window.contentItem(), name);
    }
    void select(const QString& id) {
        object->findChild<ClipGestureController*>("clipGestures")->setSelection({id});
        QCoreApplication::processEvents();
    }
    QJsonObject clip() const { return model.clipsJson()[0].toObject(); }
    QJsonArray effects() const { return clip()["effects"].toArray(); }
    void reveal(QQuickItem* target) {
        QCoreApplication::processEvents();
        QQuickTest::qWaitForPolish(&window);
        auto* viewport = item("inspectorViewport");
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
    bool add(const QString& type) {
        auto* section = item("clipEffectsList");
        if (!section) { return false; }
        if (!QMetaObject::invokeMethod(section, "toggled", Q_ARG(bool, true))) { return false; }
        auto* add = item("effectsAdd");
        if (!add) { return false; }
        click(add);
        QQuickTest::qWaitForPolish(&window);
        if (!QTest::qWaitFor([&] { return item("effectsAdd_"+type) != nullptr; })) { return false; }
        auto* button = item("effectsAdd_"+type);
        if (!button) { return false; }
        // The popover owns its own visual parent, outside the Flickable.
        QTest::mouseClick(&window,Qt::LeftButton,Qt::NoModifier,
            button->mapToScene(QPointF(button->width()/2,button->height()/2)).toPoint());
        QCoreApplication::processEvents();
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
private slots:
    void init() {
        QTest::failOnWarning(QRegularExpression(
            "(InspectorActionButton|InspectorSectionTitle)\\.qml:.*does not support customization"));
    }
    void registration();
    void colorGestureUndoReset();
    void colorRangesAndPointerGesture();
    void catalogue_data();
    void catalogue();
    void listActionsAndParameterGesture();
    void dragReorder();
    void collapsedRowsReleaseSpace();
    void parameterFields_data();
    void parameterFields();
    void invalidNumbersAndGestureCancellation();
    void curvePointEditing();
    void cancellationLocksAndPlayhead();
    void groupSections();
    void foldsAndSearch();
    void exportDocuments();
};

void TestClipEffects::registration() {
        InspectorSectionRegistry registry;
        const auto sections = registry.sections();
        for (const auto& expected : {QPair<QString,int>{"color",50}, {"effects",60}}) {
            bool found = false;
            for (const auto& entry : sections) {
                const auto section = entry.toMap();
                if (section["id"] == expected.first) { QCOMPARE(section["order"].toInt(),expected.second); found = true; }
            }
            QVERIFY2(found,qPrintable("Missing Inspector section: " + expected.first));
        }
    }

void TestClipEffects::colorGestureUndoReset() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        auto* color = e.item("clipAdjustments"); QVERIFY2(color,"ClipAdjustments must be in the Inspector");
        QVERIFY(QMetaObject::invokeMethod(color, "toggled", Q_ARG(bool, true)));
        const auto original = e.model.documentJson();
        QVERIFY(toggle(color,"checkedChangedByUser",true));
        QCOMPARE(e.effects(),QJsonArray({QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true}}}));
        QCOMPARE(e.model.undoStack()->count(),1);
        auto* brightness = e.item("adjustBrightness"); QVERIFY(brightness);
        QVERIFY(QMetaObject::invokeMethod(brightness,"gestureStarted"));
        QVERIFY(number(brightness,"preview",0.1)); QVERIFY(number(brightness,"preview",0.25));
        QCOMPARE(e.model.undoStack()->count(),1);
        QCOMPARE(e.effects()[0].toObject()["brightness"].toDouble(),0.25);
        QVERIFY(number(brightness,"change",0.25)); QCOMPARE(e.model.undoStack()->count(),2);
        const auto edited = e.model.documentJson();
        e.model.undoStack()->undo(); QVERIFY(!e.effects()[0].toObject().contains("brightness"));
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),original);
        e.model.undoStack()->redo(); e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),edited);
        auto* reset = resetAction(e.item("clipAdjustments")); QVERIFY(reset);
        e.click(reset); QCOMPARE(e.effects().size(),0);
        QCOMPARE(e.model.undoStack()->count(),3);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),edited);
        e.model.undoStack()->redo(); QCOMPARE(e.effects().size(),0);
        QCOMPARE(e.clip()["custom"].toString(),QString("keep"));
    }

void TestClipEffects::catalogue_data() {
        QTest::addColumn<QByteArray>("expected");
        // Literal defaults from ClipEffectsList.tsx makeEffect(), without its UUID.
        const QList<QByteArray> rows{
            R"({"type":"blur","enabled":true,"radius":8})",
            R"({"type":"glow","enabled":true,"radius":8,"intensity":1})",
            R"({"type":"dropShadow","enabled":true,"offsetX":8,"offsetY":8,"blur":12,"color":"#000000","opacity":0.6})",
            R"({"type":"vignette","enabled":true,"amount":0.4,"softness":0.5})",
            R"({"type":"sharpen","enabled":true,"amount":0.5,"radius":1})",
            R"({"type":"chromaKey","enabled":true,"color":"#00ff00","tolerance":0.2,"softness":0.1,"spill":0.5})",
            R"({"type":"curves","enabled":true,"master":[{"x":0,"y":0},{"x":1,"y":1}]})",
            R"({"type":"levels","enabled":true,"inBlack":0,"inWhite":1,"gamma":1,"outBlack":0,"outWhite":1})",
            R"({"type":"liftGammaGain","enabled":true,"lift":[0,0,0],"gamma":[1,1,1],"gain":[1,1,1]})",
            R"({"type":"grain","enabled":true,"amount":0.25,"size":1,"colorAmount":0,"roughness":0.5,"softness":0.25,"animate":true})"};
        for (const auto& row : rows) { QTest::newRow(qPrintable(QJsonDocument::fromJson(row).object()["type"].toString())) << row; }
    }

void TestClipEffects::catalogue() {
        QFETCH(QByteArray,expected);
        const auto wanted = QJsonDocument::fromJson(expected).object();
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
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
        e.patch({{"effects",QJsonArray{
            QJsonObject{{"id","a"},{"type","blur"},{"enabled",true},{"radius",8},{"sigma",2}},
            QJsonObject{{"id","inspector:color"},{"type","color"},{"enabled",true},{"contrast",1.3}},
            QJsonObject{{"id","future"},{"type","futureEffect"},{"enabled",true},{"opaque",QJsonObject{{"x",7}}}},
            QJsonObject{{"id","b"},{"type","vignette"},{"enabled",false},{"amount",0.4},{"softness",0.5}}}}});
        auto* section = e.item("clipEffectsList"); QVERIFY(section);
        QVERIFY(QMetaObject::invokeMethod(section, "toggled", Q_ARG(bool, true)));
        QVERIFY(!e.item("effectRow_inspector:color"));
        const auto before = e.model.documentJson();
        auto* reorder = e.item("effectsReorder_a"); QVERIFY(reorder); reorder->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Down,Qt::AltModifier);
        QCOMPARE(e.effects()[0].toObject()["id"].toString(),QString("future"));
        QCOMPARE(e.effects()[1].toObject()["id"].toString(),QString("inspector:color"));
        QCOMPARE(e.effects()[2].toObject()["id"].toString(),QString("a"));
        QCOMPARE(e.model.undoStack()->count(),1);
        const auto moved = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),moved);
        auto* enabled = e.item("effectsEnabled_b"); QVERIFY(enabled); e.click(enabled);
        QCOMPARE(e.effects()[3].toObject()["enabled"].toBool(),true); QCOMPARE(e.model.undoStack()->count(),2);
        auto* expand = e.item("effectsExpand_a"); QVERIFY(expand); e.click(expand);
        auto* radius = e.item("effects_a_radius"); QVERIFY(radius);
        QVERIFY(QMetaObject::invokeMethod(radius,"gestureStarted"));
        QVERIFY(number(radius,"preview",10)); QVERIFY(number(radius,"preview",12.5));
        QCOMPARE(e.model.undoStack()->count(),2);
        QVERIFY(number(radius,"change",12.5)); QCOMPARE(e.model.undoStack()->count(),3);
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
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add(type));
        const auto id = e.effects()[0].toObject()["id"].toString();
        auto* control = e.item("effects_"+id+"_"+field); QVERIFY(control);
        const auto before = e.model.documentJson();
        QVERIFY(text(control,"commit",input)); QCOMPARE(e.model.undoStack()->count(),2);
        const auto wanted = QJsonDocument::fromJson(expected).object();
        for (auto it = wanted.begin(); it != wanted.end(); ++it) { QCOMPARE(e.effects()[0].toObject()[it.key()],it.value()); }
        const auto after = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
    }

void TestClipEffects::invalidNumbersAndGestureCancellation() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add("levels"));
        const auto id = e.effects()[0].toObject()["id"].toString();
        auto* gamma = e.item("effects_"+id+"_gamma"); QVERIFY(gamma);
        const auto before = e.model.documentJson();
        for (const auto& raw : {QString(""),QString("NaN"),QString("Infinity"),QString("0"),QString("-1"),QString("1x")}) {
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

void TestClipEffects::curvePointEditing() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add("curves"));
        auto* graph = e.item("toneCurveGraph"); QVERIFY(graph); e.reveal(graph);
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
        auto* point = e.item("toneCurvePoint_1"); QVERIFY(point); point->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Left,Qt::ShiftModifier); QCOMPARE(e.model.undoStack()->count(),4);
        QVERIFY(qAbs(e.effects()[0].toObject()["master"].toArray()[1].toObject()["x"].toDouble()-0.6)<0.01);
        QTest::keyClick(&e.window,Qt::Key_Delete); QCOMPARE(e.model.undoStack()->count(),5);
        QCOMPARE(e.effects()[0].toObject()["master"].toArray().size(),2);
        e.model.undoStack()->undo(); QCOMPARE(e.effects()[0].toObject()["master"].toArray().size(),3);
        auto* reset = e.item("toneCurveReset"); QVERIFY(reset); e.click(reset);
        QCOMPARE(e.effects()[0].toObject()["master"],QJsonValue(QJsonArray{QJsonObject{{"x",0},{"y",0}},QJsonObject{{"x",1},{"y",1}}}));
        e.model.undoStack()->undo(); QVERIFY(e.effects()[0].toObject()["master"].toArray().size()==3);
        // RGB reset removes the optional channel, rather than writing null or identity.
        auto* red = e.item("toneCurveChannel_r"); QVERIFY(red); e.click(red); e.reveal(graph);
        QTest::mouseClick(&e.window,Qt::LeftButton,Qt::NoModifier,pointAt(0.5,0.4));
        QVERIFY(e.effects()[0].toObject().contains("r")); e.click(reset);
        QVERIFY(!e.effects()[0].toObject().contains("r"));
        e.model.undoStack()->undo(); QVERIFY(e.effects()[0].toObject().contains("r"));
        while (e.model.undoStack()->index()>1) { e.model.undoStack()->undo(); }
        QCOMPARE(e.model.documentJson(),before);
    }

void TestClipEffects::cancellationLocksAndPlayhead() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        auto* color = e.item("clipAdjustments"); QVERIFY(color); color->setProperty("open",true);
        QVERIFY(toggle(color,"checkedChangedByUser",true)); e.model.undoStack()->clear();
        const auto before = e.model.documentJson();
        auto* brightness = e.item("adjustBrightness"); QVERIFY(brightness);
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
        auto* panel = e.item("clipGroupPanel"); QVERIFY(panel); QVERIFY(panel->isVisible());
        auto* color = find(panel,"clipAdjustments"); QVERIFY2(color,"Group clips need the same Color section as web ClipGroupPanel");
        QVERIFY(color->isVisible()); QVERIFY(toggle(color,"checkedChangedByUser",true));
        QCOMPARE(e.effects()[0].toObject()["enabled"].toBool(),true); QCOMPARE(e.model.undoStack()->count(),1);
        auto* effects = find(panel,"clipEffectsList");
        QVERIFY2(effects,"Group clips need the same Effects section as web ClipGroupPanel");
        QVERIFY(effects->isVisible());
    }

void TestClipEffects::exportDocuments() {
        if (qEnvironmentVariableIsEmpty("NT_D6_OUTPUT")) { QSKIP("Set NT_D6_OUTPUT for the GPU golden runner"); }
        Editor e; QVERIFY2(e.object,qPrintable(e.error));
        e.patch({{"mediaPath",QString(NT_TIMELINE_DIR)+"/src/preview/effects/fixtures/visual-source.png"}});
        const QDir directory(qEnvironmentVariable("NT_D6_OUTPUT")); QVERIFY(QDir().mkpath(directory.path()));
        const auto save = [&](const QString& name) {
            QFile file(directory.filePath(name+".json"));
            if (!file.open(QIODevice::WriteOnly)) { return false; }
            if (name == "curves" || name == "effects") { e.reveal(e.item("clipEffectsList")); }
            QQuickTest::qWaitForPolish(&e.window);
            if (!e.window.grabWindow().save(directory.filePath(name+"-ui.png"))) { return false; }
            return file.write(e.model.documentJson())>0;
        };
        QVERIFY(save("base"));
        auto* color = e.item("clipAdjustments"); QVERIFY(color); color->setProperty("open",true);
        QVERIFY(toggle(color,"checkedChangedByUser",true));
        QVERIFY(number(e.item("adjustBrightness"),"change",0.15));
        QVERIFY(number(e.item("adjustContrast"),"change",1.2)); QVERIFY(save("color"));
        QVERIFY(e.add("curves")); auto* graph = e.item("toneCurveGraph"); QVERIFY(graph); e.reveal(graph);
        QTest::mouseClick(&e.window,Qt::LeftButton,Qt::NoModifier,graph->mapToScene({graph->width()*0.5,graph->height()*0.3}).toPoint());
        QCOMPARE(e.effects()[1].toObject()["master"].toArray().size(),3); QVERIFY(save("curves"));
        QVERIFY(e.add("vignette")); const auto id = e.effects()[2].toObject()["id"].toString();
        QVERIFY(number(e.item("effects_"+id+"_amount"),"change",0.7)); QVERIFY(save("effects"));
        // Select the group through the normal Inspector. Its image remains a child.
        auto clips = e.model.clipsJson(); auto child = clips[0].toObject();
        auto group = child; group.insert("id","group"); group.insert("mediaType","group"); group.remove("mediaPath");
        child.insert("parentId","group"); child.remove("effects"); clips[0] = child; clips.append(group);
        e.model.replaceClips(clips); e.select("group");
        auto* panel = e.item("clipGroupPanel"); QVERIFY(panel);
        auto* groupColor = find(panel,"clipAdjustments"); QVERIFY(groupColor); groupColor->setProperty("open",true);
        QVERIFY(number(find(panel,"adjustSaturation"),"change",0.5)); QVERIFY(save("group"));
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
    auto* color = e.item("clipAdjustments"); QVERIFY(color);
    QVERIFY(QMetaObject::invokeMethod(color,"toggled",Q_ARG(bool,true)));
    QCOMPARE(color->property("open").toBool(),true);
    e.patch({{"mediaType","group"}});
    auto* groupColor = find(e.item("clipGroupPanel"),"clipAdjustments"); QVERIFY(groupColor);
    QCOMPARE(groupColor->property("open").toBool(),true);
    e.patch({{"mediaType","image"}});
    Editor restored; QVERIFY(restored.object); QCOMPARE(restored.item("clipAdjustments")->property("open").toBool(),true);
    auto* effects = restored.item("clipEffectsList"); QVERIFY(effects); effects->setProperty("open",true);
    auto* add = restored.item("effectsAdd"); QVERIFY(add); restored.click(add);
    QQuickTest::qWaitForPolish(&restored.window);
    auto* search = restored.item("effectsSearch"); QVERIFY(search); search->forceActiveFocus();
    for (const char key : QByteArray("gRAin")) { QTest::keyClick(&restored.window,key); }
    QQuickTest::qWaitForPolish(&restored.window);
    QVERIFY(restored.item("effectsAdd_grain")); QVERIFY(!restored.item("effectsAdd_blur"));
    QCOMPARE(restored.model.undoStack()->count(),0);
    auto* grain = restored.item("effectsAdd_grain");
    QTest::mouseClick(&restored.window,Qt::LeftButton,Qt::NoModifier,grain->mapToScene({grain->width()/2,grain->height()/2}).toPoint());
    QCOMPARE(restored.effects().size(),1); QCOMPARE(restored.effects()[0].toObject()["type"].toString(),QString("grain"));
    QCOMPARE(restored.model.undoStack()->count(),1);
}

void TestClipEffects::colorRangesAndPointerGesture() {
    Editor e; QVERIFY2(e.object,qPrintable(e.error));
    auto* color = e.item("clipAdjustments"); QVERIFY(color); color->setProperty("open",true);
    QVERIFY(toggle(color,"checkedChangedByUser",true));
    struct Range { QString name; double min; double max; double step; double origin; };
    const QList<Range> ranges{{"Brightness",-1,1,0.01,0},{"Contrast",0,4,0.01,1},
        {"Saturation",0,4,0.01,1},{"Hue",-180,180,1,0},{"Temperature",-1,1,0.01,0},
        {"Tint",-1,1,0.01,0},{"Shadows",-1,1,0.01,0},{"Highlights",-1,1,0.01,0}};
    for (const auto& range : ranges) {
        auto* field = e.item("adjust"+range.name); QVERIFY(field);
        QCOMPARE(field->property("min").toDouble(),range.min); QCOMPARE(field->property("max").toDouble(),range.max);
        QCOMPARE(field->property("step").toDouble(),range.step); QCOMPARE(field->property("origin").toDouble(),range.origin);
        QCOMPARE(field->property("value").toDouble(),range.origin);
    }
    const auto before = e.model.documentJson();
    auto* slider = sliderControl(e.item("adjustBrightness")); QVERIFY(slider); e.reveal(slider);
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
        QJsonObject{{"id","a"},{"type","blur"},{"enabled",true},{"radius",8}},owned,
        QJsonObject{{"id","b"},{"type","vignette"},{"enabled",true},{"amount",0.4},{"softness",0.5}},
        QJsonObject{{"id","c"},{"type","grain"},{"enabled",true},{"amount",0.25}}}}});
    auto* section = e.item("clipEffectsList"); QVERIFY(section); section->setProperty("open",true);
    auto* handle = e.item("effectsReorder_a"); QVERIFY(handle); e.reveal(handle);
    auto* target = e.item("effectsExpand_c"); QVERIFY(target);
    const auto start = handle->mapToScene({handle->width()/2,handle->height()/2}).toPoint();
    const auto end = target->mapToScene({target->width()/2,target->height()/2}).toPoint();
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
    Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(e.add("curves"));
    const auto curvesId = e.effects()[0].toObject()["id"].toString();
    auto* curveRow = e.item("effectRow_"+curvesId); QVERIFY(curveRow);
    QQuickTest::qWaitForPolish(&e.window); QVERIFY(curveRow->height()>300);
    QVERIFY(e.add("vignette")); QQuickTest::qWaitForPolish(&e.window);
    QVERIFY2(curveRow->height()<80,"Collapsed Curves row retains the tone graph's height");
    const auto vignetteId = e.effects()[1].toObject()["id"].toString();
    auto* vignetteRow = e.item("effectRow_"+vignetteId); QVERIFY(vignetteRow);
    QVERIFY(vignetteRow->y()-curveRow->y()<80);
}
#include "tst_clipeffects.moc"
