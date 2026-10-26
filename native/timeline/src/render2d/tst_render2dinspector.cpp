#include "edit/ClipGestureController.h"
#include "edit/inspectorsections/InspectorSectionRegistry.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include <QFile>
#include <QGuiApplication>
#include <QJsonDocument>
#include <QJSValue>
#include <QQmlComponent>
#include <QQmlEngine>
#include <QQuickItem>
#include <QQuickWindow>
#include <QtTest>
#include <memory>

namespace {
QQuickItem* findItem(QQuickItem* root, const QString& name) {
    if (!root) { return nullptr; }
    if (root->objectName() == name) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = findItem(child, name)) { return found; }
    }
    return nullptr;
}
QQuickItem* section(QQuickItem* root, const QString& title) {
    if (!root) { return nullptr; }
    if (root->property("title").toString() == title) { return root; }
    for (auto* child : root->childItems()) {
        if (auto* found = section(child, title)) { return found; }
    }
    return nullptr;
}
QVariantList listProperty(QObject* object, const char* name) {
    const auto value = object->property(name);
    return value.metaType() == QMetaType::fromType<QJSValue>() ? value.value<QJSValue>().toVariant().toList() : value.toList();
}
bool send(QObject* item, const char* signal, const QVariant& value) {
    if (!item) { return false; }
    if (value.metaType() == QMetaType::fromType<bool>()) { return QMetaObject::invokeMethod(item, signal, Q_ARG(bool, value.toBool())); }
    if (value.metaType() == QMetaType::fromType<double>()) { return QMetaObject::invokeMethod(item, signal, Q_ARG(double, value.toDouble())); }
    return QMetaObject::invokeMethod(item, signal, Q_ARG(QString, value.toString()));
}
struct Editor {
    TimelineModel model;
    PlaybackClock clock;
    QQmlEngine engine;
    QQuickWindow window;
    std::unique_ptr<QObject> object;
    QString error;
    Editor() {
        auto parsed = nt::parseTimelineJson(R"({"name":"Text inspector","width":640,"height":360,"fps":30,"durationMs":7000,"tracks":[{"id":"v","type":"video","name":"Video"}],"clips":[
          {"id":"text","trackId":"v","mediaType":"text","startMs":0,"durationMs":2000,"textStyle":{"text":"Hello","fontSizePx":40,"color":"#ffffff","custom":"keep","stroke":{"color":"#000000","widthPx":2},"shadow":{"color":"#000000","blurPx":8,"offsetX":0,"offsetY":4},"background":{"color":"#000000","paddingPx":16,"radiusPx":8}}},
          {"id":"shape","trackId":"v","mediaType":"shape","startMs":2000,"durationMs":2000,"shapeStyle":{"kind":"rect","custom":"keep"}},
          {"id":"caption","trackId":"v","mediaType":"video","startMs":4000,"durationMs":2000,"caption":{"words":[{"text":"Word","startMs":0,"endMs":1000}],"custom":"keep","style":{"outline":{"color":"#000000","widthPx":2},"background":{"color":"#000000","paddingPx":8,"radiusPx":4},"custom":"keep"}}},
          {"id":"plain","trackId":"v","mediaType":"image","startMs":6000,"durationMs":1000}
        ]})");
        if (!parsed.timeline) { error = "Invalid test fixture"; return; }
        model.setTimeline(std::move(*parsed.timeline));
        QQmlComponent component(&engine, QUrl("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml"));
        object.reset(component.createWithInitialProperties({{"timeline", QVariant::fromValue(&model)},
            {"clock", QVariant::fromValue(&clock)}, {"width", 1280}, {"height", 800}}));
        error = component.errorString();
        window.resize(1280, 800);
        if (auto* root = qobject_cast<QQuickItem*>(object.get())) { root->setParentItem(window.contentItem()); }
        window.show(); // QT_QPA_PLATFORM=offscreen, never the desktop display.
    }
    QQuickItem* inspector() const { return findItem(qobject_cast<QQuickItem*>(object.get()), "timelineInspector"); }
    ClipGestureController* gestures() const { return object->findChild<ClipGestureController*>("clipGestures"); }
    QJsonObject clip(const QString& id) const {
        for (const auto& c : model.clipsJson()) { if (c.toObject()["id"] == id) { return c.toObject(); } }
        return {};
    }
    void patch(const QString& id, const QJsonObject& patch) {
        model.applyEdit("patchClip", {{"clipId", id}, {"patch", patch}});
        model.undoStack()->clear();
        QCoreApplication::processEvents();
    }
};
struct Control {
    QString clip;
    QString name;
    const char* signal;
    QVariant input;
    QString path;
    QJsonValue expected;
    QString kind{};
    QJsonObject fill{};
};
const QJsonArray stops{QJsonObject{{"offset", 0}, {"color", "#000000"}}, QJsonObject{{"offset", 1}, {"color", "#ffffff"}}};
const QJsonObject linear{{"type", "linear"}, {"angle", 0}, {"stops", stops}};
// Expected edits come from the web handlers, including undefined as an absent key.
QList<Control> controls() {
    QList<Control> out{
        {"text","textFont","change","Lora","textStyle.fontFamily","Lora"},
        {"text","textSize","commit","64","textStyle.fontSizePx",64},
        {"text","textWeight","change","700","textStyle.fontWeight",700},
        {"text","textStyle","change","italic","textStyle.fontStyle","italic"},
        {"text","textColor","commit","#123456","textStyle.color","#123456"},
        {"text","textAlign","change","left","textStyle.align","left"},
        {"text","textVerticalAlign","change","top","textStyle.verticalAlign","top"},
        {"text","textLetterSpacing","commit","-2.5","textStyle.letterSpacingPx",-2.5},
        {"text","textLineHeight","commit","1.5","textStyle.lineHeight",1.5},
        {"text","textStrikethrough","change",true,"textStyle.strikethrough",true},
        {"text","textStroke","change",false,"textStyle.stroke",QJsonValue::Undefined},
        {"text","textStrokeColor","commit","#112233","textStyle.stroke.color","#112233"},
        {"text","textStrokeWidth","commit","3","textStyle.stroke.widthPx",3},
        {"text","textShadow","change",false,"textStyle.shadow",QJsonValue::Undefined},
        {"text","textShadowColor","commit","#223344","textStyle.shadow.color","#223344"},
        {"text","textShadowBlur","commit","12","textStyle.shadow.blurPx",12},
        {"text","textShadowX","commit","-6","textStyle.shadow.offsetX",-6},
        {"text","textShadowY","commit","9","textStyle.shadow.offsetY",9},
        {"text","textBackground","change",false,"textStyle.background",QJsonValue::Undefined},
        {"text","textBackgroundColor","commit","#334455","textStyle.background.color","#334455"},
        {"text","textBackgroundPadding","commit","22","textStyle.background.paddingPx",22},
        {"text","textBackgroundRadius","commit","10","textStyle.background.radiusPx",10},
        {"shape","shapeKind","change","ellipse","shapeStyle.kind","ellipse"},
        {"shape","shapeX","commit","-0.3","shapeStyle.x",-0.3},
        {"shape","shapeY","commit","1.2","shapeStyle.y",1.2},
        {"shape","shapeWidth","commit","0.6","shapeStyle.width",0.6},
        {"shape","shapeHeight","commit","0.4","shapeStyle.height",0.4},
        {"shape","shapeCornerRadius","commit","0.02","shapeStyle.cornerRadius",0.02},
        {"shape","shapeLineX","commit","-0.1","shapeStyle.x",-0.1,"line"},
        {"shape","shapeLineY","commit","0.2","shapeStyle.y",0.2,"line"},
        {"shape","shapeX2","commit","0.8","shapeStyle.x2",0.8,"line"},
        {"shape","shapeY2","commit","0.9","shapeStyle.y2",0.9,"line"},
        {"shape","shapePath","commit","  M 0 0 L 1 1 Z  ","shapeStyle.d","M 0 0 L 1 1 Z","path"},
        {"shape","shapeSides","commit","6.6","shapeStyle.sides",7,"polygon"},
        {"shape","shapeSides","commit","8","shapeStyle.sides",8,"star"},
        {"shape","shapeInnerRadius","change",0.3,"shapeStyle.innerRadius",0.3,"star"},
        {"shape","shapeFillColor","commit","#445566","shapeStyle.fill","#445566"},
        {"shape","shapeStrokeColor","commit","#556677","shapeStyle.stroke","#556677"},
        {"shape","shapeStrokeWidth","commit","4","shapeStyle.strokeWidthPx",4},
        {"shape","shapeDash","commit","0.02, 0.01 0.03","shapeStyle.dash",QJsonArray{0.02,0.01,0.03}},
        {"shape","shapeCap","change","round","shapeStyle.lineCap","round"},
        {"shape","shapeJoin","change","bevel","shapeStyle.lineJoin","bevel"},
        {"shape","shapeTrimStart","change",0.2,"shapeStyle.trimStart",0.2},
        {"shape","shapeTrimEnd","change",0.8,"shapeStyle.trimEnd",0.8},
        {"caption","captionFont","change","Bebas Neue","caption.style.fontFamily","Bebas Neue"},
        {"caption","captionSize","commit","6.5","caption.style.fontSizeFrac",0.065},
        {"caption","captionColor","commit","#667788","caption.style.color","#667788"},
        {"caption","captionSpoken","commit","#778899","caption.style.activeColor","#778899"},
        {"caption","captionBottom","commit","15","caption.style.bottomMarginFrac",0.15},
        {"caption","captionOutline","commit","5","caption.style.outline.widthPx",5},
        {"caption","captionOutlineColor","commit","#8899aa","caption.style.outline.color","#8899aa"},
        {"caption","captionScrim","commit","12","caption.style.background.paddingPx",12},
        {"caption","captionScrimColor","commit","#99aabb","caption.style.background.color","#99aabb"},
        {"caption","captionScrimRadius","commit","6","caption.style.background.radiusPx",6},
        {"caption","captionOutline","commit","","caption.style.outline",QJsonValue::Undefined},
        {"caption","captionScrim","commit","","caption.style.background",QJsonValue::Undefined}
    };
    for (const auto& clip : {QString("text"), QString("shape")}) {
        const auto path = clip == "text" ? "textStyle.fill" : "shapeStyle.fillStyle";
        out.append({clip,clip+"FillType","change","solid",QString(path)+".color","#ffffff"});
        out.append({clip,clip+"FillType","change","linear",path,linear});
        out.append({clip,clip+"FillType","change","radial",path,QJsonObject{{"type","radial"},{"stops",stops}}});
        out.append({clip,clip+"FillType","change","none",path,QJsonValue::Undefined,{},linear});
        out.append({clip,clip+"FillSolid","commit","#abcdef",QString(path)+".color","#abcdef",{},QJsonObject{{"type","solid"},{"color","#ffffff"}}});
        out.append({clip,clip+"FillAngle","commit","45",QString(path)+".angle",45,{},linear});
        out.append({clip,clip+"FillStops","commit","2:red, -1:blue",QString(path)+".stops",QJsonArray{QJsonObject{{"offset",0},{"color","blue"}},QJsonObject{{"offset",1},{"color","red"}}},{},linear});
    }
    return out;
}
QJsonValue at(QJsonObject clip, const QString& path) {
    QJsonValue value(clip);
    for (const auto& key : path.split('.')) { value = value.toObject().value(key); }
    return value;
}
}
Q_DECLARE_METATYPE(Control)

