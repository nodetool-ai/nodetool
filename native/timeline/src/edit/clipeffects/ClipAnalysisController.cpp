#include "edit/clipeffects/ClipAnalysisController.h"
#include "preview/FfmpegSource.h"
#include "preview/effects/ClipAnalysis.h"
#include "preview/effects/Stabilization.h"
#include <QFileInfo>
#include <QMetaObject>
#include <array>
#include <chrono>
#include <stdexcept>
extern "C" {
#include <libavutil/frame.h>
#include <libswscale/swscale.h>
}

namespace {
using namespace std::chrono_literals;
struct Measurement {
    double logLuma=0;
    std::vector<double> normalized;
    std::array<double,48> histogram{};
};
Measurement measure(std::span<const uint8_t> rgb) {
    const int pixels=int(rgb.size()/3);
    Measurement result;
    result.normalized.resize(rgb.size());
    std::vector<double> luma(pixels);
    double mean=0;
    for (int i=0;i<pixels;++i) {
        for (int c=0;c<3;++c) {
            const double v=rgb[i*3+c]/255.;
            result.normalized[i*3+c]=v<=.04045 ? v/12.92 : std::pow((v+.055)/1.055,2.4);
        }
        luma[i]=.2126*result.normalized[i*3]+.7152*result.normalized[i*3+1]+.0722*result.normalized[i*3+2];
        mean+=luma[i]/pixels;
    }
    for (int i=0;i<pixels*3;++i) {
        result.normalized[i]/=std::max(mean,1e-6);
        const int bin=std::clamp(int(result.normalized[i]*4),0,15);
        result.histogram[(i%3)*16+bin]+=1./(pixels*3);
    }
    std::sort(luma.begin(),luma.end());
    double robust=0;
    const int trim=pixels/10;
    for (int i=trim;i<pixels-trim;++i) { robust+=luma[i]/(pixels-2*trim); }
    result.logLuma=std::log2(std::max(robust,1e-6));
    return result;
}
bool sceneCut(const Measurement& a,const Measurement& b) {
    double difference=0,histogram=0;
    for (size_t i=0;i<a.normalized.size();++i) { difference+=std::min(2.,std::abs(a.normalized[i]-b.normalized[i]))/a.normalized.size(); }
    for (size_t i=0;i<a.histogram.size();++i) { histogram+=std::abs(a.histogram[i]-b.histogram[i]); }
    return difference>1.2 || (difference>.45 && histogram>.25);
}
QJsonObject analyzeSource(const std::string& path,QJsonObject key,std::stop_token stop,
                         const std::function<void(int)>& progress) {
    const double begin=key.value("rangeStartMs").toDouble()/1000;
    nt::FfmpegDecoder decoder(path,begin,nt::DecodeMode::Software);
    const auto openedDeadline=std::chrono::steady_clock::now()+10s;
    auto facts=decoder.facts();
    while (!facts && !stop.stop_requested()) {
        if (std::chrono::steady_clock::now()>openedDeadline) { throw std::runtime_error("Opening the source timed out."); }
        std::this_thread::sleep_for(2ms); facts=decoder.facts();
    }
    if (stop.stop_requested()) { return {}; }
    if (!facts->usable()) { throw std::runtime_error(facts->error.empty() ? "This source format cannot be analyzed: "+facts->rejection : facts->error); }
    if (!(facts->frameRate>0 && facts->frameRate<=240 && facts->durationSec>begin)) {
        throw std::runtime_error("The source needs a valid frame rate up to 240 fps and a readable clip interval.");
    }
    const double step=1/facts->frameRate;
    const bool camera=key.value("kind")=="stabilize";
    const int width=camera ? std::max(28,int(std::round(160.*facts->width/std::max(facts->width,facts->height)))) : 64;
    const int height=camera ? std::max(28,int(std::round(160.*facts->height/std::max(facts->width,facts->height)))) : 36;
    const double aspect=double(facts->height)/facts->width;
    const double first=begin;
    const double end=std::min(key.value("rangeEndMs").toDouble()/1000,facts->durationSec);
    const double estimate=std::max(1.,std::ceil((end-first)/step-1e-6));
    if (!std::isfinite(estimate) || estimate>nt::effects::maxAnalysisFrames) { throw std::runtime_error("Trim the clip to at most 18,000 source frames before analyzing."); }
    std::unique_ptr<SwsContext,decltype(&sws_freeContext)> scaler(nullptr,sws_freeContext);
    std::vector<uint8_t> rgb(size_t(width)*height*3);
    std::vector<nt::effects::LuminanceSample> samples;
    samples.reserve(size_t(estimate));
    std::optional<Measurement> previous;
    std::optional<nt::effects::MotionFrame> previousMotion;
    std::vector<nt::effects::CameraPath> cameraPath;
    nt::effects::CameraPath pose;
    int trackedFrames=0;
    int lastProgress=-1;
    for (double target=first;target<end+1e-6 && !stop.stop_requested();) {
        if (samples.size()>=nt::effects::maxAnalysisFrames) { throw std::runtime_error("Trim the clip to at most 18,000 source frames before analyzing."); }
        const auto deadline=std::chrono::steady_clock::now()+10s;
        std::shared_ptr<nt::DecodedFrame> frame;
        do {
            frame=decoder.frameAt(target,nt::FfmpegDecoder::FrameAccess::Sequential);
            if (frame && decoder.exact()) { break; }
            facts=decoder.facts();
            if (facts && !facts->usable()) { throw std::runtime_error(facts->error); }
            if (std::chrono::steady_clock::now()>deadline) { throw std::runtime_error("Decoding a source frame timed out."); }
            std::this_thread::sleep_for(2ms);
        } while (!stop.stop_requested());
        if (stop.stop_requested()) { return {}; }
        {
            scaler.reset(sws_getCachedContext(scaler.release(),frame->width,frame->height,AVPixelFormat(frame->frame->format),width,height,
                                       AV_PIX_FMT_RGB24,SWS_AREA,nullptr,nullptr,nullptr));
            if (!scaler) { throw std::runtime_error("Could not prepare source analysis pixels."); }
            const auto* coefficients=sws_getCoefficients(frame->matrix==nt::YuvMatrix::Bt709 ? SWS_CS_ITU709 : SWS_CS_ITU601);
            if (sws_setColorspaceDetails(scaler.get(),coefficients,frame->range==nt::YuvRange::Full,coefficients,1,0,1<<16,1<<16)<0) {
                throw std::runtime_error("Could not convert the source color space for analysis.");
            }
        }
        uint8_t* planes[]={rgb.data(),nullptr,nullptr,nullptr};
        int strides[]={width*3,0,0,0};
        if (sws_scale(scaler.get(),frame->frame->data,frame->frame->linesize,0,frame->height,planes,strides)!=height) {
            throw std::runtime_error("Source analysis pixel conversion failed.");
        }
        auto current=measure(rgb);
        const bool cut=previous && sceneCut(*previous,current);
        samples.push_back({frame->ptsSec*1000,current.logLuma,cut});
        if (camera) {
            auto motionFrame=nt::effects::motionFrame(rgb,width,height);
            const auto motion=previousMotion && !cut ? nt::effects::estimateCameraMotion(*previousMotion,motionFrame,aspect) : std::nullopt;
            pose.timeMs=frame->ptsSec*1000; pose.cut=!motion;
            if (motion) {
                const auto placed=nt::effects::movePoint(*motion,{pose.x,pose.y});
                pose.x=placed.x; pose.y=placed.y;
                pose.angle+=std::atan2(motion->b,motion->a); pose.logScale+=std::log(std::hypot(motion->a,motion->b));
                if (!std::isfinite(pose.x+pose.y+pose.angle+pose.logScale) || std::abs(pose.x)>1000 || std::abs(pose.y)>1000 ||
                    std::abs(pose.logScale)>10 || std::abs(pose.angle)>300) { pose.cut=true; }
                else { ++trackedFrames; }
            }
            if (pose.cut) { pose.x=0; pose.y=0; pose.angle=0; pose.logScale=0; }
            cameraPath.push_back(pose); previousMotion=std::move(motionFrame);
        }
        previous=std::move(current);
        const int percent=std::clamp(int((target-first)/std::max(step,end-first)*100),0,99);
        if (percent!=lastProgress) { lastProgress=percent; progress(percent); }
        const auto next=decoder.nextFrameSec();
        if (!next || *next>=end-1e-6) { break; }
        if (*next<=target+1e-6) { throw std::runtime_error("The source has non-increasing frame timestamps."); }
        target=*next;
    }
    if (stop.stop_requested()) { return {}; }
    key.insert("version",1); key.insert("frameRate",facts->frameRate);
    if (camera) {
        const auto result=nt::effects::stabilizationCurve(cameraPath,key.value("windowMs").toDouble(),aspect);
        key.insert("samples",result.value("samples")); key.insert("requiredZoom",result.value("requiredZoom"));
        key.insert("width",facts->width); key.insert("height",facts->height); key.insert("trackedFrames",trackedFrames);
    } else {
        key.insert("samples",nt::effects::deflickerCurve(samples,key.value("windowMs").toDouble(),key.value("maxCorrection").toDouble()));
    }
    return key;
}
}

