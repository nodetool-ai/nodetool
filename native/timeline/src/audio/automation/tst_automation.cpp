#include "../../../tests/RequireValue.h"
#include "audio/automation/Automation.h"
#include "audio/automation/Meters.h"
#include "audio/Mixer.h"
#include "model/TimelineJson.h"
#include "nodetool/kernels.h"
#include "preview/SceneEval.h"
#include <QCoreApplication>
#include <QFile>
#include <QJsonDocument>
#include <QScopeGuard>
#include <QtTest>
#include <array>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <vector>
#include <utility>
#include <thread>
using namespace nt::automation;
namespace {
QJsonObject document() {
    return QJsonDocument::fromJson(R"({"fps":30,"durationMs":1000,"tracks":[{"id":"a","type":"audio","index":0,"custom":12}],"clips":[{"id":"c","trackId":"a","mediaType":"audio","status":"generated","mediaPath":"memory.wav","startMs":0,"durationMs":1000}]})").object();
}
QJsonObject lane(QString kind, QString param, QJsonArray points) {
    return {{"id","lane"},{"target",QJsonObject{{"kind",kind},{"param",param}}},{"points",points}};
}
}
class TestAutomation : public QObject {
    Q_OBJECT
private slots:
    void completedBetweenBlocksGlidesF18() {
        auto parsed=nt::parseTimelineJson(QJsonDocument(document()).toJson()); QVERIFY(parsed.timeline);
        const auto state=std::make_shared<nt::MixerOverride>();
        auto& track=requireValue(parsed.timeline).tracks[0]; track.mixerOverride=state;
        track.raw["automation"]=QJsonArray{lane("mixer","pan",{QJsonObject{{"timeMs",0},{"value",-1}}})};
        const auto plan=nt::audio::buildMixPlan(requireValue(parsed.timeline));
        nt::audio::prepareMixPlan(plan,48000);
        const auto& pan=plan.tracks[0].panSource; QVERIFY(pan);
        pan->beginBlock({.sampleRate=48000,.timelineMs=0,.msPerFrame=1000./48000},480,-1);
        QCOMPARE(pan->valueAt(10,-1),-1.);
        state->pan.store(0);
        nt::MixerReturn::Snapshot release; release.startMs=10; release.values.fill(0);
        state->panReturn.publish(release); state->pan.store(std::numeric_limits<double>::quiet_NaN());
        pan->beginBlock({.sampleRate=48000,.timelineMs=10,.msPerFrame=1000./48000},480,-1);
        QCOMPARE(pan->valueAt(10,-1),-1.);
        QVERIFY(std::abs(pan->valueAt(15,-1)+.5)<1e-9);
        QCOMPARE(pan->valueAt(20,-1),0.);
    }
    void publishingCurveKeepsReturnGlideF1() {
        auto parsed=nt::parseTimelineJson(QJsonDocument(document()).toJson()); QVERIFY(parsed.timeline);
        // The model/control side and both published plans retain the same atomic input.
        const auto state=std::make_shared<nt::MixerOverride>();
        auto& track=requireValue(parsed.timeline).tracks[0]; track.mixerOverride=state;
        track.raw["automation"]=QJsonArray{lane("mixer","volumeDb",{QJsonObject{{"timeMs",0},{"value",-30}}})};
        const auto old=nt::audio::buildMixPlan(requireValue(parsed.timeline));
        std::vector<float> input(96000,.25f),output(960);
        nt::audio::VoicePcm pcm{.linear=input.data(),.linearCount=48000}; nt::audio::MixStats stats;
        nt::audio::mixBlock(old,&pcm,48000,0,1000./48000,480,output.data(),stats);
        state->volumeDb.store(0);
        nt::audio::mixBlock(old,&pcm,48000,10,1000./48000,480,output.data(),stats);
        nt::MixerReturn::Snapshot release; release.startMs=19;
        for (std::size_t i=0;i<release.values.size();++i) { release.values[i]=std::pow(10.,-30.*static_cast<double>(i)/20./20.); }
        state->volumeReturn.publish(release); state->volumeDb.store(std::numeric_limits<double>::quiet_NaN());
        nt::audio::mixBlock(old,&pcm,48000,20,1000./48000,128,output.data(),stats);
        const float previous=output[254];
        track.raw["automation"]=QJsonArray{lane("mixer","volumeDb",{QJsonObject{{"timeMs",0},{"value",-30}},
            QJsonObject{{"timeMs",19},{"value",0}},QJsonObject{{"timeMs",219},{"value",-30}}})};
        auto current=old; nt::automation::refreshMixerAutomation(requireValue(parsed.timeline),current);
        nt::audio::mixBlock(current,&pcm,48000,20+128*1000./48000,1000./48000,128,output.data(),stats);
        QVERIFY2(std::abs(output[0]-previous)<.001f,"Publishing the written curve must retain an in-progress control glide");
    }
    void oneRendererOwnsSharedDspF1() {
        // Shared by the test and the processor on two render threads, synchronized only through atomics.
        struct Handoff { std::atomic<bool> began{false},release{false},overlap{false},firstCorrect{false}; std::atomic<int> entered{0}; };
        // Thread-safe probe. The first render pauses so the other render's ownership is observable.
        class Probe final : public nt::audio::BlockProcessor {
            // The test and the plan's processor must retain the same synchronization handoff.
            std::shared_ptr<Handoff> state_;
        public:
            explicit Probe(std::shared_ptr<Handoff> state) : state_(std::move(state)) {}
            void process(std::span<float> samples,const nt::audio::BlockContext&) noexcept override {
                if (state_->entered.fetch_add(1)==0) {
                    state_->began.store(true,std::memory_order_release);
                    while (!state_->release.load(std::memory_order_acquire)) { std::this_thread::yield(); }
                } else { state_->overlap.store(true); }
                std::fill(samples.begin(),samples.end(),.5f);
            }
        };
        const auto state=std::make_shared<Handoff>();
        const auto token=nt::audio::registerMixPlanStage("a12-render-ownership",[state](const nt::Timeline&,nt::audio::MixPlan& plan) {
            plan.processors.push_back(std::make_shared<Probe>(state));
        },1000);
        const auto cleanup=qScopeGuard([token] { nt::audio::unregisterMixPlanStage(token); });
        auto parsed=nt::parseTimelineJson(QJsonDocument(document()).toJson()); QVERIFY(parsed.timeline); requireValue(parsed.timeline).clips.clear();
        // Main and worker retain the plan while its prepared state is handed between renderers.
        const auto plan=std::make_shared<nt::audio::MixPlan>(nt::audio::buildMixPlan(requireValue(parsed.timeline)));
        std::jthread first([weakPlan=std::weak_ptr<const nt::audio::MixPlan>(plan),weakState=std::weak_ptr<Handoff>(state)] {
            const auto held=weakPlan.lock(); const auto sync=weakState.lock(); if (!held || !sync) { return; }
            std::array<float,256> out{}; nt::audio::MixStats stats;
            nt::audio::mixBlock(*held,nullptr,48000,0,1000./48000,128,out.data(),stats);
            sync->firstCorrect.store(std::all_of(out.begin(),out.end(),[](float value) { return value==.5f; }));
        });
        while (!state->began.load(std::memory_order_acquire)) { std::this_thread::yield(); }
        std::array<float,256> other{}; nt::audio::MixStats stats;
        nt::audio::mixBlock(*plan,nullptr,48000,0,1000./48000,128,other.data(),stats);
        state->release.store(true,std::memory_order_release); first.join();
        QVERIFY(state->firstCorrect.load()); QVERIFY(!state->overlap.load());
        QVERIFY(std::all_of(other.begin(),other.end(),[](float value) { return value==0; }));
    }
    void returnHandoffIsCoherentF1() {
        // The test writer and reader share lifetime; their payload and completion handoffs are atomic.
        struct Handoff {
            nt::MixerReturn value;
            std::atomic<bool> started{false},done{false};
            std::atomic<int> errors{0},reads{0};
        };
        const auto state=std::make_shared<Handoff>();
        std::jthread reader([weak=std::weak_ptr<Handoff>(state)] {
            const auto held=weak.lock(); if (!held) { return; }
            held->started.store(true,std::memory_order_release);
            nt::MixerReturn::Snapshot copy;
            do {
                held->value.read(copy);
                if (std::isfinite(copy.startMs)) {
                    for (const auto value:copy.values) { if (value!=copy.startMs) { held->errors.fetch_add(1); } }
                    held->reads.fetch_add(1);
                }
            } while (!held->done.load(std::memory_order_acquire));
            held->value.read(copy);
            for (const auto value:copy.values) { if (value!=copy.startMs) { held->errors.fetch_add(1); } }
            held->reads.fetch_add(1);
        });
        while (!state->started.load(std::memory_order_acquire)) { std::this_thread::yield(); }
        for (int i=1;i<=20000;++i) {
            nt::MixerReturn::Snapshot next; next.startMs=i; next.values.fill(i);
            state->value.publish(next);
        }
        state->done.store(true,std::memory_order_release); reader.join();
        QVERIFY(state->reads.load()>0); QCOMPARE(state->errors.load(),0);
    }
    void livePanGlidesF2_data() {
        QTest::addColumn<double>("step");
        QTest::newRow("normal") << 1000./48000;
        QTest::newRow("shuttle") << 2000./48000;
        QTest::newRow("reverse") << -1000./48000;
    }
    void livePanGlidesF2() {
        QFETCH(double,step);
        auto parsed=nt::parseTimelineJson(QJsonDocument(document()).toJson()); QVERIFY(parsed.timeline);
        auto state=std::make_shared<nt::MixerOverride>();
        requireValue(parsed.timeline).tracks[0].mixerOverride=state;
        const auto plan=nt::audio::buildMixPlan(requireValue(parsed.timeline));
        nt::audio::prepareMixPlan(plan,48000);
        std::vector<float> input(std::size_t{48000}*2,.25f), output(std::size_t{256}*2);
        nt::audio::VoicePcm pcm{.linear=input.data(),.linearCount=48000};
        nt::audio::MixStats stats;
        nt::audio::mixBlock(plan,&pcm,48000,20,step,128,output.data(),stats);
        const float previous=output[254];
        state->pan.store(1);
        nt::audio::mixBlock(plan,&pcm,48000,20+128*step,step,128,output.data(),stats);
        QVERIFY2(std::abs(output[0]-previous)<.01f,"Live pan must glide from the preceding sample");
        QVERIFY(output[254]>.22f && output[254]<.24f);
    }
    void modeAndPassVectors() {
        auto json = [](const char* text) { return QJsonDocument::fromJson(text).array(); };
        QCOMPARE(call("automationModeOf", {QJsonObject{}}).toString(), "read");
        QCOMPARE(call("automationModePlays", {"off"}).toBool(true), false);
        for (const auto* mode : {"read","touch","latch","write"}) { QVERIFY(call("automationModePlays", {mode}).toBool()); }
        QJsonArray large;
        for (int i=0;i<20000;++i) { large.append(QJsonObject{{"timeMs",i},{"value",i*.01}}); }
        const auto thin=call("thinAutomationSamples",{large,.001}).toArray();
        QCOMPARE(thin.size(),2); QCOMPARE(thin.first(),large.first()); QCOMPARE(thin.last(),large.last());
        const auto samples = json(R"([{"timeMs":0,"value":0},{"timeMs":100,"value":1},{"timeMs":200,"value":2},{"timeMs":300,"value":3},{"timeMs":400,"value":0}])");
        QCOMPARE(call("thinAutomationSamples", {samples,.01}).toArray(), QJsonArray({samples[0],samples[3],samples[4]}));
        const auto flat = json(R"([{"timeMs":0,"value":5},{"timeMs":100,"value":5}])");
        QCOMPARE(call("thinAutomationSamples", {flat,.01}).toArray(), flat);
        const auto take = json(R"([{"timeMs":1000,"value":0},{"timeMs":1500,"value":-6},{"timeMs":2000,"value":-6}])");
        QCOMPARE(call("writeAutomationPass", {QJsonArray{},QJsonObject{{"startMs",1000},{"endMs",2000},{"samples",take}},0,200,.01}).toArray(),
                 json(R"([{"timeMs":1000,"value":0},{"timeMs":1500,"value":-6},{"timeMs":2000,"value":-6},{"timeMs":2200,"value":0}])"));
        const auto old = json(R"([{"timeMs":0,"value":-3},{"timeMs":4000,"value":-3}])");
        const auto ramp = json(R"([{"timeMs":1000,"value":-3},{"timeMs":2000,"value":-10}])");
        QCOMPARE(call("writeAutomationPass", {old,QJsonObject{{"startMs",1000},{"endMs",2000},{"samples",ramp}},0,200,.01}).toArray(),
                 json(R"([{"timeMs":0,"value":-3},{"timeMs":1000,"value":-3},{"timeMs":2000,"value":-10},{"timeMs":2200,"value":-3},{"timeMs":4000,"value":-3}])"));
        const auto curve = json(R"([{"timeMs":0,"value":0},{"timeMs":1100,"value":-20},{"timeMs":1500,"value":-20},{"timeMs":5000,"value":0}])");
        const auto shortTake = json(R"([{"timeMs":1000,"value":-2},{"timeMs":1200,"value":-4}])");
        QCOMPARE(call("writeAutomationPass", {curve,QJsonObject{{"startMs",1000},{"endMs",1200},{"samples",shortTake}},0,200,.01}).toArray(),
                 json(R"([{"timeMs":0,"value":0},{"timeMs":1000,"value":-2},{"timeMs":1200,"value":-4},{"timeMs":1400,"value":-20},{"timeMs":1500,"value":-20},{"timeMs":5000,"value":0}])"));
        QCOMPARE(call("automationParamColorRole", {0,QJsonObject{{"kind","mixer"},{"param","volumeDb"}}}).toString(), "warning");
        QCOMPARE(call("automationParamColorRole", {0,QJsonObject{{"kind","mixer"},{"param","pan"}}}).toString(), "success");
        QCOMPARE(call("automationParamColorRole", {5,QJsonObject{{"kind","clip"}}}).toString(), "secondary");
    }
    void offAndLiveOverridePlayback() {
        auto raw=document();
        auto tracks=raw["tracks"].toArray(); auto t=tracks[0].toObject();
        t["automation"]=QJsonArray{lane("mixer","pan",{QJsonObject{{"timeMs",0},{"value",.5}}})};
        t["automationMode"]="off"; tracks[0]=t; raw["tracks"]=tracks;
        auto parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        auto plan=nt::audio::buildMixPlan(requireValue(parsed.timeline));
        QVERIFY(!plan.tracks[0].panSource);
        t["automationMode"]="read"; tracks[0]=t; raw["tracks"]=tracks;
        parsed=nt::parseTimelineJson(QJsonDocument(raw).toJson()); QVERIFY(parsed.timeline);
        auto state=std::make_shared<nt::MixerOverride>();
        requireValue(parsed.timeline).tracks[0].mixerOverride=state;
        plan=nt::audio::buildMixPlan(requireValue(parsed.timeline));
        QVERIFY(plan.tracks[0].panSource);
        QCOMPARE(plan.tracks[0].panSource->valueAt(0,0),.5);
        state->pan.store(-.25); QCOMPARE(plan.tracks[0].panSource->valueAt(0,0),-.25);
        state->pan.store(std::numeric_limits<double>::quiet_NaN());
        QCOMPARE(plan.tracks[0].panSource->valueAt(0,0),.5);
    }
    void pictureSegmentCrossesClipEdges() {
        const auto doc = QJsonDocument::fromJson(R"({"fps":30,"durationMs":1000,
            "tracks":[{"id":"v","type":"video","index":0,"automation":[{
                "id":"opacity","target":{"kind":"clip","property":"opacity"},
                "points":[{"timeMs":0,"value":1},{"timeMs":1000,"value":0,"easing":"easeInOut"}]}]}],
            "clips":[{"id":"c","trackId":"v","mediaType":"video","status":"generated",
                "currentAssetId":"opaque-source","startMs":200,"durationMs":600,"opacity":1}]})").object();
        auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson());
        QVERIFY(parsed.timeline);
        const auto scene = nt::evaluateScene(*parsed.timeline, 250);
        QCOMPARE(scene.layers.size(), std::size_t(1));
        // Full segment easeInOut(0.25) = 0.0625, even though both keys lie outside the clip.
        QCOMPARE(scene.layers[0].opacity, 0.9375);
        auto off=doc; auto tracks=off["tracks"].toArray(); auto track=tracks[0].toObject();
        track["automationMode"]="off"; tracks[0]=track; off["tracks"]=tracks;
        parsed=nt::parseTimelineJson(QJsonDocument(off).toJson()); QVERIFY(parsed.timeline);
        QCOMPARE(nt::evaluateScene(requireValue(parsed.timeline),250).layers[0].opacity,1.);
    }
    void valuesAndBreakpoints() {
        const QJsonArray points{QJsonObject{{"timeMs",0},{"value",-20}},QJsonObject{{"timeMs",100},{"value",0},{"easing","hold"}}};
        QCOMPARE(automationValueAt(points, 50), -20.);
        QCOMPARE(automationBreakpoints(points, 0).size(), 3);
        QCOMPARE(automationValueAt({}, 10, 17), 17.);
    }
    void breakpointsShareOneGrid() {
        // B73: a play start inside an eased segment ramps through the same cuts as a start at zero.
        const QJsonArray points{QJsonObject{{"timeMs",0},{"value",0}},QJsonObject{{"timeMs",1000},{"value",1},{"easing","easeIn"}}};
        const QJsonObject options{{"maxStepMs",30}};
        const auto fromZero = automationBreakpoints(points, 0, options);
        auto fromInside = automationBreakpoints(points, 245, options);
        fromInside.removeFirst();
        QJsonArray expected;
        for (const auto& bp : fromZero) { if (bp.toObject()["timeMs"].toDouble() > 245) { expected.append(bp); } }
        QCOMPARE(fromInside, expected);
    }
    void pointEdits() {
        const auto added = addAutomationPoint({}, {{"timeMs",-2},{"value",3},{"easing","linear"}});
        QCOMPARE(added.value("index").toInt(-1), 0);
        QCOMPARE(added.value("points").toArray()[0].toObject(), (QJsonObject{{"timeMs",0},{"value",3}}));
    }
    void mixerEdits() {
        auto doc = edit(document(), "setTrackVolume", {{"trackId","a"},{"db",99}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["volumeDb"].toDouble(), 24.);
        doc = edit(doc, "setTrackPan", {{"trackId","a"},{"pan",-8}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["pan"].toDouble(), -1.);
        doc = edit(doc, "setMasterVolume", {{"db",-200}});
        QCOMPARE(doc["master"].toObject()["volumeDb"].toDouble(), -120.);
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["custom"].toInt(), 12);
    }
    void insertEdits() {
        auto doc = edit(document(), "addTrackEffect", {{"trackId","a"},{"effect","filter"}});
        auto fx = doc["tracks"].toArray()[0].toObject()["effects"].toArray();
        QCOMPARE(fx.size(), 1);
        const auto id = fx[0].toObject()["id"].toString();
        QVERIFY(QRegularExpression("^[0-9a-f]{32}$").match(id).hasMatch());
        QCOMPARE(fx[0].toObject()["frequency"].toDouble(), 1000.);
        doc = edit(doc, "updateTrackEffect", {{"trackId","a"},{"effectId",id},{"patch",QJsonObject{{"q",4}}}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["effects"].toArray()[0].toObject()["q"].toDouble(), 4.);
        doc = edit(doc, "removeTrackEffect", {{"trackId","a"},{"effectId",id}});
        QVERIFY(doc["tracks"].toArray()[0].toObject()["effects"].toArray().empty());
        doc = edit(doc, "addMasterEffect", {{"effect",QJsonObject{{"id","kept"},{"type","gain"},{"gainDb",3}}}});
        QCOMPARE(doc["master"].toObject()["effects"].toArray()[0].toObject()["id"].toString(), "kept");
        doc = edit(doc, "updateMasterEffect", {{"effectId","kept"},{"patch",QJsonObject{{"enabled",false}}}});
        QCOMPARE(doc["master"].toObject()["effects"].toArray()[0].toObject()["enabled"].toBool(true), false);
        doc = edit(doc, "removeMasterEffect", {{"effectId","kept"}});
        QVERIFY(doc["master"].toObject()["effects"].toArray().empty());
    }
    void automationEdits() {
        const QJsonArray lanes{lane("mixer","pan",{QJsonObject{{"timeMs",0},{"value",1}}})};
        auto doc = edit(document(), "setTrackAutomation", {{"trackId","a"},{"automation",lanes}});
        QCOMPARE(doc["tracks"].toArray()[0].toObject()["automation"].toArray(), lanes);
        doc = edit(doc, "setTrackAutomation", {{"trackId","a"},{"automation",QJsonArray{}}});
        QVERIFY(!doc["tracks"].toArray()[0].toObject().contains("automation"));
        auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject(); track["locked"] = true; tracks[0] = track; doc["tracks"] = tracks;
        QCOMPARE(edit(doc, "setTrackAutomation", {{"trackId","a"},{"automation",lanes}}), doc);
    }
    void meterTap() {
        const auto parsed = nt::parseTimelineJson(QJsonDocument(document()).toJson());
        QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QVERIFY(!plan.tracks[0].processors.empty());
        QCOMPARE(plan.tracks[0].processors.back()->id, std::string("p2-meter:a"));
        std::array<float,4> signal{.5f,-.25f,-.8f,.1f};
        const auto before=signal;
        plan.tracks[0].processors.back()->process(signal,{48000,0,1000./48000});
        QCOMPARE(signal,before);
        QCOMPARE(nt::automation::takeMeter("a"),(std::array<float,2>{.8f,.25f}));
        QCOMPARE(nt::automation::takeMeter("a"),(std::array<float,2>{0,0}));
        QCOMPARE(plan.processors.back()->id,std::string("p2-meter:master"));
    }
    void mixFollowsAutomation() {
        auto doc = document(); auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject();
        track["automation"] = QJsonArray{lane("mixer","volumeDb",{QJsonObject{{"timeMs",0},{"value",-20}},QJsonObject{{"timeMs",100},{"value",0}}})};
        tracks[0] = track; doc["tracks"] = tracks;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline); QCOMPARE(plan.tracks.size(), std::size_t(1));
        QVERIFY(plan.tracks[0].gainSource);
        // ConstantSourceNode gain sample from dsp-reference.mjs sampleParam.
        QCOMPARE(plan.tracks[0].gainSource->valueAt(5,1),0.1129462718963623);
    }
    // The mixer's filter and EQ inserts use the biquad design of the
    // lib.audio nodes (native/kernels), so a filter sounds the same in both.
    void filtersShareTheKernelDesign() {
        auto doc = document(); auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject();
        track["effects"] = QJsonArray{
            QJsonObject{{"id","f"},{"type","filter"},{"enabled",true},{"mode","highpass"},{"frequency",700},{"q",6}},
            QJsonObject{{"id","e"},{"type","eq3"},{"enabled",true},{"lowFreq",150},{"lowGainDb",4},{"midFreq",900},
                        {"midQ",2},{"midGainDb",-5},{"highFreq",6000},{"highGainDb",3}}};
        tracks[0] = track; doc["tracks"] = tracks;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        std::shared_ptr<nt::audio::BlockProcessor> filter, eq;
        for (const auto& p : plan.tracks[0].processors) {
            if (p->id == "f") { filter = p; }
            if (p->id == "e") { eq = p; }
        }
        QVERIFY(filter && eq);
        const double rate = 48000;
        filter->prepare(rate); eq->prepare(rate);
        constexpr std::size_t frames = 512;
        std::vector<float> mixed(frames * 2);
        for (std::size_t i = 0; i < mixed.size(); ++i) {
            mixed[i] = static_cast<float>(0.6 * std::sin(0.031 * static_cast<double>(i * i % 977)) - 0.2 * std::cos(0.7 * static_cast<double>(i)));
        }
        auto expected = mixed;
        const nt::audio::BlockContext context{rate, 0, 1000. / rate};
        filter->process(mixed, context); eq->process(mixed, context);

        const auto apply = [&](int type, double frequency, double q, double gain) {
            double coeffs[NT_BIQUAD_COEFFS_LEN];
            QCOMPARE(nt_biquad_design_webaudio(type, rate, frequency, q, gain, coeffs), NT_OK);
            std::vector<double> state(NT_BIQUAD_STATE_LEN * 2);
            nt_biquad_process(coeffs, state.data(), expected.data(), expected.data(), frames, 2);
        };
        apply(NT_BIQUAD_HIGHPASS, 700, 6, 0);
        apply(NT_BIQUAD_LOWSHELF, 150, 1, 4);
        apply(NT_BIQUAD_PEAKING, 900, 2, -5);
        apply(NT_BIQUAD_HIGHSHELF, 6000, 1, 3);
        // Effects.cpp may contract a multiply-add on arm64; the kernels do not.
        double worst = 0;
        for (std::size_t i = 0; i < mixed.size(); ++i) { worst = std::max(worst, std::abs(double(mixed[i]) - expected[i])); }
        QVERIFY2(worst < 1e-6, qPrintable(QString::number(worst)));
    }
    void panMatchesAudioParam() {
        auto doc = document(); auto tracks = doc["tracks"].toArray(); auto track = tracks[0].toObject();
        track["automation"] = QJsonArray{lane("mixer","pan",{
            QJsonObject{{"timeMs",0},{"value",-.7}},
            QJsonObject{{"timeMs",500},{"value",.8}},
            QJsonObject{{"timeMs",850},{"value",-.7}}})};
        tracks[0] = track; doc["tracks"] = tracks;
        const auto parsed = nt::parseTimelineJson(QJsonDocument(doc).toJson()); QVERIFY(parsed.timeline);
        const auto plan = nt::audio::buildMixPlan(*parsed.timeline);
        QVERIFY(plan.tracks[0].panSource);
        // ConstantSourceNode samples from dsp-reference.mjs sampleParam.
        const std::array<std::pair<int,double>,8> samples{{
            {0,-0.699999988079071}, {1,-0.6999374628067017},
            {296,-0.6814999580383301}, {19075,0.4921874701976776},
            {24000,0.800000011920929}, {30000,0.26428571343421936},
            {40800,-0.699999988079071}, {52799,-0.699999988079071}
        }};
        for (const auto& [frame,value] : samples) {
            QCOMPARE(plan.tracks[0].panSource->valueAt(frame*1000./48000,0),value);
        }
    }
};
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv); registerMeterStage();
    if (app.arguments().contains("--json")) {
        QFile in; if (!in.open(stdin,QIODevice::ReadOnly)) { return 2; }
        QJsonArray out;
        for (const auto& v : QJsonDocument::fromJson(in.readAll()).array()) {
            const auto a = v.toArray();
            if (a[0]=="panSamples") {
                const auto args=a[1].toArray();
                auto doc=document(); auto tracks=doc["tracks"].toArray(); auto track=tracks[0].toObject();
                track["automation"]=QJsonArray{lane("mixer","pan",args[0].toArray())}; tracks[0]=track; doc["tracks"]=tracks;
                const auto parsed=nt::parseTimelineJson(QJsonDocument(doc).toJson());
                if (!parsed.timeline) { return 2; }
                const auto plan=nt::audio::buildMixPlan(*parsed.timeline);
                QJsonArray values;
                for (int i=0;i<args[1].toInt();++i) { values.append(plan.tracks[0].panSource->valueAt(i*1000./args[2].toDouble(),0)); }
                out.append(values);
            } else { out.append(call(a[0].toString(),a[1].toArray())); }
        }
        QFile output; if (!output.open(stdout,QIODevice::WriteOnly)) { return 2; }
        output.write(QJsonDocument(out).toJson(QJsonDocument::Compact)); return 0;
    }
    TestAutomation test; return QTest::qExec(&test,argc,argv);
}
#include "tst_automation.moc"
