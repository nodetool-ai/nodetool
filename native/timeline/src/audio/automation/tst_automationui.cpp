#include "audio/automation/Automation.h"
#include "model/TimelineModel.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include <QAccessible>
#include <QGuiApplication>
#include <QQmlEngine>
#include <QQmlComponent>
#include <QQuickWindow>
#include <QQuickItem>
#include <QPointer>
#include <QJsonDocument>
#include <QtTest>
#include <memory>

class TestAutomationUi : public QObject {
    Q_OBJECT
    TimelineModel model;
    PlaybackClock clock;
    std::unique_ptr<QQmlEngine> engine;
    std::unique_ptr<QObject> root;
    std::unique_ptr<QQuickWindow> window;
    QJsonObject doc() const { return QJsonDocument::fromJson(model.documentJson()).object(); }
    QJsonObject track() const { return doc()["tracks"].toArray()[0].toObject(); }
    QQuickItem* item(const QString& name) const {
        const auto find=[&](auto&& self,QQuickItem* at)->QQuickItem* {
            if (at->objectName()==name) { return at; }
            for (auto* child : at->childItems()) { if (auto* hit=self(self,child)) { return hit; } }
            return nullptr;
        };
        if (auto* hit=find(find,window->contentItem())) { return hit; }
        for (auto* candidate : QGuiApplication::allWindows()) {
            auto* popup=qobject_cast<QQuickWindow*>(candidate);
            if (popup && popup!=window.get()) {
                if (auto* hit=find(find,popup->contentItem())) { return hit; }
            }
        }
        return nullptr;
    }
    bool open(const QByteArray& body, QVariantMap properties = {}) {
        engine=std::make_unique<QQmlEngine>();
        QQmlComponent component(engine.get());
        component.setData("import QtQuick\nimport NodeTool.Timeline\n"+body,QUrl());
        properties.insert("timeline",QVariant::fromValue(&model));
        root.reset(component.createWithInitialProperties(properties));
        if (!root) { qWarning().noquote()<<component.errorString(); return false; }
        window=std::make_unique<QQuickWindow>(); window->resize(800,std::max(400,root->property("height").toInt()));
        qobject_cast<QQuickItem*>(root.get())->setParentItem(window->contentItem());
        window->show();
        if(!QTest::qWaitForWindowExposed(window.get())) { return false; }
        window->requestActivate();
        return QTest::qWaitForWindowActive(window.get());
    }
    bool openTracks(bool shown = false) {
        return open(R"(TracksRegion { width:800; height:600; required timeline; required clock
Component.onCompleted: AutomationUIState.shownAutomationTrackIds = )" + QByteArray(shown ? "[\"a\"]" : "[]") + R"( })",
                    {{"clock",QVariant::fromValue(&clock)}});
    }
    QPoint point(QQuickItem* target,double x,double y) const { return target->mapToScene({x,y}).toPoint(); }
    void click(const QString& name) {
        QTRY_VERIFY2(item(name),qPrintable(name));
        const QPointer<QQuickItem> target=item(name);
        const bool menuItem=target->inherits("QQuickMenuItem");
        const QPointer<QObject> menu=target->property("menu").value<QObject*>();
        QVERIFY(target->window());
        QTest::mouseClick(target->window(),Qt::LeftButton,Qt::NoModifier,point(target,target->width()/2,target->height()/2));
        QCoreApplication::processEvents();
        if(menuItem) {
            QTRY_VERIFY(!menu || !menu->property("visible").toBool());
            QTRY_VERIFY(!target || !target->isVisible());
        }
        QSignalSpy frame(window.get(),&QQuickWindow::frameSwapped);
        window->update();
        QVERIFY(frame.count()>0 || frame.wait(2000));
    }
