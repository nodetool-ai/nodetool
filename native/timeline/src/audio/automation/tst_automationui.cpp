#include "../../../tests/TestAssetCacheRoot.h"
#include "audio/automation/Automation.h"
#include "audio/automation/AutomationRecorder.h"
#include "audio/automation/AutomationController.h"
#include <cmath>
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
    TestAssetCacheRoot m_testCache;
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
        m_testCache.install(*engine);
        QQmlComponent component(engine.get());
        component.setData("import QtQuick\nimport NodeTool.Timeline\nimport NodeTool.TimelinePlayer\n"+body,QUrl());
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
    bool openTracks(bool shown = false, double uiScale = 1) {
        return open(R"(import NodeTool.UiPrimitives as Ui
TracksRegion { width:800; height:600; required timeline; required clock; property real testScale:1
Component.onCompleted: { Ui.Theme.uiScale=testScale; AutomationUIState.showAutomation = true; AutomationUIState.shownAutomationTrackIds = )" + QByteArray(shown ? "[\"a\"]" : "[]") + R"( } })",
                    {{"clock",QVariant::fromValue(&clock)},{"testScale",uiScale}});
    }
    QPoint point(QQuickItem* target,double x,double y) const { return target->mapToScene({x,y}).toPoint(); }
    void click(const QString& name) {
        QTRY_VERIFY2(item(name),qPrintable(name));
        const QPointer<QQuickItem> target=item(name);
        if (auto* viewport=item("timelineToolViewport"); viewport && viewport->isAncestorOf(target)) {
            const auto at=target->mapToItem(viewport,{0,0});
            const double offset=at.x()<0 ? at.x() : std::max(0.,at.x()+target->width()-viewport->width());
            viewport->setProperty("contentX",viewport->property("contentX").toDouble()+offset);
            QCoreApplication::processEvents();
        }
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
        clock.pause();
        window.reset(); root.reset(); engine.reset();
        QCoreApplication::sendPostedEvents(nullptr,QEvent::DeferredDelete);
        QCoreApplication::processEvents();
    }
    void modeUndoSaveAndPassLifecycle() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QCOMPARE(track()["automationMode"].toString(),"touch");
        auto saved=nt::parseTimelineJson(model.documentJson()); QVERIFY(saved.timeline);
        QCOMPARE(saved.timeline->findTrack("a")->raw["automationMode"].toString(),"touch");
        model.undoStack()->undo(); QVERIFY(!track().contains("automationMode"));
        model.undoStack()->redo();
        qint64 now=0;
        PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.play();
        QVERIFY(recorder.gestureStart("a","volumeDb"));
        QVERIFY(recorder.record("a","volumeDb",-12));
        QVERIFY(recorder.record("a","volumeDb",-18));
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        now=1000000000; transport.tick();
        const auto count=model.undoStack()->count();
        recorder.gestureEnd("a","volumeDb");
        QCOMPARE(model.undoStack()->count(),count+1);
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points.size(),3); QCOMPARE(points[0].toObject()["value"].toDouble(),-18.);
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
        model.undoStack()->undo(); QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),0);
        model.undoStack()->redo();
        QVERIFY(recorder.gestureStart("a","volumeDb"));
        const auto state=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(state);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","off"}});
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->volumeDb.load()));
        QCOMPARE(track()["automationMode"].toString(),"off");
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
        transport.pause();
    }
    void writeSwitchesOnlyWhileWriteAndSeekEndsBeforeMove() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.play();
        const auto live=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(live);
        const auto before=model.undoStack()->count();
        transport.seek(transport.time());
        QCOMPARE(model.undoStack()->count(),before);
        QCOMPARE(track()["automationMode"].toString(),"write");
        QVERIFY(std::isfinite(live->volumeDb.load()));
        now=1000000000; transport.tick();
        recorder.record("a","volumeDb",-20);
        transport.seek(5000);
        QCOMPARE(track()["automationMode"].toString(),"latch");
        const auto lanes=track()["automation"].toArray(); QCOMPARE(lanes.size(),2);
        for (const auto& v : lanes) { QCOMPARE(v.toObject()["points"].toArray().last().toObject()["timeMs"].toDouble(),1200.); }
        QVERIFY(std::isnan(live->volumeDb.load())); QVERIFY(std::isnan(live->pan.load()));
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        transport.pause();
    }
    void writeTargetsShareTransportStart() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { const auto at=now; now+=1000000; return at; });
        transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.play(); transport.pause();
        const auto lanes=track()["automation"].toArray(); QCOMPARE(lanes.size(),2);
        QCOMPARE(lanes[0].toObject()["points"].toArray().first().toObject()["timeMs"],
                 lanes[1].toObject()["points"].toArray().first().toObject()["timeMs"]);
    }
    void spanRestEndsAtPlaybackBoundary() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","latch"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.playSpan(1000,2000,500,false);
        QVERIFY(recorder.gestureStart("a","volumeDb")); recorder.record("a","volumeDb",-12);
        now=1000000000; transport.tick();
        QVERIFY(!transport.playing()); QCOMPARE(transport.time(),500.);
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points.last().toObject()["timeMs"].toDouble(),2200.);
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
    }
    void loopEndsPassAndReleasesOverride() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","latch"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.playSpan(1000,2000,-1,true);
        QVERIFY(recorder.gestureStart("a","pan")); recorder.record("a","pan",.5);
        const auto state=model.snapshot()->findTrack("a")->mixerOverride;
        now=500000000; transport.tick();
        now=1000000000; transport.tick();
        QVERIFY(transport.playing()); QVERIFY(std::isnan(state->pan.load()));
        QCOMPARE(track()["pan"].toDouble(),0.);
        const auto lanes=track()["automation"].toArray(); QCOMPARE(lanes.size(),2);
        const auto points=lanes[1].toObject()["points"].toArray();
        QCOMPARE(points.last().toObject()["timeMs"].toDouble(),1700.);
        transport.pause();
    }
    void spanRestartEndsBeforeMove_data() {
        QTest::addColumn<bool>("range");
        QTest::newRow("span") << false;
        QTest::newRow("in-out") << true;
    }
    void spanRestartEndsBeforeMove() {
        QFETCH(bool,range);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","latch"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000); transport.play();
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        QVERIFY(recorder.gestureStart("a","pan")); recorder.record("a","pan",.5);
        const auto state=model.snapshot()->findTrack("a")->mixerOverride;
        now=500000000; transport.tick();
        if (range) { transport.setRangeIn(3000); transport.setRangeOut(4000); transport.playInToOut(); }
        else { transport.playSpan(3000,4000,-1,false); }
        QVERIFY(std::isnan(state->pan.load()));
        const auto lanes=track()["automation"].toArray(); QCOMPARE(lanes.size(),2);
        QCOMPARE(lanes[1].toObject()["points"].toArray().last().toObject()["timeMs"].toDouble(),700.);
        transport.pause();
    }
    void lockedPassCancelsAndDestructionReleases() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000); transport.play();
        std::shared_ptr<nt::MixerOverride> state;
        {
            AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
            QVERIFY(recorder.gestureStart("a","pan"));
            state=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(state);
            recorder.record("a","pan",.5);
        }
        QVERIFY(std::isnan(state->pan.load()));
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
        QCOMPARE(track()["automation"].toArray().size(),1);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        QVERIFY(recorder.gestureStart("a","pan"));
        state=model.snapshot()->findTrack("a")->mixerOverride;
        QVERIFY(model.applyEdit("setTrackLocked",{{"trackId","a"},{"locked",true}}));
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->pan.load()));
        QCOMPARE(track()["automation"].toArray().size(),1);
        model.applyEdit("setTrackLocked",{{"trackId","a"},{"locked",false}});
        recorder.gestureStart("a","pan");
        state=model.snapshot()->findTrack("a")->mixerOverride;
        QVERIFY(model.applyEdit("removeTrack",{{"trackId","a"}}));
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->pan.load()));
        transport.pause();
    }
    void readoutUsesCurveAndOverride() {
        const QJsonArray points{QJsonObject{{"timeMs",0},{"value",-18}},QJsonObject{{"timeMs",2000},{"value",-6}}};
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{QJsonObject{{"id","volume"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",points}}}}});
        qint64 now=0; PlaybackClock transport; transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000); transport.seek(1000);
        AutomationReadout readout; readout.setTimeline(&model); readout.setClock(&transport); readout.setTrackId("a");
        readout.setTarget({{"kind","mixer"},{"param","volumeDb"}});
        QCOMPARE(readout.value(),-12.);
        AutomationController curve; curve.trackId="a"; curve.setTimeline(&model);
        QCOMPARE(curve.laneValueAt("volume",1000,0),-12.);
        model.setMixerOverride("a","volumeDb",-3); QCOMPARE(readout.value(),-3.);
        model.setMixerOverride("a","volumeDb",-2); QCOMPARE(readout.value(),-2.);
        QCOMPARE(curve.laneValueAt("volume",1000,0),-12.);
        model.setMixerOverride("a","volumeDb",std::nullopt); QCOMPARE(readout.value(),-12.);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","off"}}); QCOMPARE(readout.value(),-6.);
        QCOMPARE(curve.laneValueAt("volume",1000,0),-12.);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport); transport.play();
        QVERIFY(recorder.gestureStart("a","volumeDb"));
        QCOMPARE(model.snapshot()->findTrack("a")->mixerOverride->volumeDb.load(),-12.);
        recorder.gestureEnd("a","volumeDb"); transport.pause();
    }
    void disabledLaneRecordingAndReverse() {
        auto lanes=track()["automation"].toArray(); auto lane=lanes[0].toObject(); lane["enabled"]=false; lanes[0]=lane;
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",lanes}});
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000); transport.seek(2000); transport.setRate(-1);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport); transport.play();
        recorder.gestureStart("a","volumeDb"); recorder.record("a","volumeDb",-120);
        now=1000000000; transport.tick(); recorder.record("a","volumeDb",-12);
        recorder.gestureEnd("a","volumeDb");
        lane=track()["automation"].toArray()[0].toObject(); QVERIFY(lane["enabled"]!=false);
        const auto points=lane["points"].toArray();
        QCOMPARE(points.first().toObject()["timeMs"].toDouble(),1000.);
        for (qsizetype i=1;i<points.size();++i) { QVERIFY(points[i].toObject()["timeMs"].toDouble()>points[i-1].toObject()["timeMs"].toDouble()); }
        QCOMPARE(points[1].toObject()["value"].toDouble(),-60.);
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        transport.pause();
    }
    void mixerRecordingDoesNotWriteBaseAfterStop() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(open(R"(Item { id:host; width:400; height:400; required property TimelineModel timeline; required property PlaybackClock clock
 AutomationRecorder { id: recorder; timeline:host.timeline; clock:host.clock }
 Binding { target: AutomationUIState; property:"recorder"; value:recorder }
 ChannelStrip { width:120; height:360; timeline:parent.timeline; trackId:"a" }
})",{{"clock",QVariant::fromValue(&clock)}}));
        clock.setDurationMs(10000); clock.play();
        auto* fader=item("fader-a"); QVERIFY(fader);
        const auto from=point(fader,12,fader->height()*.4), to=point(fader,12,fader->height()*.7);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),to,20);
        clock.pause();
        const auto undo=model.undoStack()->count();
        QTest::mouseMove(window.get(),from,20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        QCOMPARE(model.undoStack()->count(),undo);
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
    }
    void retargetProtectsShownParameter() {
        auto lanes=track()["automation"].toArray();
        lanes.append(QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},{"points",QJsonArray{QJsonObject{{"timeMs",1000},{"value",0}}}}});
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",lanes}});
        QVERIFY(open(R"(AutomationHeaderRow { id:host; width:400; height:56; required timeline; main:false
track: ({id:"a",type:"audio",volumeDb:-6,automation:[{id:"pan",target:{kind:"mixer",param:"pan"},points:[{timeMs:1000,value:0}]}]})
lane:track.automation[0]
Component.onCompleted: AutomationUIState.setShown("a","mixer:volumeDb") })"));
        const auto before=track()["automation"].toArray();
        const QVariant next=QVariantMap{{"key","mixer:volumeDb"},{"target",QVariantMap{{"kind","mixer"},{"param","volumeDb"}}},{"min",-60},{"max",6}};
        QVERIFY(QMetaObject::invokeMethod(root.get(),"choose",Q_ARG(QVariant,next)));
        QCOMPARE(track()["automation"].toArray(),before);
    }
    void retargetRemapsNormalizedHeight() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["effects"]=QJsonArray{QJsonObject{{"id","gain"},{"type","gain"},{"gainDb",0}}};
        t["automation"]=QJsonArray{QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},
            {"points",QJsonArray{QJsonObject{{"timeMs",0},{"value",-1}},QJsonObject{{"timeMs",1000},{"value",1}}}}}};
        tracks[0]=t; raw["tracks"]=tracks; model.setTimeline(*nt::parseTimeline(raw).timeline);
        QVERIFY(open(R"(AutomationHeaderRow { id:host; width:400; height:56; required timeline; main:false
 AutomationController { id: source; timeline:host.timeline; trackId:"a" }
 track:source.channel; lane:track.automation[0]
 Component.onCompleted: AutomationUIState.setShown("a","mixer:volumeDb") })"));
        const QVariant next=QVariantMap{{"key","device:gain:gainDb"},{"target",QVariantMap{{"kind","device"},{"deviceId","gain"},{"param","gainDb"}}},{"min",-24},{"max",24},{"curve","lin"}};
        QVERIFY(QMetaObject::invokeMethod(root.get(),"choose",Q_ARG(QVariant,next)));
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points[0].toObject()["value"].toDouble(),-24.);
        QCOMPARE(points[1].toObject()["value"].toDouble(),24.);
        QCOMPARE(model.undoStack()->count(),1);
    }
    void selectionClearsOnTargetChangeAndLabelStaysVisible() {
        QVERIFY(open(R"(AutomationLaneView { width:800; height:100; required timeline
viewportWidth:400
track: ({id:"a",type:"audio",volumeDb:-6})
lane: ({id:"virtual-volume",target:{kind:"mixer",param:"volumeDb"},points:[{timeMs:20000,value:-6}]}) })"));
        auto* label=item("automation-value-label"); QVERIFY(label);
        QVERIFY(label->x()>=0); QVERIFY(label->x()+label->width()<=400);
        root->setProperty("selected",0);
        root->setProperty("lane",QVariantMap{{"id","virtual-pan"},{"target",QVariantMap{{"kind","mixer"},{"param","pan"}}},{"points",QVariantList{QVariantMap{{"timeMs",0},{"value",0}}}}});
        QTRY_COMPARE(root->property("selected").toInt(),-1);
        QVERIFY(!root->property("dragging").toBool());
    }
    void curveExtendsBeforeFirstPoint() {
        QVERIFY(open(R"(AutomationLaneView { width:800; height:100; required timeline
track: ({id:"a",type:"audio",volumeDb:-6})
lane: ({id:"virtual-volume",target:{kind:"mixer",param:"volumeDb"},points:[{timeMs:20000,value:-6}]}) })"));
        QVariant y;
        QVERIFY(QMetaObject::invokeMethod(root.get(),"yOf",Q_RETURN_ARG(QVariant,y),Q_ARG(QVariant,QVariant(-6.))));
        QTest::qWait(50);
        const auto frame=window->grabWindow(); QVERIFY(!frame.isNull());
        const int row=qRound(y.toDouble()*frame.devicePixelRatio());
        const int column=qRound(150*frame.devicePixelRatio());
        QVERIFY(frame.pixelColor(column,row)!=frame.pixelColor(column,row+qRound(4*frame.devicePixelRatio())));
    }
    void overlayRoutesNameBarAndTopInset_data() {
        QTest::addColumn<double>("uiScale");
        QTest::newRow("normal") << 1.; QTest::newRow("scaled") << 2.;
    }
    void overlayRoutesNameBarAndTopInset() {
        QFETCH(double,uiScale);
        auto raw=doc();
        raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"name","Vox"},{"mediaType","audio"},{"status","generated"},{"startMs",1000},{"durationMs",2000}}};
        const auto parsed=nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        QVERIFY(openTracks(false,uiScale));
        QTRY_VERIFY(item("automation-lane-lane"));
        auto* curve=item("automation-lane-lane");
        auto* clip=item("clip-c"); QVERIFY(clip);
        const double x=clip->mapToItem(curve,{clip->width()/2,0}).x();
        const double msPerPx=curve->property("msPerPx").toDouble();
        const auto before=model.timeline().findClip("c")->startMs;
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(curve,x,8));
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),0);
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(curve,x,3));
        auto points=track()["automation"].toArray()[0].toObject()["points"].toArray(); QCOMPARE(points.size(),1);
        const auto dot=point(curve,x,6), moved=point(curve,x+30,6);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,dot);
        QTest::mouseMove(window.get(),moved,20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,moved);
        points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QVERIFY(std::abs(points[0].toObject()["timeMs"].toDouble()-(x+30)*msPerPx)<=msPerPx);
        QCOMPARE(model.timeline().findClip("c")->startMs,before);
    }
    void writeRecordsWithAutomationAndMixerHidden() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        QVERIFY(open(R"(TracksRegion { width:800; height:600; required timeline; required clock
Component.onCompleted: { AutomationUIState.showAutomation=false; AutomationUIState.mixerOpen=false } })",
            {{"clock",QVariant::fromValue(&clock)}}));
        clock.setDurationMs(10000); clock.play();
        QVERIFY(model.snapshot()->findTrack("a")->mixerOverride);
        clock.pause();
        QCOMPARE(track()["automationMode"].toString(),"latch");
        QCOMPARE(track()["automation"].toArray().size(),2);
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
    }
    void unrelatedClipEditsDoNotNotifyChannel() {
        AutomationController controller; controller.trackId="a"; controller.setTimeline(&model);
        QSignalSpy changes(&controller,&AutomationController::channelChanged);
        QVERIFY(model.replaceClips(QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"mediaType","audio"},{"status","generated"},{"startMs",0},{"durationMs",1000}}}));
        QCOMPARE(changes.count(),0);
        model.applyEdit("setTrackVolume",{{"trackId","a"},{"db",-9}});
        QCOMPARE(changes.count(),1);
    }
    void mixerUnmountEndsTouch() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(open(R"(Item { id:host; width:400; height:400; required property TimelineModel timeline; required property PlaybackClock clock; property bool showStrip:true
 AutomationRecorder { id:recorder; timeline:host.timeline; clock:host.clock }
 Binding { target:AutomationUIState; property:"recorder"; value:recorder }
 Loader { width:120; height:360; active:parent.showStrip; sourceComponent:ChannelStrip { timeline:recorder.timeline; trackId:"a" } }
})",{{"clock",QVariant::fromValue(&clock)}}));
        clock.setDurationMs(10000); clock.play();
        auto* fader=item("fader-a"); QVERIFY(fader);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(fader,12,fader->height()*.4));
        QTest::mouseMove(window.get(),point(fader,12,fader->height()*.7),20);
        const auto state=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(state);
        root->setProperty("showStrip",false);
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->volumeDb.load()));
        QVERIFY(!model.snapshot()->findTrack("a")->mixerOverride);
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
        clock.pause();
    }
    void parameterDotsIgnoreEmptyLanesAndRemovedTargetFallsBack() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["effects"]=QJsonArray{QJsonObject{{"id","gain"},{"type","gain"},{"gainDb",0}}};
        auto lanes=t["automation"].toArray();
        lanes.append(QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},{"points",QJsonArray{}}});
        lanes.append(QJsonObject{{"id","gain-lane"},{"target",QJsonObject{{"kind","device"},{"deviceId","gain"},{"param","gainDb"}}},{"points",QJsonArray{QJsonObject{{"timeMs",0},{"value",0}}}}});
        t["automation"]=lanes; tracks[0]=t; raw["tracks"]=tracks; model.setTimeline(*nt::parseTimeline(raw).timeline);
        QVERIFY(open(R"(AutomationHeaderRow { id:host; width:400; height:32; required timeline
 AutomationController { id:source; timeline:host.timeline; trackId:"a" }
 track:source.channel
 Component.onCompleted:AutomationUIState.setShown("a","device:gain:gainDb") })"));
        click("automation-parameter-a");
        int inspected=0;
        const auto inspect=[&](auto&& self,QQuickItem* child)->void {
            if (child->property("populated").isValid()) {
                ++inspected;
                const auto text=child->property("text").toString();
                QCOMPARE(child->property("populated").toBool(),text.contains("Gain"));
            }
            for (auto* next : child->childItems()) { self(self,next); }
        };
        inspect(inspect,window->contentItem());
        QVERIFY(inspected>=3);
        model.applyEdit("removeTrackEffect",{{"trackId","a"},{"effectId","gain"}});
        QTRY_COMPARE(root->property("shown").toString(),"mixer:volumeDb");
    }
    void lostCurveGrabDoesNotSuspendLaterUndo() {
        QVERIFY(open(R"(AutomationLaneView { width:800; height:56; required timeline
track:({id:"a",type:"audio"})
lane:({id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}) })"));
        auto* curve=qobject_cast<QQuickItem*>(root.get()); QVERIFY(curve);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(curve,100,28));
        QTest::mouseMove(window.get(),point(curve,140,12),20);
        QVERIFY(root->property("dragging").toBool());
        root->setProperty("enabled",false);
        QTRY_VERIFY(!root->property("dragging").toBool());
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,point(curve,140,12));
        const auto count=model.undoStack()->count();
        model.applyEdit("setTrackVolume",{{"trackId","a"},{"db",-12}});
        QCOMPARE(model.undoStack()->count(),count+1);
        model.undoStack()->undo(); QCOMPARE(track()["volumeDb"].toDouble(),-6.);
    }
    void laneDimensions() {
        QVERIFY(open(R"(AutomationLanes { width:800; required timeline
track: ({id:"a",type:"audio",automation:[{id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}]})
Component.onCompleted: { AutomationUIState.showAutomation=true; AutomationUIState.shownAutomationTrackIds=["a"]; AutomationUIState.setShown(track.id,"mixer:pan") } })"));
        QTRY_COMPARE(root->property("implicitHeight").toDouble(),128.);
        auto* lane=item("automation-lane-lane"); QVERIFY(lane); QCOMPARE(lane->height(),56.);
        QVERIFY(item("automation-add-row-a")); QCOMPARE(item("automation-add-row-a")->height(),40.);
        QVERIFY(!item("automation-add-a"));
    }
    void headerAutomationToggle() {
        QVERIFY(openTracks());
        QVERIFY(!item("track-automation-a"));
        QTRY_VERIFY(item("automation-row-a") && item("automation-row-a")->isVisible());
        QVERIFY(item("automation-lane-lane"));
        click("show-automation");
        QTRY_VERIFY(!item("automation-row-a") || !item("automation-row-a")->isVisible());
        QVERIFY(!item("automation-lane-lane"));
        click("show-automation");
        QTRY_VERIFY(item("automation-row-a") && item("automation-row-a")->isVisible());
    }
    void globalToggleSurvivesMusicToolbar() {
        auto raw=doc();
        raw["tracks"]=QJsonArray{raw["tracks"].toArray()[0]};
        raw["tempo"]=QJsonObject{{"bpm",120},{"offsetMs",0},{"timeSignature",QJsonObject{{"beatsPerBar",4},{"beatUnit",4}}}};
        raw["music"]=QJsonObject{};
        const auto parsed=nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        QVERIFY(open(R"(Item { id:host; width:800; height:600; required property TimelineModel timeline; required property PlaybackClock clock
property var dockStore: ({workspace:"Music"})
TracksRegion { anchors.fill:parent; timeline:host.timeline; clock:host.clock }
})",{{"clock",QVariant::fromValue(&clock)}}));
        QTRY_VERIFY(item("musicToolbar") && item("musicToolbar")->isVisible());
        auto* toggle=item("show-automation"); QVERIFY(toggle);
        QVERIFY(toggle->isVisible());
        QVERIFY(!item("timelineToolViewport")->isAncestorOf(toggle));
        click("show-automation");
        QTRY_VERIFY(item("automation-row-a") && item("automation-row-a")->isVisible());
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
        auto* row=item("automation-row-a");
        if (supported) { QVERIFY(row); QVERIFY(row->isVisible()); }
        else { QVERIFY(!row || !row->isVisible()); }
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
        for (const auto& id : {QStringLiteral("pan")}) {
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
        click("show-automation");
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
        QVERIFY(open(R"(Item { width:800; height:640; required property TimelineModel timeline
 required property PlaybackClock clock
 MixerToolbar { timeline:parent.timeline }
 PanelSlot { slot:"bottom"; y:100; width:parent.width }
 TracksRegion { y:100; width:800; height:400; visible: !AutomationUIState.mixerOpen; timeline:parent.timeline; clock:parent.clock }
 Component.onCompleted: { AutomationUIState.mixerOpen=false; AutomationUIState.shownAutomationTrackIds=[] }
})",{{"clock",QVariant::fromValue(&clock)}}));
        click("mixer-toggle");
        QTRY_VERIFY(item("mixer-strip-a"));
        QVERIFY(item("mixer-strip-a")->isVisible());
        click("mixer-toggle");
        QTRY_VERIFY(!item("mixer-strip-a")->isVisible());
        click("show-automation");
        QTRY_VERIFY(item("automation-lane-lane"));
        auto* row=item("automation-row-a"); QVERIFY(row);
        QVERIFY(QMetaObject::invokeMethod(row,"choose",Q_ARG(QVariant,QVariant::fromValue(QVariantMap{{"key","mixer:pan"}}))));
        // Open sub-lanes using the row's leading disclosure button.
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(row,12,16));
        QTRY_VERIFY(item("automation-add-a") && item("automation-add-a")->isVisible());
        QCOMPARE(item("automation-add-a")->height(),40.);
        click("automation-parameter-lane");
        click("automation-power-lane");
        QCOMPARE(track()["automation"].toArray()[0].toObject()["enabled"].toBool(true),false);
        QCOMPARE(model.undoStack()->count(),1);
        model.undoStack()->undo();
        click("automation-parameter-lane");
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
        const auto reopenPoint = point(picker,picker->width()-8,picker->height()/2);
        QVERIFY(QRect(QPoint(), window->size()).contains(reopenPoint));
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,reopenPoint);
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
