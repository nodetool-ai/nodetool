#include "../../../tests/RequireValue.h"
#include <QDir>
#include "../../../tests/TestAssetCacheRoot.h"
#include "assets/AssetWav.h"
#include <QTemporaryDir>
#include <cmath>
#include "audio/automation/Automation.h"
#include "audio/automation/AutomationCurves.h"
#include "app/EditRegistry.h"
#include "audio/automation/MeterReadings.h"
#include "audio/Mixer.h"
#include "audio/AudioEngine.h"
#include <QScopeGuard>
#include "audio/automation/AutomationRecorder.h"
#include "audio/automation/AutomationController.h"
#include <cmath>
#include <algorithm>
#include <array>
#include "model/TimelineModel.h"
#include "chat/TimelineChatHost.h"
#include "model/TimelineJson.h"
#include "playback/PlaybackClock.h"
#include "preview/PreviewCompositor.h"
#include <QAccessible>
#include <QGuiApplication>
#include <QStyleHints>
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
        model.setReadOnly(false);
        clock.pause(); clock.setDurationMs(10000); clock.seek(0);
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
    void gestureMultipleCommitsA1() {
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        c.setGesturePoints("lane",QJsonArray{QJsonObject{{"timeMs",0},{"value",1}}},gen);
        c.setGesturePoints("lane",QJsonArray{QJsonObject{{"timeMs",0},{"value",2}}},gen);
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray()[0].toObject()["value"].toDouble(),2.);
    }
    void gestureCreateThenMoveA1() {
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{QJsonObject{{"timeMs",0},{"value",.1}}},gen);
        const auto id=track()["automation"].toArray().last().toObject()["id"].toString();
        c.setGesturePoints(id,QJsonArray{QJsonObject{{"timeMs",0},{"value",.75}}},gen);
        QCOMPARE(track()["automation"].toArray().last().toObject()["points"].toArray()[0].toObject()["value"].toDouble(),.75);
    }
    void gestureUnrelatedEditA2() {
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        QVERIFY(model.applyEdit("setTrackPan",{{"trackId","v"},{"pan",.25}}));
        QVERIFY(!model.addMarker(100,"Concurrent marker").isEmpty());
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{QJsonObject{{"timeMs",0},{"value",.5}}},gen);
        QCOMPARE(track()["automation"].toArray().size(),2);
    }
    void gestureAssistantMarkerA2() {
        AutomationController controller;
        controller.setTimeline(&model);
        controller.setTrackId("a");
        const auto token = controller.gestureGeneration();
        nt::chat::TimelineChatHost host(model, clock);
        const auto result = host.execute("ui_timeline_add_marker", {
            {"timeline_id", host.context().value("timeline_id")},
            {"timeMs", 100}, {"label", "Assistant marker"}});
        QVERIFY(result.value("ok").toBool());
        controller.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},
            QJsonArray{QJsonObject{{"timeMs",0},{"value",.5}}}, token);
        QCOMPARE(track()["automation"].toArray().size(), 2);
        QCOMPARE(model.markersJson().size(), 1);
        model.undoStack()->undo();
        QCOMPARE(track()["automation"].toArray().size(), 1);
        QCOMPARE(model.markersJson().size(), 1);
        model.undoStack()->undo();
        QVERIFY(model.markersJson().isEmpty());
    }
    void gestureRetargetA3_data() {
        QTest::addColumn<bool>("toMaster");
        QTest::newRow("track") << false;
        QTest::newRow("master") << true;
    }
    void gestureRetargetA3() {
        QFETCH(bool,toMaster);
        auto raw=doc(); auto tracks=raw["tracks"].toArray();
        auto other=track(); other["id"]="b"; tracks.append(other); raw["tracks"]=tracks;
        const auto parsed=nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(requireValue(parsed.timeline));
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        if (toMaster) { c.setProperty("master",true); }
        else { c.setProperty("trackId","b"); }
        QVERIFY(c.gestureGeneration()!=gen);
        const auto before=model.documentJson();
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{},gen);
        c.setGesturePoints("lane",QJsonArray{QJsonObject{{"timeMs",0},{"value",2}}},gen);
        QCOMPARE(model.documentJson(),before);
    }
    void gestureSourceChangeA4() {
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        emit model.sourceChanged();
        const auto before=model.documentJson();
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{},gen);
        QCOMPARE(model.documentJson(),before);
    }
    void gestureDestructionA5() {
        auto source=std::make_unique<TimelineModel>(); source->setTimeline(model.timeline());
        AutomationController c; c.setTimeline(source.get()); c.trackId="a";
        const auto gen=c.gestureGeneration();
        QSignalSpy changed(&c,&AutomationController::changed);
        source.reset();
        QVERIFY(c.gestureGeneration()!=gen);
        QCOMPARE(changed.count(),1);
        QVERIFY(c.channel().isEmpty());
        c.setTimeline(nullptr);
        QCOMPARE(changed.count(),1);
    }
    void gestureTokenCompatibilityA6() {
        model.setTimeline(model.timeline());
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        c.createWithPoints({{"kind","mixer"},{"param","pan"}},QJsonArray{},model.documentGeneration());
        QCOMPARE(track()["automation"].toArray().size(),2);
        AutomationController peer; peer.setTimeline(&model); peer.trackId="a";
        const auto token=c.generation();
        QCOMPARE(token,model.documentGeneration());
        peer.setPoints("lane",QJsonArray{QJsonObject{{"timeMs",0},{"value",3}}},token);
        c.setPoints("lane",QJsonArray{QJsonObject{{"timeMs",0},{"value",4}}},token);
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray()[0].toObject()["value"].toDouble(),4.);
        QCOMPARE(c.generation(),peer.generation());
    }
    void gestureHistoryA8_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* operation:{"undo","redo","setIndex","silent-redo"}) { QTest::newRow(operation) << QString(operation); }
    }
    void gestureHistoryA8() {
        QFETCH(QString,operation);
        QVERIFY(model.applyEdit("setTrackPan",{{"trackId","a"},{"pan",.25}}));
        if (operation=="silent-redo") {
            auto command=std::make_unique<QUndoCommand>("Silent history step");
            model.undoStack()->push(command.release());
        }
        if (operation!="undo") { model.undoStack()->undo(); }
        AutomationController c; c.setTimeline(&model); c.trackId="a";
        const auto gen=c.gestureGeneration();
        if (operation=="undo") { model.undoStack()->undo(); }
        else if (operation=="redo" || operation=="silent-redo") { model.undoStack()->redo(); }
        else { model.undoStack()->setIndex(1); }
        const auto before=model.documentJson();
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{},gen);
        QCOMPARE(model.documentJson(),before);
        c.createWithGesturePoints({{"kind","mixer"},{"param","pan"}},QJsonArray{},c.gestureGeneration());
        QCOMPARE(track()["automation"].toArray().size(),2);
    }
    void pendingLaneCreationCancelledByUndo() {
        model.applyEdit("setTrackPan", {{"trackId","a"},{"pan",.25}});
        QVERIFY(open(R"(AutomationLaneView { width:800; height:100; required timeline
track: ({id:"a",type:"audio",volumeDb:-6})
lane: ({id:"virtual-pan",target:{kind:"mixer",param:"pan"},points:[]}) })"));
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,100,50));
        QCOMPARE(track()["automation"].toArray().size(),1);
        model.undoStack()->undo();
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval()+100);
        QCOMPARE(track()["automation"].toArray().size(),1);
        QCOMPARE(model.undoStack()->index(),0);
        QVERIFY(model.undoStack()->canRedo());
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,100,50));
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval()+100);
        QCOMPARE(track()["automation"].toArray().size(),2);
    }
    void pendingLaneCreationCancelledByRedoA8() {
        QVERIFY(model.applyEdit("setTrackPan",{{"trackId","a"},{"pan",.25}}));
        model.undoStack()->undo();
        QVERIFY(open(R"(AutomationLaneView { width:800; height:100; required timeline
track: ({id:"a",type:"audio",volumeDb:-6})
lane: ({id:"virtual-pan",target:{kind:"mixer",param:"pan"},points:[]}) })"));
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(lane,100,50));
        model.undoStack()->redo();
        const auto before=model.documentJson();
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval()+100);
        QCOMPARE(model.documentJson(),before);
        QCOMPARE(model.undoStack()->index(),1);
    }
    void masterCurvePreservedV8() {
        struct Curve final : nt::audio::ParameterSource {
            double valueAt(double t,double) const noexcept override { return t<100 ? .25 : .5; }
        };
        auto snapshot=*model.snapshot();
        nt::audio::MixPlan plan; plan.gainSource=std::make_shared<Curve>();
        nt::automation::refreshMixerAutomation(snapshot,plan);
        QCOMPARE(plan.gainSource->valueAt(0,1),.25);
        nt::automation::refreshMixerAutomation(snapshot,plan);
        QCOMPARE(plan.gainSource->valueAt(200,1),.5);
        snapshot.masterMixerOverride.reset(); nt::automation::refreshMixerAutomation(snapshot,plan);
        QCOMPARE(plan.gainSource->valueAt(0,1),.25);
    }
    void masterBaseReceivesBeginBlockN2() {
        // The plan owns the source. Only the rendering thread changes its block cache.
        struct Curve final : nt::audio::ParameterSource {
            mutable double cached=0;
            void beginBlock(const nt::audio::BlockContext& context,int,double) const noexcept override { cached=context.timelineMs; }
            double valueAt(double,double) const noexcept override { return cached; }
        };
        auto snapshot=*model.snapshot();
        nt::audio::MixPlan plan; plan.gainSource=std::make_shared<Curve>();
        nt::automation::refreshMixerAutomation(snapshot,plan);
        nt::audio::BlockContext context; context.timelineMs=25;
        plan.gainSource->beginBlock(context,128,1);
        QCOMPARE(plan.gainSource->valueAt(25,1),25.);
        context.timelineMs=50;
        plan.gainSource->beginBlock(context,128,1);
        QCOMPARE(plan.gainSource->valueAt(50,1),50.);
    }
    void masterTrackNamespaceV9() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject(); t["id"]="master"; tracks[0]=t; raw["tracks"]=tracks;
        auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline); model.setTimeline(*parsed.timeline);
        const auto snapshot=model.snapshot();
        QVERIFY2(snapshot->masterMixerOverride!=snapshot->tracks[0].mixerOverride,"V9: master and a track named master need distinct handoffs");
        AutomationController master; master.setTimeline(&model); master.master=true; master.previewMixer("volumeDb",-12);
        QVERIFY(std::isnan(snapshot->tracks[0].mixerOverride->volumeDb.load()));
    }
    void masterPayloadV10() {
        QJsonObject captured;
        const auto original=nt::app::edits().value("setMasterVolume");
        nt::app::edits()["setMasterVolume"]=[&captured,original](QJsonObject raw,const QJsonObject& payload) { captured=payload; return original(std::move(raw),payload); };
        const auto restore=qScopeGuard([original] { nt::app::edits()["setMasterVolume"]=original; });
        AutomationController controller; controller.setTimeline(&model); controller.master=true; controller.trackId="recycled";
        controller.commitMixer("volumeDb",-12);
        QCOMPARE(captured,QJsonObject({{"db",-12}}));
    }
    void masterPreviewSmoothF24() {
        AutomationController controller; controller.setTimeline(&model); controller.master=true;
        const auto plan=nt::audio::buildMixPlan(*model.snapshot());
        std::array<float,256> output{}; nt::audio::MixStats stats;
        constexpr double step=1000./48000;
        nt::audio::mixBlock(plan,nullptr,48000,0,step,128,output.data(),stats);
        controller.previewMixer("volumeDb",-12);
        nt::audio::mixBlock(plan,nullptr,48000,128*step,step,128,output.data(),stats);
        QVERIFY2(std::abs(plan.gainSource->valueAt(128*step,1)-1)<1e-8,
                 "F24: rendered master preview must begin a smooth gain transition");
        QVERIFY(std::abs(plan.gainSource->valueAt(128*step+10,1)-0.2511886432)<1e-8);
    }
    void masterPreviewF24() {
        AutomationController controller; controller.setTimeline(&model); controller.master=true;
        auto plan=nt::audio::buildMixPlan(*model.snapshot());
        controller.previewMixer("volumeDb",-12);
        QVERIFY2(model.mixerOverrideValue("master","volumeDb",true),"F24: master drag must publish a live override");
        QVERIFY(plan.gainSource);
        QVERIFY(std::abs(plan.gainSource->valueAt(0,plan.masterGain)-0.2511886432)<1e-8);
        controller.previewMixer("volumeDb",std::numeric_limits<double>::quiet_NaN());
        QCOMPARE(plan.gainSource->valueAt(0,plan.masterGain),1.);
        QVERIFY(open(R"(ChannelStrip { width:180; height:500; required timeline; master:true })"));
        QVERIFY(QMetaObject::invokeMethod(root.get(),"preview",Q_ARG(QVariant,QString("volumeDb")),Q_ARG(QVariant,-18.)));
        QCOMPARE(model.mixerOverrideValue("master","volumeDb",true).value_or(0),-18.);
        QVERIFY(QMetaObject::invokeMethod(root.get(),"commit",Q_ARG(QVariant,QString("volumeDb")),Q_ARG(QVariant,-18.)));
        QCOMPARE(model.timeline().masterVolumeDb,-18.);
        QVERIFY(std::abs(plan.gainSource->valueAt(0,plan.masterGain)-0.1258925412)<1e-8);
        const auto committed=nt::audio::buildMixPlan(*model.snapshot());
        QVERIFY(std::abs(committed.gainSource->valueAt(0,committed.masterGain)-0.1258925412)<1e-8);

    }
    void previewBecomesLatchF17_data() {
        QTest::addColumn<QString>("mode"); QTest::addColumn<bool>("volume");
        for (const auto& mode:{QString("touch"),QString("latch"),QString("write")}) {
            QTest::newRow(qPrintable(mode+"-pan")) << mode << false;
            QTest::newRow(qPrintable(mode+"-volume")) << mode << true;
        }
    }
    void previewBecomesLatchF17() {
        QFETCH(QString,mode); QFETCH(bool,volume);
        QVERIFY(model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode",mode}}));
        model.automationRecorder()->setClock(&clock);
        const auto handoff=model.snapshot()->findTrack("a")->mixerOverride;
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* control=item(volume ? "mixerFaderInput" : "pan-a"); QVERIFY(control); control->forceActiveFocus();
        const auto param=volume ? QString("volumeDb") : QString("pan");
        QTest::keyPress(window.get(),Qt::Key_Right);
        QVERIFY(model.mixerOverrideValue("a",param));
        clock.play();
        QTest::keyPress(window.get(),Qt::Key_Right);
        QTest::keyRelease(window.get(),Qt::Key_Right);
        if (mode=="touch") {
            nt::MixerReturn::Snapshot release;
            (volume ? handoff->volumeReturn : handoff->panReturn).read(release);
            QVERIFY(release.active(clock.currentTimeMs()));
        } else {
            QVERIFY2(model.mixerOverrideValue("a",param),"F17: latch/write must retain override after preview-to-record handoff");
        }
    }
    void changingStripTargetReleasesPreviewF19_data() {
        QTest::addColumn<bool>("changeTimeline");
        QTest::newRow("track") << false;
        QTest::newRow("timeline") << true;
    }
    void changingStripTargetReleasesPreviewF19() {
        QFETCH(bool,changeTimeline);
        TimelineModel other;
        other.setTimeline(model.timeline());
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* pan=item("pan-a"); QVERIFY(pan); pan->forceActiveFocus();
        QTest::keyPress(window.get(),Qt::Key_Right);
        QVERIFY(model.mixerOverrideValue("a","pan"));
        if (changeTimeline) { root->setProperty("timeline",QVariant::fromValue(&other)); }
        else { root->setProperty("trackId","v"); }
        QVERIFY2(!model.mixerOverrideValue("a","pan"),"F19: changing the strip target must release the old owner's preview");
        QTest::keyRelease(window.get(),Qt::Key_Right);
        root.reset();
    }
    void panKeyboardExitF20_data() {
        QTest::addColumn<QString>("property");
        QTest::newRow("disabled") << QString("enabled");
        QTest::newRow("hidden") << QString("visible");
    }
    void panKeyboardExitF20() {
        QFETCH(QString,property);
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* pan=item("pan-a"); QVERIFY(pan); pan->forceActiveFocus();
        QTest::keyPress(window.get(),Qt::Key_Right);
        QVERIFY(model.mixerOverrideValue("a","pan"));
        pan->setProperty(property.toLatin1().constData(),false);
        QVERIFY2(!model.mixerOverrideValue("a","pan"),"F20: hidden/disabled keyboard pan must release the override");
        QTest::keyRelease(window.get(),Qt::Key_Right);
    }
    void committedPreviewBridgesOldPlanF21() {
        auto raw=doc();
        raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"mediaType","audio"},{"status","generated"},{"mediaPath","memory.wav"},{"startMs",0},{"durationMs",9000}}};
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
        if (parsed.timeline) { model.setTimeline(*parsed.timeline); }
        else { QFAIL("Invalid mixer preview test fixture"); }
        const auto plan=nt::audio::buildMixPlan(*model.snapshot());
        QVERIFY(!plan.tracks.empty());
        QVERIFY(plan.tracks[0].panSource);
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* pan=item("pan-a"); QVERIFY(pan); pan->forceActiveFocus();
        QTest::keyPress(window.get(),Qt::Key_Right);
        QTest::keyRelease(window.get(),Qt::Key_Right);
        QCOMPARE(track()["pan"].toDouble(),.01);
        QCOMPARE(model.undoStack()->count(),1);
        QVERIFY(!model.mixerOverrideValue("a","pan"));
        QCOMPARE(plan.tracks[0].panSource->valueAt(1000,0),.01);
        const auto next=nt::audio::buildMixPlan(*model.snapshot());
        QCOMPARE(next.tracks[0].panSource->valueAt(1000,.01),.01);
    }
    void deletingLastSoundTrackClearsHandoffF22() {
        const auto before=model.snapshot();
        const auto state=before->findTrack("a")->mixerOverride;
        model.setMixerOverride("a","pan",.5);
        QVERIFY(model.applyEdit("removeTrack",{{"trackId","a"}}));
        const auto after=model.snapshot();
        QVERIFY(!after->findTrack("a"));
        QVERIFY2(std::isnan(state->pan.load()),"F22: deleting the last sound track must clear retained audio-plan overrides");
        QVERIFY(!model.mixerOverrideValue("a","pan"));
    }
    void previewInputBoundaryF23_data() {
        QTest::addColumn<QString>("param"); QTest::addColumn<double>("input");
        QTest::addColumn<bool>("readOnly"); QTest::addColumn<double>("expected");
        QTest::newRow("readonly") << QString("pan") << .5 << true << std::numeric_limits<double>::quiet_NaN();
        QTest::newRow("infinite") << QString("pan") << std::numeric_limits<double>::infinity() << false << std::numeric_limits<double>::quiet_NaN();
        QTest::newRow("pan-high") << QString("pan") << 4. << false << 1.;
        QTest::newRow("pan-low") << QString("pan") << -4. << false << -1.;
        QTest::newRow("volume-high") << QString("volumeDb") << 200. << false << 24.;
        QTest::newRow("volume-low") << QString("volumeDb") << -200. << false << -120.;
    }
    void previewInputBoundaryF23() {
        QFETCH(QString,param); QFETCH(double,input); QFETCH(bool,readOnly); QFETCH(double,expected);
        AutomationController controller; controller.setTimeline(&model); controller.trackId="a";
        model.setReadOnly(readOnly);
        const auto state=model.snapshot()->findTrack("a")->mixerOverride;
        controller.previewMixer(param,input);
        if (std::isnan(expected)) {
            QVERIFY2(std::isnan((param=="pan" ? state->pan : state->volumeDb).load()),"F23: rejected input must never reach the audio handoff");
        }
        const auto actual=model.mixerOverrideValue("a",param);
        if (std::isnan(expected)) { QVERIFY2(!actual,"F23: read-only and infinite previews must be rejected"); }
        else { QCOMPARE(actual.value_or(std::numeric_limits<double>::quiet_NaN()),expected); }
        controller.previewMixer(param,std::numeric_limits<double>::quiet_NaN());
        QVERIFY(!model.mixerOverrideValue("a",param));
        model.setReadOnly(false);
    }
    void overrideUsesPublishedHandoffF1() {
        const auto before=model.snapshot();
        const auto* t=before->findTrack("a"); QVERIFY(t); QVERIFY(t->mixerOverride);
        QSignalSpy rebuilds(&model,&TimelineSource::sourceChanged);
        model.setMixerOverride("a","volumeDb",-3);
        QCOMPARE(rebuilds.size(),0);
        QCOMPARE(t->mixerOverride->volumeDb.load(),-3.);
        model.setMixerOverride("a","volumeDb",std::nullopt);
        QCOMPARE(rebuilds.size(),0);
    }
    void touchReleaseKeepsOldPlanContinuousF1() {
        auto raw=doc(); raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"mediaType","audio"},{"status","generated"},{"mediaPath","memory.wav"},{"startMs",0},{"durationMs",9000}}};
        model.setTimeline(requireValue(nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline));
        const QJsonArray points{QJsonObject{{"timeMs",0},{"value",-30}},QJsonObject{{"timeMs",9000},{"value",-30}}};
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{QJsonObject{{"id","lane"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",points}}}}});
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        qint64 now=0; PlaybackClock transport; transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport); transport.play();
        recorder.gestureStart("a","volumeDb"); recorder.record("a","volumeDb",0);
        const auto plan=nt::audio::buildMixPlan(*model.snapshot());
        now=1000000000; transport.tick(); recorder.gestureEnd("a","volumeDb");
        QCOMPARE(plan.tracks.size(),std::size_t(1));
        QVERIFY(plan.tracks[0].gainSource);
        QCOMPARE(plan.tracks[0].gainSource->valueAt(1000,1),1.);
        QVERIFY(plan.tracks[0].gainSource->valueAt(1100,1)>.03);
        const auto changed=QJsonDocument::fromJson(R"([{"id":"lane","target":{"kind":"mixer","param":"volumeDb"},"points":[{"timeMs":0,"value":-9}]}])").array();
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",changed}});
        const auto latest=nt::audio::buildMixPlan(*model.snapshot());
        QVERIFY(std::abs(latest.tracks[0].gainSource->valueAt(1100,1)-.3548133892)<1e-6);
        transport.pause();
    }
    void mixerPassDoesNotRebuildInsertsF1() {
        auto raw=doc(); raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"mediaType","audio"},{"status","generated"},{"mediaPath","memory.wav"},{"startMs",0},{"durationMs",9000}}};
        model.setTimeline(requireValue(nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline));
        model.applyEdit("addTrackEffect",{{"trackId","a"},{"effect","filter"}});
        // The stage and this test share the counter until the scoped registration ends.
        auto constructions=std::make_shared<int>(0);
        const auto token=nt::audio::registerMixPlanStage("a12-construction-spy",[constructions](const nt::Timeline&,nt::audio::MixPlan&) { ++*constructions; },50);
        const auto cleanup=qScopeGuard([token] { nt::audio::unregisterMixPlanStage(token); });
        const auto initial=model.snapshot();
        nt::audio::AudioEngine audio; audio.setTimeline(initial);
        const auto before=*constructions;
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{QJsonObject{{"id","lane"},
            {"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",QJsonArray{QJsonObject{{"timeMs",0},{"value",-12}}}}}}}});
        const auto edited=model.snapshot();
        QVERIFY(initial->tracks[0].mixerOverride==edited->tracks[0].mixerOverride);
        QVERIFY(!edited->tracks[0].raw.contains("locked"));
        audio.setTimeline(edited);
        QCOMPARE(*constructions,before);
        auto replacement=model.timeline().clips.front(); replacement.mediaPath="replacement.wav";
        model.registerMedia(replacement); audio.setTimeline(model.snapshot());
        QCOMPARE(*constructions,before+1);
    }
    void writeUndoPerPassF4() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        PlaybackClock transport; transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        const int before=model.undoStack()->count();
        transport.play(); transport.pause();
        QCOMPARE(model.undoStack()->count(),before+2);
        model.undoStack()->undo(); model.undoStack()->undo();
        QCOMPARE(track()["automationMode"].toString(),"write");
        QCOMPARE(track()["automation"].toArray().size(),1);
    }
    void pictureAutomationInvalidatesF9() {
        PreviewCompositor monitor; monitor.setTimeline(&model);
        const int before=monitor.visualEditCount();
        const auto lanes=QJsonDocument::fromJson(R"([{"id":"opacity","target":{"kind":"clip","property":"opacity"},"points":[{"timeMs":0,"value":0.5}]}])").array();
        model.applyEdit("setTrackAutomation",{{"trackId","v"},{"automation",lanes}});
        QCOMPARE(monitor.visualEditCount(),before+1);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        QCOMPARE(monitor.visualEditCount(),before+1);
        model.applyEdit("setTrackAutomationMode",{{"trackId","v"},{"mode","off"}});
        QCOMPARE(monitor.visualEditCount(),before+2);
    }
    void deletedMeterDoesNotKeepReadingF15() {
        const auto peaks=nt::automation::publishMeter("removed");
        peaks->left.store(.75f); peaks->right.store(.5f);
        AutomationMeters meters;
        QCOMPARE(meters.take("removed"),(QVariantList{.75f,.5f}));
        nt::automation::beginMeterPlan();
        QCOMPARE(meters.take("removed"),(QVariantList{0.f,0.f}));
    }
    void recorderSurvivesTracksViewF15() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(openTracks());
        const QPointer<AutomationRecorder> recorder=qobject_cast<AutomationRecorder*>(model.property("automationRecorder").value<QObject*>());
        QVERIFY(recorder); clock.play();
        QVERIFY(recorder->gestureStart("a","volumeDb")); recorder->record("a","volumeDb",-12);
        window.reset(); root.reset(); engine.reset(); QCoreApplication::processEvents();
        QVERIFY(recorder); clock.pause();
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
    }
    void detachedMixerRecordsF15() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(open(R"(Item { width:400; height:400; required property TimelineModel timeline; required property PlaybackClock clock
 Component.onCompleted: { if (timeline.automationRecorder) { timeline.automationRecorder.clock=clock } }
 ChannelStrip { width:120; height:360; timeline:parent.timeline; trackId:"a" }
})",{{"clock",QVariant::fromValue(&clock)}}));
        auto* recorder=qobject_cast<AutomationRecorder*>(item("mixer-strip-a")->property("recorder").value<QObject*>());
        QVERIFY(recorder); QVERIFY(recorder->clock());
        recorder->clock()->setDurationMs(10000); recorder->clock()->play();
        QVERIFY(recorder->gestureStart("a","volumeDb"));
        QVERIFY(recorder->record("a","volumeDb",-12));
        recorder->gestureEnd("a","volumeDb"); recorder->clock()->pause();
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
    }
    void midiInstrumentTargetF10() {
        QVERIFY(open(R"(AutomationHeaderRow { width:400; required timeline; track: ({id:"m",type:"midi",instrument:{type:"bass",fableParams:{"flt.cut":450}}}) })"));
        const auto specs=root->property("specs").toList();
        bool found=false;
        for (const auto& v:specs) {
            const auto spec=v.toMap(), target=spec["target"].toMap();
            if (target["deviceId"]=="instrument" && target["param"]=="flt.cut") {
                found=true; QCOMPARE(spec["value"].toDouble(),450.);
            }
        }
        QVERIFY(found);
    }
    void instrumentReadoutF10() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["type"]="midi"; t["instrument"]=QJsonObject{{"type","bass"},{"fableParams",QJsonObject{{"flt.cut",450}}}};
        tracks[0]=t; raw["tracks"]=tracks; model.setTimeline(requireValue(nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline));
        AutomationReadout reading; reading.setTimeline(&model); reading.setTrackId("a");
        reading.setTarget({{"kind","device"},{"deviceId","instrument"},{"param","flt.cut"}});
        QCOMPARE(reading.value(),450.);
    }
    void instrumentPickerIsBoundedF10() {
        QVERIFY(open(R"(AutomationHeaderRow { width:400; required timeline; track: ({id:"drums",type:"midi",instrument:{type:"drum",pads:[]}}) })"));
        QVERIFY(root->property("specs").toList().size()>1000);
        click("automation-parameter-drums");
        int buttons=0;
        for (auto* child:root->findChildren<QQuickItem*>()) { if (child->inherits("QQuickAbstractButton")) { ++buttons; } }
        QVERIFY2(buttons<100,qPrintable(QString::number(buttons)));
    }
    void instrumentAddPickerExcludesMainF10F12() {
        QVERIFY(open(R"(AutomationAddLaneHeader { width:400; required timeline; track: ({id:"drums",type:"midi",instrument:{type:"drum",pads:[]}}) })"));
        const auto options=root->property("options").toList();
        QVERIFY(options.size()>1000);
        QVERIFY(std::none_of(options.begin(),options.end(),[](const auto& value) { return value.toMap()["key"]=="mixer:volumeDb"; }));
    }
    void trackHeaderRecordsF3() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(openTracks()); clock.setDurationMs(10000); clock.play();
        auto* slider=item("trackVolumeSlider-a"); QVERIFY(slider);
        QVERIFY(QMetaObject::invokeMethod(slider,"editStarted"));
        QVERIFY(QMetaObject::invokeMethod(slider,"valuePreviewed",Q_ARG(double,.5)));
        QVERIFY(QMetaObject::invokeMethod(slider,"valueCommitted",Q_ARG(double,.5)));
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
    }
    void pausedGestureStartsRecordingOnPlayF6() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(open(R"(Item { id:host; width:400; height:400; required property TimelineModel timeline; required property PlaybackClock clock
 property AutomationRecorder recorder: timeline.automationRecorder
 Binding { target:host.recorder; property:"clock"; value:host.clock; restoreMode:Binding.RestoreNone }
 Binding { target: AutomationUIState; property:"recorder"; value:host.recorder }
 ChannelStrip { width:120; height:360; timeline:parent.timeline; trackId:"a" }
})",{{"clock",QVariant::fromValue(&clock)}}));
        auto* fader=item("fader-a"); QVERIFY(fader);
        const auto at=point(fader,12,fader->height()*.6);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        clock.setDurationMs(10000); clock.play();
        QTest::mouseMove(window.get(),at+QPoint(0,-30),20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,at+QPoint(0,-30));
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
        QCOMPARE(track()["volumeDb"].toDouble(),-6.);
        QVERIFY(!item("mixer-strip-a")->property("volumeConsumed").toBool());
    }
    void recordingCancelF6() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QVERIFY(open(R"(Item { id:host; width:400; height:400; required property TimelineModel timeline; required property PlaybackClock clock
 property AutomationRecorder recorder: timeline.automationRecorder
 Binding { target:host.recorder; property:"clock"; value:host.clock; restoreMode:Binding.RestoreNone }
 Binding { target: AutomationUIState; property:"recorder"; value:host.recorder }
 ChannelStrip { width:120; height:360; timeline:parent.timeline; trackId:"a" }
})",{{"clock",QVariant::fromValue(&clock)}}));
        clock.setDurationMs(10000); clock.play();
        auto* fader=item("fader-a"); QVERIFY(fader);
        const auto at=point(fader,12,fader->height()*.6);
        const auto before=model.undoStack()->count();
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        QTest::mouseMove(window.get(),at+QPoint(0,-30),20);
        QTest::keyClick(window.get(),Qt::Key_Escape);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        QCOMPARE(model.undoStack()->count(),before);
        QVERIFY(!item("mixer-strip-a")->property("volumeConsumed").toBool());
    }
    void playheadScrubsAcrossAutomationF11() {
        clock.setDurationMs(10000); clock.seek(1000);
        QVERIFY(openTracks());
        auto* grab=item("playheadGrab"); auto* lane=item("automation-lane-lane");
        QVERIFY(grab); QVERIFY(lane);
        const QPoint from(point(grab,grab->width()/2,0).x(),point(lane,0,lane->height()/2).y());
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),from+QPoint(60,0),20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,from+QPoint(60,0));
        QVERIFY(clock.time()>1000);
        QVERIFY(track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
    }
    void documentUiStateResetF15() {
        QVERIFY(open(R"(Item { width:400; height:400; required property TimelineModel timeline
 Component.onCompleted: { AutomationUIState.timeline=timeline; AutomationUIState.shownParameters={a:"mixer:pan"}; AutomationUIState.shownAutomationTrackIds=["a"] }
 property var selectedParameters: AutomationUIState.shownParameters
 property var expandedTracks: AutomationUIState.shownAutomationTrackIds
})"));
        const auto replacement=nt::parseTimelineJson(model.documentJson()); QVERIFY(replacement.timeline);
        model.setTimeline(requireValue(replacement.timeline));
        QCoreApplication::processEvents();
        QVERIFY(root->property("selectedParameters").toMap().empty());
        QVERIFY(root->property("expandedTracks").toList().empty());
    }
    void undoModeDoesNotWritePassF7() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","write"}});
        PlaybackClock transport; transport.setDurationMs(10000);
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        transport.play(); model.undoStack()->undo();
        QCoreApplication::processEvents();
        QVERIFY(model.undoStack()->canRedo());
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),0);
        transport.pause();
    }
    void coincidentReadoutF8_data() {
        QTest::addColumn<QJsonArray>("points"); QTest::addColumn<double>("expected");
        const auto json=[](const char* value) { return QJsonDocument::fromJson(value).array(); };
        QTest::newRow("interior") << json(R"([{"timeMs":0,"value":-20},{"timeMs":1000,"value":-10},{"timeMs":1000,"value":0},{"timeMs":2000,"value":6}])") << -10.;
        QTest::newRow("first") << json(R"([{"timeMs":1000,"value":-10},{"timeMs":1000,"value":0},{"timeMs":2000,"value":6}])") << -10.;
        QTest::newRow("last") << json(R"([{"timeMs":0,"value":-20},{"timeMs":1000,"value":-10},{"timeMs":1000,"value":0}])") << 0.;
    }
    void coincidentReadoutF8() {
        QFETCH(QJsonArray,points); QFETCH(double,expected);
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{QJsonObject{{"id","lane"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",points}}}}});
        PlaybackClock transport; transport.setDurationMs(10000); transport.seek(1000);
        AutomationReadout reading; reading.setTimeline(&model); reading.setTrackId("a"); reading.setClock(&transport);
        reading.setTarget({{"kind","mixer"},{"param","volumeDb"}});
        QCOMPARE(reading.value(),expected);
        QCOMPARE(nt::automation::automationValueAt(points,1000),expected);
    }
    void effectDefaultAndPreviewF10() {
        model.applyEdit("addTrackEffect",{{"trackId","a"},{"effect",QJsonObject{{"id","f"},{"type","filter"}}}});
        auto raw=doc(); auto ts=raw["tracks"].toArray(); auto t=ts[0].toObject();
        t["effects"]=QJsonArray{QJsonObject{{"id","f"},{"type","filter"}}}; ts[0]=t; raw["tracks"]=ts;
        model.setTimeline(requireValue(nt::parseTimelineJson(QJsonDocument(raw).toJson()).timeline));
        AutomationReadout reading; reading.setTimeline(&model); reading.setTrackId("a");
        reading.setTarget({{"kind","device"},{"deviceId","f"},{"param","frequency"}});
        QCOMPARE(reading.value(),1000.);
        t["effects"]=QJsonArray{QJsonObject{{"id","f"},{"type","filter"},{"frequency",2345}}}; ts[0]=t;
        model.previewTrackEffects(ts);
        QCOMPARE(reading.value(),2345.);
    }
    void addExcludesShownF12() {
        QVERIFY(open(R"(AutomationAddLaneHeader { width:400; required timeline; track: ({id:"a",type:"audio",automation:[]}) })"));
        const auto options=root->property("options").toList();
        QCOMPARE(options.size(),1);
        QCOMPARE(options[0].toMap()["key"].toString(),"mixer:pan");
    }
    void labelAndViewportCanvasF13F16_data() {
        QTest::addColumn<double>("firstTime"); QTest::addColumn<double>("labelX");
        QTest::newRow("visible-first") << 2000. << 200.;
        QTest::newRow("first-after-viewport") << 20000. << 100.;
        QTest::newRow("first-before-viewport") << 0. << 100.;
    }
    void labelAndViewportCanvasF13F16() {
        QFETCH(double,firstTime); QFETCH(double,labelX);
        QVERIFY(open(R"(AutomationLaneView { width:300000; required timeline; viewportLeft:100; viewportWidth:600; property real firstTime:0
track: ({id:"a",type:"audio"}); lane: ({id:"virtual",target:{kind:"mixer",param:"volumeDb"},points:[{timeMs:firstTime,value:-6}]}); msPerPx:10 })",{{"firstTime",firstTime}}));
        QCOMPARE(item("automation-value-label")->x(),labelX);
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        lane->setProperty("dragging",true); lane->setProperty("selected",4);
        QVERIFY(std::isfinite(item("automation-value-label")->x()));
    }
    void boundedCanvasF16() {
        QVERIFY(open(R"(AutomationLaneView { width:300000; required timeline; viewportLeft:100; viewportWidth:600; track: ({id:"a",type:"audio"}); lane: ({id:"lane",target:{kind:"mixer",param:"volumeDb"},points:[]}) })"));
        auto* lane=qobject_cast<QQuickItem*>(root.get());
        QQuickItem* canvas=nullptr;
        for (auto* child:lane->childItems()) { if (child->inherits("QQuickCanvasItem")) { canvas=child; break; } }
        QVERIFY(canvas);
        QVERIFY(canvas->width()<=600);
        QCOMPARE(canvas->x(),100.);
    }
    void retargetPreservesRemovedCurveF14() {
        const auto lanes=QJsonDocument::fromJson(R"([{"id":"gone","target":{"kind":"device","deviceId":"gone","param":"q"},"points":[{"timeMs":0,"value":-0.5},{"timeMs":1000,"value":0.8,"easing":"hold"}]}])").array();
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",lanes}});
        QVERIFY(open(R"(AutomationHeaderRow { width:400; required timeline; main:false
track: ({id:"a",type:"audio"}); lane: ({id:"gone",target:{kind:"device",deviceId:"gone",param:"q"},points:[{timeMs:0,value:-.5},{timeMs:1000,value:.8,easing:"hold"}]}) })"));
        const QVariant next=QVariantMap{{"key","mixer:pan"},{"target",QVariantMap{{"kind","mixer"},{"param","pan"}}},{"min",-1},{"max",1}};
        QVERIFY(QMetaObject::invokeMethod(root.get(),"choose",Q_ARG(QVariant,next)));
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points[0].toObject()["value"].toDouble(),-.5);
        QVERIFY(!points[0].toObject().contains("easing"));
        QCOMPARE(points[1].toObject()["easing"].toString(),"hold");
    }
    void maxShuttleRelocationEndsPassF5() {
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        transport.setRate(8); transport.play();
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        AutomationRecorder recorder; recorder.setTimeline(&model); recorder.setClock(&transport);
        QVERIFY(recorder.gestureStart("a","volumeDb")); QVERIFY(recorder.record("a","volumeDb",-12));
        QSignalSpy seeks(&transport,&PlaybackClock::aboutToSeek);
        now=1250000000; transport.shuttle(1);
        QCOMPARE(transport.rate(),8.); QCOMPARE(transport.time(),0.);
        QCOMPARE(seeks.size(),1); QCOMPARE(seeks[0][0].toDouble(),10000.);
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QVERIFY(std::any_of(points.begin(),points.end(),[](const auto& point) { return point.toObject()["timeMs"].toDouble()==10000. && point.toObject()["value"].toDouble()==-12.; }));
        transport.pause();
    }
    void emptyVirtualDoubleClickF17() {
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{}}});
        QVERIFY(openTracks());
        auto* curve=item("automation-lane-shown:mixer:volumeDb"); QVERIFY(curve);
        const auto before=model.undoStack()->count();
        const auto at=point(curve,180,curve->height()*.75);
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        QTest::mouseDClick(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,at);
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval()+50);
        QVERIFY(track()["automation"].toArray().empty());
        QCOMPARE(model.undoStack()->count(),before);
    }
    void virtualLaneSingleGestureF17_data() {
        QTest::addColumn<bool>("drag");
        QTest::newRow("click") << false; QTest::newRow("drag") << true;
    }
    void virtualLaneSingleGestureF17() {
        QFETCH(bool,drag);
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{}}});
        QVERIFY(openTracks());
        auto* curve=item("automation-lane-shown:mixer:volumeDb"); QVERIFY(curve);
        const auto before=model.undoStack()->count();
        const auto at=point(curve,180,curve->height()*.75);
        if (drag) {
            QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,at);
            QTest::mouseMove(window.get(),at+QPoint(30,0),20);
            QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,at+QPoint(30,0));
            QCOMPARE(model.undoStack()->count(),before+1);
        } else { QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,at); }
        QTRY_COMPARE(model.undoStack()->count(),before+1);
        QCOMPARE(track()["automation"].toArray().size(),1);
        QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),2);
        model.undoStack()->undo(); QVERIFY(track()["automation"].toArray().empty());
        model.undoStack()->redo(); QCOMPARE(track()["automation"].toArray().size(),1);
    }
    void minimumClipWidthOwnsPointerF17() {
        auto raw=doc(); raw["clips"]=QJsonArray{QJsonObject{{"id","tiny"},{"trackId","a"},{"name","Tiny"},{"mediaType","audio"},{"status","generated"},{"startMs",1000},{"durationMs",1}}};
        model.setTimeline(requireValue(nt::parseTimeline(raw).timeline)); QVERIFY(openTracks());
        auto* curve=item("automation-lane-lane"); auto* clip=item("clip-tiny"); QVERIFY(curve); QVERIFY(clip);
        const auto at=clip->mapToItem(curve,{clip->width()-1,8});
        QTest::mouseClick(window.get(),Qt::LeftButton,Qt::NoModifier,point(curve,at.x(),at.y()));
        QTest::qWait(QGuiApplication::styleHints()->mouseDoubleClickInterval()+50);
        QVERIFY(track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
    }
    void relocatedTransportNotifiesF5_data() {
        QTest::addColumn<QString>("operation");
        for (const auto* operation:{"loop","rate","shuttle","span","in-out"}) { QTest::newRow(operation)<<QString(operation); }
    }
    void relocatedTransportNotifiesF5() {
        QFETCH(QString,operation);
        qint64 now=0; PlaybackClock transport; transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        if(operation=="loop") { transport.setRangeIn(1000); transport.setRangeOut(2000); }
        transport.play(); QSignalSpy seeks(&transport,&PlaybackClock::aboutToSeek);
        if(operation=="loop") { now=2500000000; transport.setLoop(true); }
        else if(operation=="rate") { transport.setRate(-1); }
        else if(operation=="shuttle") { transport.shuttle(-1); }
        else if(operation=="span") { now=100000000; transport.playSpan(0,2000,-1,false); }
        else { now=100000000; transport.playInToOut(); }
        QCOMPARE(seeks.size(),1);
        QCOMPARE(seeks[0][0].toDouble(),operation=="loop" ? 2500. : (operation=="span" || operation=="in-out") ? 100. : 0.);
        transport.pause();
    }
    void seekCachedTimeAndLoopBoundaryF5() {
        qint64 now=0; PlaybackClock transport;
        transport.setNowSource([&now] { return now; }); transport.setDurationMs(10000);
        QSignalSpy seeks(&transport,&PlaybackClock::aboutToSeek);
        transport.play(); now=100000000;
        transport.seek(0); QCOMPARE(seeks.size(),1); QCOMPARE(seeks[0][0].toDouble(),100.);
        transport.pause(); seeks.clear(); now=0;
        transport.playSpan(1000,2000,-1,true); now=1000000000; transport.tick();
        QCOMPARE(seeks.size(),1); QCOMPARE(seeks[0][0].toDouble(),2000.);
        transport.pause();
    }
    void modeUndoSaveAndPassLifecycle() {
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","touch"}});
        QCOMPARE(track()["automationMode"].toString(),"touch");
        auto saved=nt::parseTimelineJson(model.documentJson()); QVERIFY(saved.timeline);
        QCOMPARE(requireValue(saved.timeline).findTrack("a")->raw["automationMode"].toString(),"touch");
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
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
        model.undoStack()->undo(); QCOMPARE(track()["automation"].toArray()[0].toObject()["points"].toArray().size(),0);
        model.undoStack()->redo();
        QVERIFY(recorder.gestureStart("a","volumeDb"));
        const auto state=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(state);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode","off"}});
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->volumeDb.load()));
        QCOMPARE(track()["automationMode"].toString(),"off");
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
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
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
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
        QCOMPARE(points.last().toObject()["timeMs"].toDouble(),2200.);
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
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
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
 property AutomationRecorder recorder: timeline.automationRecorder
 Binding { target:host.recorder; property:"clock"; value:host.clock; restoreMode:Binding.RestoreNone }
 Binding { target: AutomationUIState; property:"recorder"; value:host.recorder }
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
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
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
        tracks[0]=t; raw["tracks"]=tracks; model.setTimeline(requireValue(nt::parseTimeline(raw).timeline));
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
        const auto parsed=nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(requireValue(parsed.timeline));
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
        // The upper half of a dot sits above the clip name bar, so the point stays reachable.
        const auto dot=point(curve,x,3), moved=point(curve,x+30,3);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,dot);
        QTest::mouseMove(window.get(),moved,20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,moved);
        points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QVERIFY(std::abs(points[0].toObject()["timeMs"].toDouble()-(x+30)*msPerPx)<=msPerPx);
        QCOMPARE(model.timeline().findClip("c")->startMs,before);
    }
    void clipNameBarOwnsPointUnderItAU3() {
        auto raw=doc();
        auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["automation"]=QJsonArray{QJsonObject{{"id","lane"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},
            {"points",QJsonArray{QJsonObject{{"timeMs",2000},{"value",6}}}}}};
        tracks[0]=t; raw["tracks"]=tracks;
        raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"name","Vox"},{"mediaType","audio"},{"status","generated"},{"startMs",1000},{"durationMs",2000}}};
        model.setTimeline(requireValue(nt::parseTimeline(raw).timeline));
        QVERIFY(openTracks(false));
        QTRY_VERIFY(item("automation-lane-lane"));
        auto* curve=item("automation-lane-lane");
        const double msPerPx=curve->property("msPerPx").toDouble();
        QVariant top; QVERIFY(QMetaObject::invokeMethod(curve,"yOf",Q_RETURN_ARG(QVariant,top),Q_ARG(QVariant,QVariant(6.))));
        const double x=2000/msPerPx, y=top.toDouble()+3;
        QVariant owned; QVERIFY(QMetaObject::invokeMethod(curve,"clipOwnsPointer",Q_RETURN_ARG(QVariant,owned),Q_ARG(QVariant,x),Q_ARG(QVariant,y)));
        QVERIFY(owned.toBool());
        QVariant hit; QVERIFY(QMetaObject::invokeMethod(curve,"hitIndex",Q_RETURN_ARG(QVariant,hit),Q_ARG(QVariant,x),Q_ARG(QVariant,y)));
        QCOMPARE(hit.toInt(),0);
        const auto before=model.timeline().findClip("c")->startMs;
        const auto press=point(curve,x,y), moved=point(curve,x+40,y);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,press);
        QTest::mouseMove(window.get(),point(curve,x+10,y),20);
        QTest::mouseMove(window.get(),moved,20);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,moved);
        const auto points=track()["automation"].toArray()[0].toObject()["points"].toArray();
        QCOMPARE(points.size(),1);
        QCOMPARE(points[0].toObject()["timeMs"].toDouble(),2000.);
        QVERIFY(!curve->property("dragging").toBool());
        QVERIFY(model.timeline().findClip("c")->startMs>before);
    }
    void laneTintCoversWholeLaneAU3_data() {
        QTest::addColumn<bool>("mainLane");
        QTest::newRow("main") << true; QTest::newRow("sub") << false;
    }
    void laneTintCoversWholeLaneAU3() {
        QFETCH(bool,mainLane);
        QVERIFY(open(QString(R"(AutomationLaneView { width:400; height:100; required timeline; mainLane:%1
track: ({id:"a",type:"audio",volumeDb:-6})
lane: ({id:"virtual-volume",target:{kind:"mixer",param:"volumeDb"},points:[{timeMs:0,value:-6}]}) })").arg(mainLane ? "true" : "false").toUtf8()));
        auto* tint=item("automation-lane-tint"); QVERIFY(tint);
        const auto tintColour=tint->property("color").value<QColor>();
        QCOMPARE(tintColour.rgb(),root->property("parameterColor").value<QColor>().rgb());
        QVERIFY(qAbs(tintColour.alphaF()-.12)<.01);
        QVariant y; QVERIFY(QMetaObject::invokeMethod(root.get(),"yOf",Q_RETURN_ARG(QVariant,y),Q_ARG(QVariant,QVariant(-6.))));
        QVERIFY(y.toDouble()>20 && y.toDouble()<80);
        QTest::qWait(50);
        const auto frame=window->grabWindow(); QVERIFY(!frame.isNull());
        const double ratio=frame.devicePixelRatio();
        const auto at=[&](double px,double py) { return frame.pixelColor(qRound(px*ratio),qRound(py*ratio)); };
        // The tint is uniform above and below the curve, never only under it.
        QVERIFY(at(200,y.toDouble()-12)!=window->color());
        QCOMPARE(at(200,y.toDouble()-12),at(200,y.toDouble()+12));
    }
    void modeSelectFillsWithModeColourAU2_data() {
        QTest::addColumn<QString>("mode");
        QTest::newRow("read") << "read"; QTest::newRow("touch") << "touch"; QTest::newRow("latch") << "latch"; QTest::newRow("write") << "write"; QTest::newRow("off") << "off";
    }
    void modeSelectFillsWithModeColourAU2() {
        QFETCH(QString,mode);
        model.applyEdit("setTrackAutomationMode",{{"trackId","a"},{"mode",mode}});
        QVERIFY(open(R"(AutomationHeaderRow { id:host; width:400; height:32; required timeline
 AutomationController { id:source; timeline:host.timeline; trackId:"a" }
 track:source.channel })"));
        auto* fill=item("automation-mode-fill-a"); QVERIFY(fill); QVERIFY(fill->isVisible());
        const auto colour=fill->property("color").value<QColor>();
        const auto modeColour=root->property("modeColor").value<QColor>();
        QCOMPARE(colour==modeColour,mode!="off");
    }
    void parameterDotShowsLaneDataAU2() {
        QVERIFY(open(R"(AutomationHeaderRow { id:host; width:400; height:32; required timeline
 AutomationController { id:source; timeline:host.timeline; trackId:"a" }
 track:source.channel
 Component.onCompleted:AutomationUIState.setShown("a","mixer:volumeDb") })"));
        auto* dot=item("automation-data-dot-a"); QVERIFY(dot);
        QVERIFY(!dot->isVisible());
        model.applyEdit("setTrackAutomation",{{"trackId","a"},{"automation",QJsonArray{QJsonObject{{"id","lane"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",QJsonArray{QJsonObject{{"timeMs",0},{"value",-6}}}}}}}});
        QTRY_VERIFY(dot->isVisible());
    }
    void showAutomationUsesCurveIconAU1() {
        QVERIFY(openTracks(false));
        QTRY_VERIFY(item("show-automation"));
        QCOMPARE(item("show-automation")->property("iconName").toString(),QString("automationCurve"));
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
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
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
 property AutomationRecorder recorder: timeline.automationRecorder
 Binding { target:host.recorder; property:"clock"; value:host.clock; restoreMode:Binding.RestoreNone }
 Binding { target:AutomationUIState; property:"recorder"; value:host.recorder }
 Loader { width:120; height:360; active:parent.showStrip; sourceComponent:ChannelStrip { timeline:host.timeline; trackId:"a" } }
})",{{"clock",QVariant::fromValue(&clock)}}));
        clock.setDurationMs(10000); clock.play();
        auto* fader=item("fader-a"); QVERIFY(fader);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,point(fader,12,fader->height()*.4));
        QTest::mouseMove(window.get(),point(fader,12,fader->height()*.7),20);
        const auto state=model.snapshot()->findTrack("a")->mixerOverride; QVERIFY(state);
        root->setProperty("showStrip",false);
        QCoreApplication::processEvents();
        QVERIFY(std::isnan(state->volumeDb.load()));
        QVERIFY((!model.mixerOverrideValue("a","volumeDb") && !model.mixerOverrideValue("a","pan")));
        QVERIFY(!track()["automation"].toArray()[0].toObject()["points"].toArray().empty());
        clock.pause();
    }
    void parameterDotsIgnoreEmptyLanesAndRemovedTargetFallsBack() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["effects"]=QJsonArray{QJsonObject{{"id","gain"},{"type","gain"},{"gainDb",0}}};
        auto lanes=t["automation"].toArray();
        lanes.append(QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},{"points",QJsonArray{}}});
        lanes.append(QJsonObject{{"id","gain-lane"},{"target",QJsonObject{{"kind","device"},{"deviceId","gain"},{"param","gainDb"}}},{"points",QJsonArray{QJsonObject{{"timeMs",0},{"value",0}}}}});
        t["automation"]=lanes; tracks[0]=t; raw["tracks"]=tracks; model.setTimeline(requireValue(nt::parseTimeline(raw).timeline));
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
        const auto parsed=nt::parseTimeline(raw); QVERIFY(parsed.timeline); model.setTimeline(requireValue(parsed.timeline));
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
    // A review screenshot of two shown lanes with points, written when NT_PANEL_SCREENSHOTS is set.
    void automationReviewScreenshot() {
        auto raw=doc(); auto tracks=raw["tracks"].toArray(); auto first=tracks[0].toObject();
        first["automation"]=QJsonArray{
            QJsonObject{{"id","lane"},{"target",QJsonObject{{"kind","mixer"},{"param","volumeDb"}}},{"points",QJsonArray{
                QJsonObject{{"timeMs",500},{"value",-12}},QJsonObject{{"timeMs",2500},{"value",0}},QJsonObject{{"timeMs",4000},{"value",-6}},QJsonObject{{"timeMs",6500},{"value",-24}}}}},
            QJsonObject{{"id","pan"},{"target",QJsonObject{{"kind","mixer"},{"param","pan"}}},{"points",QJsonArray{
                QJsonObject{{"timeMs",1000},{"value",-0.5}},QJsonObject{{"timeMs",5000},{"value",0.6}}}}}};
        tracks[0]=first; raw["tracks"]=tracks;
        // Real generated media, so the region shows a waveform: a voice-like swell.
        QTemporaryDir media; QVERIFY(media.isValid());
        const auto wav=media.filePath("vox.wav");
        std::vector<float> pcm(size_t(7*48000*2));
        for (size_t frame=0; frame<pcm.size()/2; ++frame) {
            const double t=double(frame)/48000;
            const double level=0.15+0.65*std::abs(std::sin(M_PI*t/1.3))*(0.6+0.4*std::sin(2*M_PI*t*3.1));
            pcm[frame*2]=pcm[frame*2+1]=float(level*std::sin(2*M_PI*220*t));
        }
        QVERIFY(nt::assets::writeStereoFloatWav(wav,pcm));
        raw["clips"]=QJsonArray{QJsonObject{{"id","c"},{"trackId","a"},{"name","Vox"},{"mediaType","audio"},{"status","generated"},{"mediaPath",wav},{"startMs",0},{"durationMs",7000}}};
        const auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson());
        QVERIFY(parsed.timeline); model.setTimeline(requireValue(parsed.timeline));
        QVERIFY(openTracks(true));
        QTRY_VERIFY(item("automation-lane-pan"));
        window->resize(1100,420); qobject_cast<QQuickItem*>(root.get())->setSize({1100,420});
        const auto folder=qEnvironmentVariable("NT_PANEL_SCREENSHOTS");
        if (folder.isEmpty()) { return; }
        QVERIFY(QDir().mkpath(folder));
        QTest::qWait(800);
        QImage image;
        QTRY_VERIFY_WITH_TIMEOUT(([&] { window->requestUpdate(); image=window->grabWindow(); return !image.isNull(); })(),2000);
        QVERIFY(image.save(QDir(folder).filePath("automation-lanes.png")));
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
    void faderAndPanPreviewLiveWhileDragging() {
        QVERIFY(open(R"(ChannelStrip { width:120; height:360; required timeline; trackId:"a" })"));
        auto* fader=item("fader-a"); QVERIFY(fader);
        const auto from=point(fader,12,fader->height()*.6),to=point(fader,12,10+(fader->height()-20)*.14);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,from);
        QTest::mouseMove(window.get(),to,20);
        const auto live=model.mixerOverrideValue("a","volumeDb");
        QVERIFY(live); QVERIFY(std::abs(*live)<=.3);
        QCOMPARE(model.undoStack()->count(),0);
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,to);
        QVERIFY(!model.mixerOverrideValue("a","volumeDb"));
        QCOMPARE(model.undoStack()->count(),1);
        auto* pan=item("pan-a"); QVERIFY(pan);
        const auto center=point(pan,pan->width()/2,pan->height()/2);
        QTest::mousePress(window.get(),Qt::LeftButton,Qt::NoModifier,center);
        QTest::mouseMove(window.get(),center+QPoint(12,-12),20);
        const auto livePan=model.mixerOverrideValue("a","pan");
        QVERIFY(livePan); QVERIFY(*livePan!=0.);
        QTest::keyClick(window.get(),Qt::Key_Escape);
        QVERIFY(!model.mixerOverrideValue("a","pan"));
        QTest::mouseRelease(window.get(),Qt::LeftButton,Qt::NoModifier,center+QPoint(12,-12));
        QCOMPARE(model.undoStack()->count(),1);
        QCOMPARE(track()["pan"].toDouble(),0.);
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
        QTRY_VERIFY(!item("automation-option-mixer:pan"));
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
