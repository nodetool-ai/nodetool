#pragma once
#include "preview/SceneEval.h"
#include <QJsonArray>
#include <algorithm>
#include <cmath>
#include <span>
#include <vector>

namespace nt::effects {
inline constexpr int maxAnalysisFrames = 18000;
struct LuminanceSample { double timeMs, logLuma; bool cut = false; };

inline QJsonObject analysisSource(const Clip& clip) {
    return {{"assetId",clip.raw.value("currentAssetId").toString()},
            {"mediaPath",clip.raw.value("mediaPath").toString()}};
}
inline std::pair<double,double> analysisRange(const Clip& clip) {
    double first=clipSourceMsAt(clip,clip.startMs), last=clipSourceMsAt(clip,clip.startMs+clip.durationMs);
    if (first>last) { std::swap(first,last); }
    if (clip.timeRemap) {
        for (const auto& key : clip.timeRemap->keyframes) {
            if (key.t<0 || key.t>1) { continue; }
            first=std::min(first,std::max(0.,key.sourceMs)); last=std::max(last,std::max(0.,key.sourceMs));
        }
    }
    return {first,last};
}
inline QJsonObject analysisKey(const Clip& clip, const QJsonObject& effect) {
    const auto [first,last]=analysisRange(clip);
    QJsonObject key{{"source",analysisSource(clip)},{"rangeStartMs",first},{"rangeEndMs",last},
                    {"windowMs",effect.value("windowMs").toDouble(500)}};
    if (effect.value("type")=="stabilize") { key.insert("kind","stabilize"); }
    else { key.insert("maxCorrection",effect.value("maxCorrection").toDouble(1)); }
    return key;
}
inline bool analysisMatches(const Clip& clip, const QJsonObject& effect) {
    const auto data=effect.value("analysis").toObject(), key=analysisKey(clip,effect);
    if (clip.mediaType!=MediaType::Video || data.value("version").toInt()!=1) { return false; }
    if (effect.value("type")=="stabilize" && (data.value("width").toDouble()<=0 || data.value("height").toDouble()<=0 ||
        data.value("requiredZoom").toDouble()<1 || data.value("requiredZoom").toDouble()>10)) { return false; }
    for (auto it=key.begin();it!=key.end();++it) {
        if (it.key()=="rangeStartMs" || it.key()=="rangeEndMs") { continue; }
        if (data.value(it.key())!=it.value()) { return false; }
    }
    if (data.value("rangeStartMs").toDouble()>key.value("rangeStartMs").toDouble()+1e-6 ||
        data.value("rangeEndMs").toDouble()<key.value("rangeEndMs").toDouble()-1e-6) { return false; }
    const auto samples=data.value("samples").toArray();
    return !samples.isEmpty() && samples.size()<=maxAnalysisFrames;
}

// Prefix sums and two moving bounds keep the symmetric fit linear in clip length.
inline QJsonArray deflickerCurve(std::span<const LuminanceSample> samples, double windowMs, double limit) {
    QJsonArray out;
    for (size_t begin=0;begin<samples.size();) {
        size_t end=begin+1;
        while (end<samples.size() && !samples[end].cut) { ++end; }
        const size_t count=end-begin;
        std::vector<double> t(count+1),tt(count+1),y(count+1),ty(count+1);
        std::vector<int> positive(count+1),negative(count+1);
        for (size_t i=0;i<count;++i) {
            const auto& sample=samples[begin+i];
            const double seconds=(sample.timeMs-samples[begin].timeMs)/1000;
            t[i+1]=t[i]+seconds; tt[i+1]=tt[i]+seconds*seconds;
            y[i+1]=y[i]+sample.logLuma; ty[i+1]=ty[i]+seconds*sample.logLuma;
            const double delta=i ? sample.logLuma-samples[begin+i-1].logLuma : 0;
            positive[i+1]=positive[i]+(delta>0.005); negative[i+1]=negative[i]+(delta<-.005);
        }
        size_t left=0,right=0;
        for (size_t i=0;i<count;++i) {
            const auto& sample=samples[begin+i];
            while (left<i && sample.timeMs-samples[begin+left].timeMs>windowMs/2) { ++left; }
            while (right+1<count && samples[begin+right+1].timeMs-sample.timeMs<=windowMs/2) { ++right; }
            const double n=double(right-left+1), x=(sample.timeMs-samples[begin].timeMs)/1000;
            const double st=t[right+1]-t[left]-n*x;
            const double stt=tt[right+1]-tt[left]-2*x*(t[right+1]-t[left])+n*x*x;
            const double sy=y[right+1]-y[left], sty=ty[right+1]-ty[left]-x*sy;
            const double determinant=n*stt-st*st;
            const bool fade=positive[right+1]==positive[left+1] || negative[right+1]==negative[left+1];
            double stops=0;
            if (!fade && sample.logLuma>-9 && determinant>1e-12) {
                stops=std::clamp((sy*stt-st*sty)/determinant-sample.logLuma,-limit,limit);
            }
            out.append(QJsonObject{{"timeMs",sample.timeMs},{"stops",stops}});
        }
        begin=end;
    }
    return out;
}

inline double deflickerStops(const Clip& clip,const QJsonObject& effect,double timelineMs) {
    if (!analysisMatches(clip,effect)) { return 0; }
    const auto data=effect.value("analysis").toObject();
    const double time=clipSourceMsAt(clip,timelineMs);
    if (time<data.value("rangeStartMs").toDouble()-1e-6 || time>data.value("rangeEndMs").toDouble()+1e-6) { return 0; }
    const auto samples=data.value("samples").toArray();
    qsizetype low=0,high=samples.size();
    while (low<high) {
        const auto mid=low+(high-low)/2;
        if (samples[mid].toObject().value("timeMs").toDouble()<=time+1e-6) { low=mid+1; } else { high=mid; }
    }
    const double stops=samples[std::max<qsizetype>(0,low-1)].toObject().value("stops").toDouble();
    const double limit=std::clamp(effect.value("maxCorrection").toDouble(1),0.,3.);
    return std::isfinite(stops) ? std::clamp(stops,-limit,limit)*std::clamp(effect.value("strength").toDouble(1),0.,1.) : 0;
}
}