ClipAnalysisController::~ClipAnalysisController() { m_worker.request_stop(); if (m_worker.joinable()) { m_worker.join(); } }
void ClipAnalysisController::setModel(TimelineModel* model) {
    if (m_model==model) { return; }
    cancel(); if (m_model) { disconnect(m_model,nullptr,this,nullptr); }
    m_model=model;
    if (model) {
        connect(model,&TimelineModel::clipsChanged,this,&ClipAnalysisController::refresh);
        connect(model,&TimelineModel::previewChanged,this,&ClipAnalysisController::refresh);
        connect(model,&TimelineModel::timelineChanged,this,&ClipAnalysisController::refresh);
        connect(model,&QObject::destroyed,this,&ClipAnalysisController::cancel);
    }
    emit contextChanged(); refresh();
}
void ClipAnalysisController::setClipId(const QString& id) { if (m_clipId==id) { return; } cancel(); m_clipId=id; m_error.clear(); emit contextChanged(); refresh(); }
void ClipAnalysisController::setEffectId(const QString& id) { if (m_effectId==id) { return; } cancel(); m_effectId=id; m_error.clear(); emit contextChanged(); refresh(); }
void ClipAnalysisController::setLocked(bool locked) { if (m_locked==locked) { return; } m_locked=locked; if (locked) { cancel(); } emit contextChanged(); refresh(); }
QJsonObject ClipAnalysisController::effect() const {
    const auto* clip=m_model ? m_model->findClip(m_clipId) : nullptr;
    if (clip) { for (const auto& value : clip->raw.value("effects").toArray()) { const auto e=value.toObject(); if (e.value("id")==m_effectId) { return e; } } }
    return {};
}
QString ClipAnalysisController::status() const {
    if (m_busy) { return QString("Analyzing source: %1%").arg(m_progress); }
    if (!m_error.isEmpty()) { return m_error; }
    const auto* clip=m_model ? m_model->findClip(m_clipId) : nullptr;
    if (!clip || clip->mediaType!=nt::MediaType::Video) { return "Analysis requires a video clip."; }
    const auto e=effect();
    if (nt::effects::analysisMatches(*clip,e)) {
        if (e.value("type")=="stabilize" && e.value("analysis").toObject().value("trackedFrames").toInt()==0) {
            return "No reliable camera motion found. The clip is unchanged.";
        }
        if (e.value("type")=="stabilize") {
            const auto data=e.value("analysis").toObject();
            if (data.value("trackedFrames").toInt()+1<data.value("samples").toArray().size()*.8) {
                return "Analysis ready. Some sections could not be tracked reliably.";
            }
        }
        return "Analysis ready. Playback, seeking and export use the saved result.";
    }
    return e.contains("analysis") ? "Source or analysis settings changed. Analyze again." : "Analyze the source before this effect can run.";
}
bool ClipAnalysisController::clipLocked() const {
    const auto* clip=m_model ? m_model->findClip(m_clipId) : nullptr;
    return m_locked || !clip || clip->raw.value("locked").toBool() ||
        std::any_of(m_model->timeline().tracks.begin(),m_model->timeline().tracks.end(),
                    [&](const auto& track) { return track.id==clip->trackId && track.locked; });
}
void ClipAnalysisController::refresh() {
    const auto* clip=m_model ? m_model->findClip(m_clipId) : nullptr;
    const auto type=effect().value("type").toString();
    if (m_busy && (!clip || clipLocked() || m_model->documentGeneration()!=m_generation || (type!="deflicker" && type!="stabilize") ||
                  nt::effects::analysisKey(*clip,effect())!=m_key)) { cancel(); m_error.clear(); }
    emit changed();
}
void ClipAnalysisController::cancel() {
    ++m_request; m_worker.request_stop();
    if (m_busy) { m_busy=false; m_error="Analysis canceled. The previous result is kept."; emit changed(); }
}
void ClipAnalysisController::analyze() {
    const auto* clip=m_model ? m_model->findClip(m_clipId) : nullptr;
    const auto type=effect().value("type").toString();
    if (m_busy || clipLocked() || !clip || clip->mediaType!=nt::MediaType::Video || (type!="deflicker" && type!="stabilize")) { return; }
    const auto path=clip->originalMediaPath.empty() ? clip->mediaPath : clip->originalMediaPath;
    if (path.empty() || !QFileInfo(QString::fromStdString(path)).isFile()) { m_error="The source video is not available locally."; emit changed(); return; }
    m_key=nt::effects::analysisKey(*clip,effect()); m_generation=m_model->documentGeneration();
    const double window=m_key.value("windowMs").toDouble(), limit=m_key.value("maxCorrection").toDouble();
    if (!std::isfinite(window+limit) || window<0 || window>2000 || limit<0 || limit>3) {
        m_error="Analysis settings are outside the supported range."; emit changed(); return;
    }
    const auto request=++m_request;
    m_error.clear(); m_progress=0; m_busy=true; emit changed();
    // native-rules #12: lambda captures raw this and runs on the worker thread
    m_worker=std::jthread([this,path,key=m_key,request](std::stop_token stop) {
        QJsonObject result; QString error;
        try {
            // native-rules #12: progress lambda captures raw this and runs on the worker thread
            result=analyzeSource(path,key,stop,[this,request](int percent) {
                QMetaObject::invokeMethod(this,[this,request,percent] { if (m_request==request) { m_progress=percent; emit changed(); } },Qt::QueuedConnection);
            });
        } catch (const std::exception& failure) { error=QString::fromUtf8(failure.what()); }
        if (stop.stop_requested()) { return; }
        QMetaObject::invokeMethod(this,[this,request,result=std::move(result),error] {
            if (m_request!=request || !m_model) { return; }
            refresh(); if (m_request!=request || m_locked) { return; }
            m_busy=false;
            if (!error.isEmpty()) { m_error=error; emit changed(); return; }
            const auto before=m_model->clipsJson(); auto after=before;
            for (qsizetype i=0;i<after.size();++i) {
                auto clip=after[i].toObject(); if (clip.value("id")!=m_clipId) { continue; }
                auto effects=clip.value("effects").toArray();
                for (qsizetype j=0;j<effects.size();++j) {
                    auto e=effects[j].toObject(); if (e.value("id")!=m_effectId) { continue; }
                    e.insert("analysis",result); effects[j]=e;
                }
                clip.insert("effects",effects); after[i]=clip;
            }
            m_model->commitEdit(result.value("kind")=="stabilize" ? "Analyze stabilization" : "Analyze deflicker",before,after); emit changed();
        },Qt::QueuedConnection);
    });
}