class TestRender2dInspector : public QObject {
    Q_OBJECT
private slots:
    void init() { QTest::failOnWarning(QRegularExpression(".*(Binding loop|ReferenceError|TypeError|Cannot assign).*")); }
    void sectionsAndFonts() {
        Editor e; QVERIFY2(e.object, qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        auto* text = findItem(e.inspector(), "inspectorText"); QVERIFY2(text,"Missing TextStyleSection");
        auto* shape = findItem(e.inspector(), "inspectorShape"); QVERIFY2(shape,"Missing ShapeSection");
        auto* caption = findItem(e.inspector(), "inspectorCaption"); QVERIFY2(caption,"Missing CaptionStyle");
        for (const auto& id : {QString("text"),QString("shape"),QString("caption"),QString("plain"),QString()}) {
            e.gestures()->setSelection(id.isEmpty() ? QStringList{} : QStringList{id}); QCoreApplication::processEvents();
            QCOMPARE(text->isVisible(),id == "text"); QCOMPARE(shape->isVisible(),id == "shape"); QCOMPARE(caption->isVisible(),id == "caption");
            if (id == "text" || id == "shape") {
                auto* s = id == "text" ? text : shape;
                QVERIFY(s->mapToItem(e.inspector(),QPointF{}).y() < section(e.inspector(),"Media")->mapToItem(e.inspector(),QPointF{}).y());
            }
        }
        e.gestures()->setSelection({"caption"}); QCoreApplication::processEvents();
        QVERIFY(section(e.inspector(),"Timing")->mapToItem(e.inspector(),QPointF{}).y() < caption->mapToItem(e.inspector(),QPointF{}).y());
        QVERIFY(caption->mapToItem(e.inspector(),QPointF{}).y() < section(e.inspector(),"Render")->mapToItem(e.inspector(),QPointF{}).y());
        e.gestures()->setSelection({"text"}); QCoreApplication::processEvents(); text->setProperty("open",true);
        auto* font = findItem(text,"textFont"); QVERIFY(font);
        const auto options = listProperty(font,"options");
        const QStringList families{"Inter","Space Grotesk","Bebas Neue","Playfair Display","Lora","JetBrains Mono"};
        QCOMPARE(options[0].toMap()["label"].toString(),QString("Default (Inter)"));
        for (qsizetype i = 0; i < families.size(); ++i) {
            QCOMPARE(options[i+1].toMap()["value"].toString(),families[i]);
            QCOMPARE(options[i+1].toMap()["label"].toString(),families[i]+" · portable");
        }
        auto style = e.clip("text")["textStyle"].toObject(); style.insert("fontFamily","Missing Font XYZ");
        e.patch("text",{{"textStyle",style}});
        QCOMPARE(listProperty(font,"options").last().toMap()["label"].toString(),QString("Missing Font XYZ · not installed"));
        QVERIFY(send(font,"change","")); QVERIFY(!e.clip("text")["textStyle"].toObject().contains("fontFamily"));
        QCOMPARE(e.model.undoStack()->count(),1);
    }
    void eachControl_data() {
        QTest::addColumn<Control>("control");
        int i = 0;
        for (const auto& control : controls()) { QTest::newRow(qPrintable(QString::number(i++)+"-"+control.name)) << control; }
    }
    void eachControl() {
        QFETCH(Control,control);
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        if (!control.kind.isEmpty() || !control.fill.isEmpty()) {
            const auto field = control.clip == "text" ? "textStyle" : "shapeStyle";
            auto style = e.clip(control.clip)[field].toObject();
            if (!control.kind.isEmpty()) { style.insert("kind",control.kind); }
            if (!control.fill.isEmpty()) { style.insert(control.clip == "text" ? "fill" : "fillStyle",control.fill); }
            e.patch(control.clip,{{field,style}});
        }
        e.gestures()->setSelection({control.clip}); QCoreApplication::processEvents();
        auto* s = findItem(e.inspector(),"inspector"+QString(control.clip[0]).toUpper()+control.clip.mid(1)); QVERIFY(s); s->setProperty("open",true);
        auto* field = findItem(s,control.name); QVERIFY2(field,qPrintable(control.name)); QVERIFY(field->isVisible());
        const auto before = e.model.documentJson(); const auto words = e.clip("caption").value("caption").toObject().value("words");
        QVERIFY(send(field,control.signal,control.input));
        QCOMPARE(at(e.clip(control.clip),control.path),control.expected);
        QCOMPARE(e.model.undoStack()->count(),1); QCOMPARE(e.model.undoStack()->index(),1);
        QCOMPARE(e.clip("caption")["caption"].toObject()["words"],words);
        const auto stylePath = control.clip == "caption" ? "caption.style.custom" : control.clip+"Style.custom";
        QCOMPARE(at(e.clip(control.clip),stylePath).toString(),QString("keep"));
        const auto after = e.model.documentJson(); e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.model.undoStack()->redo(); QCOMPARE(e.model.documentJson(),after);
    }
    void defaultsAndVisibility() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"text"}); QCoreApplication::processEvents();
        auto* s = findItem(e.inspector(),"inspectorText"); QVERIFY(s); QVERIFY(!s->property("open").toBool()); s->setProperty("open",true);
        QCOMPARE(findItem(s,"textWeight")->property("value").toString(),QString("400"));
        QCOMPARE(findItem(s,"textStyle")->property("value").toString(),QString("normal"));
        QCOMPARE(findItem(s,"textAlign")->property("value").toString(),QString("center"));
        QCOMPARE(findItem(s,"textVerticalAlign")->property("value").toString(),QString("middle"));
        QCOMPARE(findItem(s,"textLineHeight")->property("value").toString(),QString("1.20"));
        for (const auto& field : {QString("stroke"),QString("shadow"),QString("background")}) {
            auto style = e.clip("text")["textStyle"].toObject(); const auto defaults = style.value(field); style.remove(field);
            e.patch("text",{{"textStyle",style}});
            const auto cap = QString(field[0]).toUpper()+field.mid(1);
            QVERIFY(!findItem(s,"text"+cap+"Color")->isVisible());
            QVERIFY(send(findItem(s,"text"+cap),"change",true));
            QCOMPARE(e.clip("text")["textStyle"].toObject()[field],defaults); QCOMPARE(e.model.undoStack()->count(),1);
        }
        auto style = e.clip("text")["textStyle"].toObject(); style.insert("fontWeight",450); e.patch("text",{{"textStyle",style}});
        QCOMPARE(listProperty(findItem(s,"textWeight"),"options").last().toMap()["label"].toString(),QString("Custom (450)"));
        e.patch("caption",{{"caption",QJsonObject{{"words",QJsonArray{}}}}});
        e.gestures()->setSelection({"caption"}); QCoreApplication::processEvents();
        auto* caption = findItem(e.inspector(),"inspectorCaption"); QVERIFY(caption); caption->setProperty("open",true);
        QCOMPARE(findItem(caption,"captionSize")->property("value").toString(),QString());
        QCOMPARE(findItem(caption,"captionSize")->property("placeholder").toString(),QString("5"));
        QCOMPARE(findItem(caption,"captionBottom")->property("placeholder").toString(),QString("12"));
        QCOMPARE(findItem(caption,"captionColor")->property("value").toString(),QString("#FFFFFF"));
        QCOMPARE(findItem(caption,"captionSpoken")->property("value").toString(),QString("#FFD60A"));
        QVERIFY(!findItem(caption,"captionOutlineColor")->isVisible()); QVERIFY(!findItem(caption,"captionScrimColor")->isVisible());
        QVERIFY(send(findItem(caption,"captionOutline"),"commit","0"));
        QCOMPARE(at(e.clip("caption"),"caption.style.outline"),QJsonValue(QJsonObject{{"color","#000000"},{"widthPx",0}}));
        e.model.undoStack()->clear();
        QVERIFY(send(findItem(caption,"captionScrim"),"commit","0"));
        QCOMPARE(at(e.clip("caption"),"caption.style.background"),QJsonValue(QJsonObject{{"color","#000000"},{"paddingPx",0}}));
        QCOMPARE(e.model.undoStack()->count(),1);
        for (const auto& kind : {QString("rect"),QString("ellipse"),QString("line"),QString("path"),QString("polygon"),QString("star")}) {
            e.patch("shape",{{"shapeStyle",QJsonObject{{"kind",kind}}}}); e.gestures()->setSelection({"shape"}); QCoreApplication::processEvents();
            auto* shape = findItem(e.inspector(),"inspectorShape"); QVERIFY(shape); shape->setProperty("open",true);
            QCOMPARE(findItem(shape,"shapeX")->isVisible(),kind != "line" && kind != "path");
            QCOMPARE(findItem(shape,"shapeLineX")->isVisible(),kind == "line");
            QCOMPARE(findItem(shape,"shapePath")->isVisible(),kind == "path");
            QCOMPARE(findItem(shape,"shapeSides")->isVisible(),kind == "polygon" || kind == "star");
            QCOMPARE(findItem(shape,"shapeInnerRadius")->isVisible(),kind == "star");
            QCOMPARE(findItem(shape,"shapeCornerRadius")->isVisible(),kind == "rect");
        }
        for (const auto& kind : {QString("image"),QString("audio"),QString("overlay"),QString("midi"),QString("group"),QString("adjustment")}) {
            e.patch("plain",{{"mediaType",kind},{"textStyle",e.clip("text")["textStyle"]},{"shapeStyle",e.clip("shape")["shapeStyle"]},{"caption",e.clip("caption")["caption"]}});
            e.gestures()->setSelection({"plain"}); QCoreApplication::processEvents();
            QVERIFY(!findItem(e.inspector(),"inspectorText")->isVisible()); QVERIFY(!findItem(e.inspector(),"inspectorShape")->isVisible());
            QCOMPARE(caption->isVisible(),kind != "group" && kind != "adjustment");
        }
        e.patch("plain",{{"mediaType","video"},{"sourceType","generated"}}); QCoreApplication::processEvents(); QVERIFY(!caption->isVisible());
        e.gestures()->setSelection({"text","shape"}); QCoreApplication::processEvents();
        QVERIFY(!s->isVisible()); QVERIFY(!caption->isVisible());
    }
    void gesturesAndTyping() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        for (const auto& c : controls()) {
            if (qstrcmp(c.signal,"commit") != 0 && c.input.metaType() != QMetaType::fromType<double>()) { continue; }
            e.gestures()->setSelection({c.clip}); QCoreApplication::processEvents();
            auto* s = findItem(e.inspector(),"inspector"+QString(c.clip[0]).toUpper()+c.clip.mid(1)); QVERIFY(s); s->setProperty("open",true);
            auto* field = findItem(s,c.name); if (!field || !field->isVisible()) { continue; }
            const bool slider = c.input.metaType() == QMetaType::fromType<double>();
            const auto scrub = field->property("scrub");
            if (!slider && (!scrub.isValid() || scrub.isNull() || (scrub.metaType() == QMetaType::fromType<QJSValue>() && scrub.value<QJSValue>().isNull()))) { continue; }
            const auto before = e.model.documentJson(); e.model.undoStack()->clear();
            QVERIFY(QMetaObject::invokeMethod(field,"gestureStarted"));
            QVERIFY(send(field,"preview",slider ? QVariant(0.25) : QVariant("2.5")));
            QVERIFY(send(field,"preview",slider ? QVariant(0.35) : QVariant("3.5")));
            QCOMPARE(e.model.undoStack()->count(),0); QVERIFY(e.model.documentJson() != before);
            QVERIFY(send(field,slider ? "change" : "commit",slider ? QVariant(0.35) : QVariant("3.5")));
            QCOMPARE(e.model.undoStack()->count(),1);
            e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before); e.model.undoStack()->clear();
        }
        e.gestures()->setSelection({"text"}); QCoreApplication::processEvents();
        auto* text = findItem(e.inspector(),"textContent"); QVERIFY(text);
        const auto before = e.model.documentJson(); text->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_A,Qt::ControlModifier); QTest::keyClick(&e.window,Qt::Key_X); QTest::keyClick(&e.window,Qt::Key_Y);
        QCOMPARE(e.model.undoStack()->count(),0); QCOMPARE(at(e.clip("text"),"textStyle.text").toString(),QString("xy"));
        e.inspector()->forceActiveFocus(); QCOMPARE(e.model.undoStack()->count(),1);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before); e.model.undoStack()->clear();
        auto* size = findItem(e.inspector(),"textSize"); QVERIFY(size);
        QVERIFY(QMetaObject::invokeMethod(size,"gestureStarted")); QVERIFY(send(size,"preview","70"));
        e.gestures()->setSelection({"shape"}); QCoreApplication::processEvents(); QCOMPARE(e.model.documentJson(),before);
        QVERIFY(send(size,"commit","70")); QCOMPARE(e.model.documentJson(),before); QCOMPARE(e.model.undoStack()->count(),0);
    }
    void selectionCommitsTyping() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.patch("plain",{{"mediaType","text"},{"textStyle",QJsonObject{{"text","Other"},{"fontSizePx",90},{"color","#123456"}}}});
        e.gestures()->setSelection({"text"}); QCoreApplication::processEvents();
        auto* s = findItem(e.inspector(),"inspectorText"); QVERIFY(s); s->setProperty("open",true);
        auto* text = findItem(s,"textContent"); QVERIFY(text);
        const auto before = e.model.documentJson(); const auto other = e.clip("plain");
        auto expected = e.clip("text")["textStyle"].toObject(); expected.insert("text","xy");
        text->forceActiveFocus(); QVERIFY(text->hasActiveFocus());
        QTest::keyClick(&e.window,Qt::Key_A,Qt::ControlModifier);
        QTest::keyClick(&e.window,Qt::Key_X); QTest::keyClick(&e.window,Qt::Key_Y);
        QCOMPARE(at(e.clip("text"),"textStyle.text").toString(),QString("xy"));
        QCOMPARE(e.model.undoStack()->count(),0); QVERIFY(text->hasActiveFocus());
        e.gestures()->setSelection({"plain"}); QCoreApplication::processEvents();
        QCOMPARE(at(e.clip("text"),"textStyle.text").toString(),QString("xy"));
        QCOMPARE(e.clip("text")["textStyle"].toObject(),expected);
        QCOMPARE(e.model.undoStack()->count(),1); QCOMPARE(e.model.undoStack()->index(),1);
        QCOMPARE(e.clip("plain"),other);
        e.model.undoStack()->undo(); QCOMPARE(e.model.documentJson(),before);
        e.inspector()->forceActiveFocus(); QCoreApplication::processEvents();
        QCOMPARE(e.model.undoStack()->count(),1); QCOMPARE(e.model.undoStack()->index(),0);
        QCOMPARE(e.model.documentJson(),before); QCOMPARE(e.clip("plain"),other);
    }
    void keyboardScrubAndSelect() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({"text"}); QCoreApplication::processEvents();
        auto* s = findItem(e.inspector(),"inspectorText"); QVERIFY(s); s->setProperty("open",true);
        auto* size = findItem(s,"textSize"); QVERIFY(size);
        QQuickItem* input = nullptr;
        for (auto* child : size->childItems()) { if (child->inherits("QQuickTextInput")) { input = child; break; } }
        QVERIFY(input); input->forceActiveFocus();
        QTest::keyPress(&e.window,Qt::Key_Up); QTest::keyPress(&e.window,Qt::Key_Up);
        QCOMPARE(e.model.undoStack()->count(),0); QCOMPARE(at(e.clip("text"),"textStyle.fontSizePx").toDouble(),42.0);
        QTest::keyRelease(&e.window,Qt::Key_Up); QCOMPARE(e.model.undoStack()->count(),1);
        e.model.undoStack()->undo(); e.model.undoStack()->clear();
        auto* font = findItem(s,"textFont"); QVERIFY(font); font->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Down);
        QCOMPARE(at(e.clip("text"),"textStyle.fontFamily").toString(),QString("Inter"));
        QCOMPARE(e.model.undoStack()->count(),1);
        e.model.undoStack()->undo(); e.model.undoStack()->clear();
        QCOMPARE(font->property("currentIndex").toInt(),0);
        e.gestures()->setSelection({"caption"}); QCoreApplication::processEvents();
        auto* caption = findItem(e.inspector(),"inspectorCaption"); QVERIFY(caption); caption->setProperty("open",true);
        auto* captionFont = findItem(caption,"captionFont"); QVERIFY(captionFont); captionFont->forceActiveFocus();
        QTest::keyClick(&e.window,Qt::Key_Down);
        QCOMPARE(at(e.clip("caption"),"caption.style.fontFamily").toString(),QString("Inter"));
        QCOMPARE(e.model.undoStack()->count(),1);
    }
    void computedSelectIndices_data() {
        QTest::addColumn<QString>("clipId");
        QTest::addColumn<QString>("control");
        QTest::addColumn<QString>("field");
        QTest::addColumn<int>("initialIndex");
        QTest::addColumn<QString>("customValue");
        QTest::newRow("weight") << QString("text") << QString("textWeight") << QString("fontWeight") << 3 << QString("450");
        QTest::newRow("text-font") << QString("text") << QString("textFont") << QString("fontFamily") << 0 << QString("Missing Font XYZ");
        QTest::newRow("caption-font") << QString("caption") << QString("captionFont") << QString("fontFamily") << 0 << QString("Missing Font XYZ");
    }
    void computedSelectIndices() {
        QFETCH(QString,clipId); QFETCH(QString,control); QFETCH(QString,field); QFETCH(int,initialIndex); QFETCH(QString,customValue);
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        e.gestures()->setSelection({clipId}); QCoreApplication::processEvents();
        auto* select = findItem(e.inspector(),control); QVERIFY(select);
        QCOMPARE(select->property("currentIndex").toInt(),initialIndex);
        const auto path = clipId == "caption" ? QString("caption.style") : QString("textStyle");
        auto style = at(e.clip(clipId),path).toObject();
        style.insert(field,field == "fontWeight" ? QJsonValue(customValue.toInt()) : QJsonValue(customValue));
        if (clipId == "caption") {
            auto caption = e.clip(clipId)["caption"].toObject(); caption.insert("style",style);
            e.patch(clipId,{{"caption",caption}});
        } else {
            e.patch(clipId,{{"textStyle",style}});
        }
        QTRY_COMPARE(select->property("currentIndex").toInt(),listProperty(select,"options").size()-1);
        QCOMPARE(select->property("currentValue").toString(),customValue);
        QCOMPARE(e.model.undoStack()->count(),0);
    }
    void rejectedAndClearedValues() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        const QList<QPair<QString,QString>> invalid{{"textSize","0"},{"textLineHeight","0"},{"textSize","NaN"},{"textStrokeWidth","-1"},{"textShadowBlur","-1"},{"textBackgroundPadding","-1"},{"textBackgroundRadius","-1"},{"shapeWidth","-1"},{"shapeHeight","-1"},{"shapeCornerRadius","-1"},{"shapeStrokeWidth","-1"},{"shapeDash","x,2"},{"captionSize","-1"},{"captionBottom","Infinity"},{"captionOutline","-1"},{"captionScrim","-1"},{"captionScrimRadius","-1"}};
        for (const auto& entry : invalid) {
            const auto id = entry.first.startsWith("caption") ? "caption" : entry.first.startsWith("shape") ? "shape" : "text";
            e.gestures()->setSelection({id}); QCoreApplication::processEvents();
            auto* s = section(e.inspector(),QString(id) == "caption" ? "Caption" : QString(id) == "shape" ? "Shape" : "Text"); QVERIFY(s); s->setProperty("open",true);
            auto* field = findItem(s,entry.first); QVERIFY(field);
            const auto before = e.model.documentJson(); QVERIFY(send(field,"commit",entry.second));
            QCOMPARE(e.model.documentJson(),before); QCOMPARE(e.model.undoStack()->count(),0);
        }
        e.gestures()->setSelection({"caption"}); QCoreApplication::processEvents();
        for (const auto& field : {QString("captionSize"),QString("captionBottom"),QString("captionFont")}) {
            const auto signal = field == "captionFont" ? "change" : "commit";
            QVERIFY(send(findItem(e.inspector(),field),signal,field == "captionFont" ? "Inter" : "6")); e.model.undoStack()->clear();
            QVERIFY(send(findItem(e.inspector(),field),signal,"")); QCOMPARE(e.model.undoStack()->count(),1);
            const auto key = field == "captionFont" ? "fontFamily" : field == "captionSize" ? "fontSizeFrac" : "bottomMarginFrac";
            QVERIFY(!at(e.clip("caption"),"caption.style").toObject().contains(key)); e.model.undoStack()->clear();
        }
    }
    void lockedControls() {
        Editor e; QVERIFY2(e.object,qPrintable(e.error)); QVERIFY(QTest::qWaitForWindowExposed(&e.window));
        for (const auto& control : controls()) {
            e.patch(control.clip,{{"locked",true}}); e.gestures()->setSelection({control.clip}); QCoreApplication::processEvents();
            auto* s = findItem(e.inspector(),"inspector"+QString(control.clip[0]).toUpper()+control.clip.mid(1)); QVERIFY(s); s->setProperty("open",true);
            auto* field = findItem(s,control.name); if (!field || !field->isVisible()) { continue; }
            QVERIFY2(field->property("disabled").toBool(),qPrintable(control.name));
            const auto before = e.model.documentJson(); QVERIFY(send(field,control.signal,control.input));
            QCOMPARE(e.model.documentJson(),before); QCOMPARE(e.model.undoStack()->count(),0);
        }
    }
};
int main(int argc, char** argv) {
    QGuiApplication app(argc,argv);
    TestRender2dInspector tests;
    return QTest::qExec(&tests,argc,argv);
}
#include "tst_render2dinspector.moc"