private slots:
    void init() {
        nt::automation::registerEdits();
        const auto parsed=nt::parseTimelineJson(R"({"name":"P2","fps":30,"width":640,"height":360,"durationMs":10000,"tracks":[{"id":"a","type":"audio","index":0,"name":"Vox","volumeDb":-6,"automation":[{"id":"lane","target":{"kind":"mixer","param":"volumeDb"},"points":[]}]},{"id":"v","type":"video","index":1}],"clips":[],"master":{"volumeDb":0}})");
        QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
    }
    void cleanup() {
        window.reset(); root.reset(); engine.reset();
        QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
        QCoreApplication::processEvents();
    }
    void laneDimensions() {
        QVERIFY(open(R"(AutomationLanes { width:800; required timeline
track: ({id:"a",type:"audio",automation:[{id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}]})
Component.onCompleted: AutomationUIState.shownAutomationTrackIds=["a"] })"));
        QTRY_COMPARE(root->property("implicitHeight").toDouble(),96.);
        auto* lane=item("automation-lane-lane"); QVERIFY(lane); QCOMPARE(lane->height(),56.);
        QVERIFY(item("automation-add-row-a")); QCOMPARE(item("automation-add-row-a")->height(),40.);
        QVERIFY(!item("automation-add-a"));
    }
    void headerAutomationToggle() {
        QVERIFY(openTracks());
        auto* button=item("track-automation-a"); QVERIFY(button);
        QVERIFY(button->isVisible());
        QCOMPARE(button->property("tone").toString(),"idle");
        auto* accessible=QAccessible::queryAccessibleInterface(button); QVERIFY(accessible);
        QCOMPARE(accessible->text(QAccessible::Name),"Show automation lanes");
        click("track-automation-a");
        QTRY_VERIFY(item("automation-lane-lane") && item("automation-lane-lane")->isVisible());
        QCOMPARE(button->property("tone").toString(),"idle");
        QCOMPARE(accessible->text(QAccessible::Name),"Hide automation lanes");
        click("track-automation-a");
        QTRY_VERIFY(!item("automation-lane-lane") || !item("automation-lane-lane")->isVisible());
        QCOMPARE(button->property("tone").toString(),"idle");
        QCOMPARE(accessible->text(QAccessible::Name),"Show automation lanes");

        auto* emptyButton=item("track-automation-v"); QVERIFY(emptyButton);
        QCOMPARE(emptyButton->property("tone").toString(),"dim");
        click("track-automation-v");
        QTRY_VERIFY(item("automation-add-v") && item("automation-add-v")->isVisible());
        QCOMPARE(emptyButton->property("tone").toString(),"idle");
        click("track-automation-v");
        QCOMPARE(emptyButton->property("tone").toString(),"dim");

        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{}}});
        QTRY_VERIFY(item("track-automation-a") && item("track-automation-a")->property("tone").toString()=="dim");
        model.undoStack()->undo();
        QTRY_VERIFY(item("track-automation-a") && item("track-automation-a")->property("tone").toString()=="idle");
    }
    void automationTrackTypes_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<bool>("supported");
        QTest::newRow("audio") << "audio" << true;
        QTest::newRow("midi") << "midi" << true;
        QTest::newRow("video") << "video" << true;
        QTest::newRow("overlay") << "overlay" << true;
        QTest::newRow("subtitle") << "subtitle" << false;
        QTest::newRow("chord") << "chord" << false;
    }
    void automationTrackTypes() {
        QFETCH(QString,type); QFETCH(bool,supported);
        auto raw=doc(); auto tracks=raw["tracks"].toArray();
        auto first=tracks[0].toObject(); first["type"]=type; tracks[0]=first; raw["tracks"]=tracks;
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        QVERIFY(openTracks());
        auto* button=item("track-automation-a");
        if (supported) { QVERIFY(button); QVERIFY(button->isVisible()); }
        else { QVERIFY(!button); }
    }
    void headerColumnAlignment() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto first=tracks[0].toObject();
        auto lanes=first["automation"].toArray();
        lanes.append(QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},{"points",QJsonArray{}}});
        first["automation"]=lanes; tracks[0]=first; raw["tracks"]=tracks;
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        QVERIFY(openTracks(true));
        QTRY_VERIFY(item("automation-lane-pan"));
        auto* column=item("headerColumn"); QVERIFY(column);
        auto* viewport=item("lanesViewport"); QVERIFY(viewport);
        for (const auto& id : {QStringLiteral("lane"),QStringLiteral("pan")}) {
            auto* header=item("automation-header-"+id); QVERIFY(header);
            auto* lane=item("automation-lane-"+id); QVERIFY(lane);
            QVERIFY(column->isAncestorOf(header));
            QVERIFY(viewport->isAncestorOf(lane));
            QCOMPARE(header->height(),56.);
            QCOMPARE(header->height(),lane->height());
            QTRY_COMPARE(header->mapToScene({0,0}).y(),lane->mapToScene({0,0}).y());
        }
        auto* add=item("automation-add-a"); QVERIFY(add);
        auto* space=item("automation-add-row-a"); QVERIFY(space);
        QVERIFY(column->isAncestorOf(add)); QVERIFY(viewport->isAncestorOf(space));
        QCOMPARE(add->height(),40.); QCOMPARE(space->height(),40.);
        QTRY_COMPARE(add->mapToScene({0,0}).y(),space->mapToScene({0,0}).y());
        auto* below=item("trackHeader-v"); QVERIFY(below);
        auto* belowLane=item("trackLane-v"); QVERIFY(belowLane);
        QTRY_COMPARE(below->mapToScene({0,0}).y(),belowLane->mapToScene({0,0}).y());
        QCOMPARE(below->height(),belowLane->height());
        QCOMPARE(below->mapToScene({0,0}).y(),add->mapToScene({0,add->height()}).y());
        click("track-automation-a");
        QTRY_COMPARE(below->mapToScene({0,0}).y(),item("trackHeader-a")->mapToScene({0,item("trackHeader-a")->height()}).y());
        QTRY_COMPARE(below->mapToScene({0,0}).y(),belowLane->mapToScene({0,0}).y());
    }
    void toolbarHasNoAutomationMenu() {
        QVERIFY(open(R"(MixerToolbar { required timeline })"));
        QVERIFY(item("mixer-toggle"));
        QVERIFY(!item("automation-toggle"));
    }
    void compactMixerToolbar() {
        QVERIFY(open(R"(MixerToolbar { required timeline; compact:true })"));
        auto* toggle=item("mixer-toggle");
        QVERIFY(toggle);
        QVERIFY(!toggle->property("showLabel").toBool());
        const auto compactWidth=toggle->width();
        root->setProperty("compact",false);
        QTRY_VERIFY(toggle->property("showLabel").toBool());
        QVERIFY(toggle->width()>compactWidth);
        const bool wasOpen=toggle->property("active").toBool();
        click("mixer-toggle");
        QCOMPARE(toggle->property("active").toBool(),!wasOpen);
    }
    void clickAndDragOneUndo() {
        QVERIFY(open(R"(AutomationLaneView { width:800; required timeline
track: ({id:"a",type:"audio"}); lane: ({id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}); msPerPx:10 })"));
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,100,28));
        QCOMPARE(model.undoStack()->count(),0);
        QTest::mouseMove(window.get(),point(lane,120,20),20);
        QCOMPARE(model.undoStack()->count(),0);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,120,20));
        QCOMPARE(model.undoStack()->count(),1);
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points.size(),1); QCOMPARE(points[0].toObject()["timeMs"].toDouble(),1200.);
        const auto from=point(lane,120,20),to=point(lane,150,30);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),to,20); QCOMPARE(model.undoStack()->count(),1);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,to);
        QCOMPARE(model.undoStack()->count(),2);
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray()[0].toObject()["timeMs"].toDouble(),1500.);
        model.undoStack()->undo();
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray()[0].toObject()["timeMs"].toDouble(),1200.);
    }
    void deleteAndEasing() {
        QVERIFY(open(R"(AutomationLaneView { width:800; required timeline
track: ({id:"a",type:"audio"}); lane: ({id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}); msPerPx:10 })"));
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,100,28));
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),1);
        QTest::mouseClick(window.get(),Qt::RightButton,Qt::NoModifier,point(lane,100,28));
        click("automation-easing-hold");
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray()[0].toObject()["easing"].toString(),"hold");
        QCOMPARE(model.undoStack()->count(),2);
        QTest::keyClick(window.get(),Qt::Key_Delete);
        QVERIFY(track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
        QCOMPARE(model.undoStack()->count(),3);
    }
    void faderOneUndo() {
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* fader=item("fader-a"); QVERIFY(fader);
        const auto from=point(fader,12,fader->height()*.6),to=point(fader,12,10+(fader->height()-20)*.14);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),to,20); QCOMPARE(model.undoStack()->count(),0);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,to);
        QCOMPARE(model.undoStack()->count(),1);
        QVERIFY(std::abs(track()["volumeDb"].toDouble())<=.3);
        model.undoStack()->undo(); QCOMPARE(track()["volumeDb"].toDouble(),-6.);
    }
    void faderCancellationRestoresDraftWithoutUndo() {
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* fader = item("fader-a");
        QVERIFY(fader);
        const auto from = point(fader, 12, fader->height() * .6);
        const auto to = point(fader, 12, fader->height() * .3);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(window.get(), to, 20);
        QVERIFY(fader->property("draft").toDouble() != -6.);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(track()["volumeDb"].toDouble(), -6.);
        QCOMPARE(fader->property("draft").toDouble(), -6.);
    }
    void panCancellationRestoresDraftWithoutUndo() {
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* pan = item("pan-a");
        QVERIFY(pan);
        const auto from = point(pan, pan->width() / 2, pan->height() / 2);
        const auto to = from + QPoint(12, -12);
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(window.get(), to, 20);
        QCOMPARE(model.undoStack()->count(), 0);
        QTest::keyClick(window.get(), Qt::Key_Escape);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(model.undoStack()->count(), 0);
        QCOMPARE(track()["pan"].toDouble(), 0.);
    }
    void panMuteSoloMaster() {
        QVERIFY(open(R"(Item { width:400; height:360; required property TimelineModel timeline
ChannelStrip { width:120; height:360; timeline:parent.timeline; trackId:"a" }
ChannelStrip { x:130; width:120; height:360; timeline:parent.timeline; master:true }
})"));
        auto* pan=item("pan-a"); QVERIFY(pan);
        pan->forceActiveFocus(); QTest::keyPress(window.get(),Qt::Key_Right); QTest::keyRelease(window.get(),Qt::Key_Right);
        QCOMPARE(track()["pan"].toDouble(),.01); QCOMPARE(model.undoStack()->count(),1);
        click("mute-a"); QVERIFY(track()["muted"].toBool());
        click("solo-a"); QVERIFY(track()["solo"].toBool()); QCOMPARE(model.undoStack()->count(),3);
        auto* fader=item("fader-master"); QVERIFY(fader);
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(fader,12,fader->height()/2));
        QCOMPARE(model.undoStack()->count(),4); QVERIFY(doc()["master"].toObject()["volumeDb"].toDouble()<0);
    }
    void faderKeyboardAndGrab() {
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* fader=item("fader-a"); QVERIFY(fader);
        fader->forceActiveFocus(); QTest::keyClick(window.get(),Qt::Key_Right);
        QCOMPARE(track()["volumeDb"].toDouble(),-5.7);
        model.undoStack()->undo();
        const double cap=10+(fader->height()-20)*.31;
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(fader,12,cap+3));
        QCOMPARE(fader->property("draft").toDouble(),-6.);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,point(fader,12,cap+3));
        QCOMPARE(model.undoStack()->index(),0);
    }
    void mountedSlots_data() {
        QTest::addColumn<bool>("popupWindow");
        QTest::newRow("default-popup") << false;
        if (QGuiApplication::platformName() != "offscreen") { QTest::newRow("window-popup") << true; }
    }
    void mountedSlots() {
        QFETCH(bool, popupWindow);
        QVERIFY(open(R"(Item { width:800; height:900; required property TimelineModel timeline
 required property PlaybackClock clock
 MixerToolbar { timeline:parent.timeline }
 PanelSlot { slot:"bottom"; y:100; width:parent.width }
 TracksRegion { y:460; width:800; height:400; timeline:parent.timeline; clock:parent.clock }
 Component.onCompleted: { AutomationUIState.mixerOpen=false; AutomationUIState.shownAutomationTrackIds=[] }
})",{{"clock",QVariant::fromValue(&clock)}}));
        click("mixer-toggle");
        QTRY_VERIFY(item("mixer-strip-a"));
        QVERIFY(item("mixer-strip-a")->isVisible());
        click("track-automation-a");
        QTRY_VERIFY(item("automation-lane-lane"));
        QCOMPARE(item("automation-lane-lane")->height(),56.);
        QCOMPARE(item("automation-add-a")->height(),40.);
        click("automation-power-lane");
        QCOMPARE(track()["automation"].toArray()[0].toObject()["enabled"].toBool(true),false);
        QCOMPARE(model.undoStack()->count(),1);
        model.undoStack()->undo();
        click("automation-remove-lane");
        QVERIFY(track()["automation"].toArray().empty());
        QCOMPARE(model.undoStack()->count(),1);
        {
            auto* picker=item("automation-picker-a"); QVERIFY(picker);
            auto* header=item("automation-add-a"); QVERIFY(header);
            auto* popup=header->property("popupControl").value<QObject*>(); QVERIFY(popup);
            QVERIFY(popup->setProperty("popupType",popupWindow ? 1 : 0)); // Popup.Window / Popup.Item
            QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(picker,picker->width()-8,picker->height()/2));
            QTRY_VERIFY(popup->property("visible").toBool());
            QTest::keyClick(window.get(), Qt::Key_V);
            QTest::keyClick(window.get(), Qt::Key_O);
            QTest::keyClick(window.get(), Qt::Key_L);
            QTRY_VERIFY(item("automation-option-mixer:volumeDb"));
            QVERIFY(!item("automation-option-mixer:pan"));
        }
        click("automation-option-mixer:volumeDb");
        QCOMPARE(track()["automation"].toArray().size(),1);
        QCOMPARE(model.undoStack()->count(),2);
        const auto lane=track()["automation"].toArray()[0].toObject();
        QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(lane["id"].toString()).hasMatch());
        QCOMPARE(lane["target"].toObject()["param"].toString(),"volumeDb");
        auto* picker=item("automation-picker-a"); QVERIFY(picker);
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(picker,picker->width()-8,picker->height()/2));
        QTRY_VERIFY(item("automation-option-mixer:pan"));
    }
    void effectCurveCancellationRestoresWithoutUndo_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("handle");
        QTest::addColumn<bool>("disable");
        QTest::newRow("eq-escape") << "eq3" << "mid" << false;
        QTest::newRow("eq-disable") << "eq3" << "mid" << true;
        QTest::newRow("compressor-escape") << "compressor" << "threshold" << false;
        QTest::newRow("compressor-disable") << "compressor" << "threshold" << true;
    }
    void effectCurveCancellationRestoresWithoutUndo() {
        QFETCH(QString, type);
        QFETCH(QString, handle);
        QFETCH(bool, disable);
        QVERIFY(open(R"(MixerView { width:800; height:360; required timeline })"));
        click("add-effect-a");
        click("add-" + type + "-a");
        const auto before = track()["effects"].toArray();
        const auto effectId = before.first().toObject()["id"].toString();
        click("open-effect-" + effectId);
        auto* grip = item("effect-handle-" + type + "-" + handle);
        QVERIFY(grip);
        const auto from = point(grip, grip->width() / 2, grip->height() / 2);
        const auto to = from + QPoint(18, -12);
        const auto undoCount = model.undoStack()->count();
        QTest::mousePress(window.get(), Qt::LeftButton, Qt::NoModifier, from);
        QTest::mouseMove(window.get(), to, 20);
        QCOMPARE(model.undoStack()->count(), undoCount);
        if (disable) grip->setEnabled(false);
        else QTest::keyClick(window.get(), Qt::Key_Escape);
        QTest::mouseRelease(window.get(), Qt::LeftButton, Qt::NoModifier, to);
        QCOMPARE(model.undoStack()->count(), undoCount);
        QCOMPARE(track()["effects"].toArray(), before);
    }
    void effectCurveEditors_data() {
        QTest::addColumn<QString>("type"); QTest::addColumn<QString>("handle"); QTest::addColumn<QString>("parameter");
        QTest::newRow("eq3") << "eq3" << "mid" << "midGainDb";
        QTest::newRow("compressor") << "compressor" << "threshold" << "thresholdDb";
    }
    void effectCurveEditors() {
        QFETCH(QString,type); QFETCH(QString,handle); QFETCH(QString,parameter);
        QVERIFY(open(R"(MixerView { width:800; height:360; required timeline })"));
        click("add-effect-a"); click("add-"+type+"-a");
        const auto fx=track()["effects"].toArray()[0].toObject();
        click("open-effect-"+fx["id"].toString());
        QCOMPARE(fx["type"].toString(),type);
        QTRY_VERIFY(item("effect-curve-"+type));
        auto* curve=item("effect-curve-"+type);
        QCOMPARE(curve->height(),type=="eq3"?160.:180.);
        auto* viewport=curve->parentItem();
        while(viewport && !viewport->inherits("QQuickFlickable")) { viewport=viewport->parentItem(); }
        QVERIFY(viewport);
        QTRY_VERIFY(viewport->mapToScene({0,0}).y()>=0);
        QTRY_VERIFY(viewport->mapToScene({0,viewport->height()}).y()<=window->height());
        auto* grip=item("effect-handle-"+type+"-"+handle); QVERIFY(grip);
        const auto from=point(grip,grip->width()/2,grip->height()/2), to=from+QPoint(18,-12);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),to,20); QCOMPARE(model.undoStack()->count(),1);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,to);
        QCOMPARE(model.undoStack()->count(),2);
        QVERIFY(track()["effects"].toArray()[0].toObject()[parameter].toDouble()>fx[parameter].toDouble());
        model.undoStack()->undo(); QCOMPARE(track()["effects"].toArray()[0].toObject()[parameter],fx[parameter]);
        QImage image;
        QTRY_VERIFY_WITH_TIMEOUT(([&] { window->requestUpdate(); image=window->grabWindow(); return !image.isNull(); })(),2000);
        QVERIFY(image.save(QCoreApplication::applicationDirPath()+"/p2-"+type+".png"));
    }
    void pendingWheelEditStaysWithEffect_data() {
        QTest::addColumn<QString>("type");
        QTest::addColumn<QString>("handle");
        QTest::addColumn<QString>("parameter");
        QTest::addColumn<double>("expected");
        QTest::newRow("eq3-mid-q") << "eq3" << "mid" << "midQ" << 1.1;
        QTest::newRow("compressor-knee") << "compressor" << "threshold" << "kneeDb" << 31.;
    }
    void pendingWheelEditStaysWithEffect() {
        QFETCH(QString,type);
        QFETCH(QString,handle);
        QFETCH(QString,parameter);
        QFETCH(double,expected);
        QVERIFY(open(R"(MixerView { width:800; height:360; required timeline })"));
        click("add-effect-a"); click("add-"+type+"-a");
        click("add-effect-a"); click("add-"+type+"-a");
        const auto effects=track()["effects"].toArray();
        QCOMPARE(effects.size(),2);
        const auto first=effects[0].toObject(),second=effects[1].toObject();
        click("open-effect-"+first["id"].toString());
        QTRY_VERIFY(item("effect-handle-"+type+"-"+handle));
        auto* grip=item("effect-handle-"+type+"-"+handle);
        const auto position=point(grip,grip->width()/2,grip->height()/2);
        QWheelEvent wheel(position,window->mapToGlobal(position),{},{0,120},Qt::NoButton,Qt::NoModifier,Qt::NoScrollPhase,false);
        QElapsedTimer elapsed;
        elapsed.start();
        QCoreApplication::sendEvent(window.get(),&wheel);
        QVERIFY(wheel.isAccepted());
        QCOMPARE(item("effect-curve-"+type)->property("draft").toMap()[parameter].toDouble(),expected);
        QCOMPARE(model.undoStack()->count(),2);
        click("close-effect-popover");
        click("open-effect-"+second["id"].toString());
        QVERIFY2(elapsed.elapsed()<250,"Effect B must open before the wheel timer fires");
        QTest::qWait(500);
        const auto after=track()["effects"].toArray();
        QCOMPARE(after[1].toObject()[parameter],second[parameter]);
        QCOMPARE(after[0].toObject()[parameter].toDouble(),expected);
        QCOMPARE(model.undoStack()->count(),3);
        model.undoStack()->undo();
        QCOMPARE(track()["effects"].toArray(),effects);
    }
    void mixerOrderAndInserts() {
        QVERIFY(open(R"(MixerView { width:800; height:360; required timeline })"));
        QVERIFY(item("mixer-strip-a")); QVERIFY(!item("mixer-strip-v")); QVERIFY(item("mixer-strip-master"));
        QCOMPARE(item("mixer-strip-a")->width(),120.);
        auto raw=doc(); auto tracks=raw["tracks"].toArray();
        tracks.append(QJsonObject{{"id","m"},{"type","midi"},{"name","Keys"},{"index",2}});
        tracks.append(QJsonObject{{"id","b"},{"type","audio"},{"name","Bass"},{"index",3}});
        raw["tracks"]=tracks;
        model.setTimeline(*nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline);
        QTRY_VERIFY(item("mixer-strip-m")); QTRY_VERIFY(item("mixer-strip-b"));
        QTRY_VERIFY(item("mixer-strip-a")->mapToScene({0,0}).x()<item("mixer-strip-m")->mapToScene({0,0}).x());
        QVERIFY(item("mixer-strip-m")->mapToScene({0,0}).x()<item("mixer-strip-b")->mapToScene({0,0}).x());
        QVERIFY(item("mixer-strip-b")->mapToScene({0,0}).x()<item("mixer-strip-master")->mapToScene({0,0}).x());
        click("add-effect-a"); click("add-filter-a");
        const auto effects=track()["effects"].toArray(); QCOMPARE(effects.size(),1);
        const auto id=effects[0].toObject()["id"].toString();
        click("bypass-"+id); QVERIFY(!track()["effects"].toArray()[0].toObject()["enabled"].toBool());
        QCOMPARE(model.undoStack()->count(),2);
        click("open-effect-"+id);
        auto* frequency=item("effect-param-frequency"); QVERIFY(frequency);
        QVERIFY(frequency->property("disabled").toBool());
        click("close-effect-popover"); click("bypass-"+id); click("open-effect-"+id);
        frequency=item("effect-param-frequency"); QVERIFY(frequency);
        QQuickItem* slider=nullptr;
        for(auto* child:frequency->findChildren<QQuickItem*>()) { if(child->inherits("QQuickSlider")) { slider=child; break; } }
        QVERIFY(slider);
        QTRY_VERIFY(slider->isEnabled());
        QTRY_VERIFY(slider->width()>50);
        const auto before=model.undoStack()->count();
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(slider,slider->width()*.4,slider->height()/2));
        QTest::mouseMove(window.get(),point(slider,slider->width()*.7,slider->height()/2),20);
        QCOMPARE(model.undoStack()->count(),before);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,point(slider,slider->width()*.7,slider->height()/2));
        QCOMPARE(model.undoStack()->count(),before+1);
        const double changedFrequency=track()["effects"].toArray()[0].toObject()["frequency"].toDouble();
        QVERIFY2(changedFrequency>1000,qPrintable(QString::number(changedFrequency)));
        QImage image;
        QTRY_VERIFY_WITH_TIMEOUT(([&] { window->requestUpdate(); image=window->grabWindow(); return !image.isNull(); })(),2000);
        QVERIFY(image.save(QCoreApplication::applicationDirPath()+"/p2-mixer.png"));
    }
};
int main(int argc,char** argv) { QGuiApplication app(argc,argv); TestAutomationUi test; return QTest::qExec(&test,argc,argv); }
#include "tst_automationui.moc"
