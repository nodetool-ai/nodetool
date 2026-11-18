#pragma once
#include "preview/effects/ClipAnalysis.h"
#include "preview/effects/MotionAnalysis.h"

namespace nt::effects {
using StabilizationMatrix=std::array<double,6>;
struct StabilizationSample { double timeMs=0,x=0,y=0,angle=0,scale=1; };
inline constexpr StabilizationMatrix stabilizationIdentity{1,0,0,0,1,0};
inline StabilizationMatrix stabilizationAffine(const StabilizationSample& sample,double aspect,double strength,double zoom,
                                               std::array<double,4> crop={0,0,0,0}) {
    const double w=1-crop[0]-crop[2],h=1-crop[1]-crop[3];
    const double angle=sample.angle*strength,scale=std::pow(sample.scale,strength);
    const double c=std::cos(angle)/scale,s=std::sin(angle)/scale;
    const double x=crop[0]+w/2-.5-sample.x*strength,y=(crop[1]+h/2-.5)*aspect-sample.y*strength;
    const double centerX=(c*x+s*y+.5-crop[0])/w,centerY=((-s*x+c*y)/aspect+.5-crop[1])/h;
    const double a=c/zoom,b=s*h*aspect/(w*zoom),d=-s*w/(h*aspect*zoom),e=c/zoom;
    return {a,b,centerX-(a+b)/2,d,e,centerY-(d+e)/2};
}
inline double stabilizationZoom(const StabilizationSample& sample,double aspect) {
    const auto m=stabilizationAffine(sample,aspect,1,1);
    const double x=std::abs((m[0]+m[1])/2+m[2]-.5),y=std::abs((m[3]+m[4])/2+m[5]-.5);
    if (x>=.5 || y>=.5) { return 10; }
    return std::min(10.,std::max({1.,(std::abs(m[0])+std::abs(m[1]))/(1-2*x),(std::abs(m[3])+std::abs(m[4]))/(1-2*y)}));
}
inline QJsonObject stabilizationCurve(std::span<const CameraPath> path,double windowMs,double aspect) {
    QJsonArray samples; double requiredZoom=1;
    for (size_t begin=0;begin<path.size();) {
        size_t end=begin+1; while (end<path.size() && !path[end].cut) { ++end; }
        const size_t count=end-begin;
        std::vector<double> t(count+1),tt(count+1);
        std::vector<std::array<double,6>> sum(count+1),product(count+1);
        for (size_t i=0;i<count;++i) {
            const auto& p=path[begin+i]; const double time=(p.timeMs-path[begin].timeMs)/1000;
            t[i+1]=t[i]+time; tt[i+1]=tt[i]+time*time;
            const std::array values{p.x,p.y,p.angle,p.logScale,std::exp(p.logScale)*std::cos(p.angle),std::exp(p.logScale)*std::sin(p.angle)};
            for (int c=0;c<6;++c) { sum[i+1][c]=sum[i][c]+values[c]; product[i+1][c]=product[i][c]+values[c]*time; }
        }
        size_t left=0,right=0;
        for (size_t i=0;i<count;++i) {
            const auto& p=path[begin+i];
            while (left<i && p.timeMs-path[begin+left].timeMs>windowMs/2) { ++left; }
            while (right+1<count && path[begin+right+1].timeMs-p.timeMs<=windowMs/2) { ++right; }
            const double n=double(right-left+1),time=(p.timeMs-path[begin].timeMs)/1000;
            const double st=t[right+1]-t[left]-n*time;
            const double stt=tt[right+1]-tt[left]-2*time*(t[right+1]-t[left])+n*time*time;
            const double denominator=n*stt-st*st;
            std::array smooth{p.x,p.y,p.angle,p.logScale,std::exp(p.logScale)*std::cos(p.angle),std::exp(p.logScale)*std::sin(p.angle)};
            if (denominator>1e-12) {
                for (int c=0;c<6;++c) {
                    const double y=sum[right+1][c]-sum[left][c],ty=product[right+1][c]-product[left][c]-time*y;
                    smooth[c]=(y*stt-st*ty)/denominator;
                }
            }
            StabilizationSample sample{p.timeMs,0,0,smooth[2]-p.angle,std::exp(smooth[3]-p.logScale)};
            // Average relative translations, so the reference origin cannot create drift.
            const double inverseScale=std::exp(-p.logScale),cosine=std::cos(p.angle),sine=std::sin(p.angle);
            const double a=inverseScale*(smooth[4]*cosine+smooth[5]*sine),b=inverseScale*(smooth[5]*cosine-smooth[4]*sine);
            sample.x=smooth[0]-a*p.x+b*p.y; sample.y=smooth[1]-b*p.x-a*p.y;
            for (double* value : {&sample.x,&sample.y,&sample.angle}) { if (std::abs(*value)<1e-8) { *value=0; } }
            if (std::abs(sample.scale-1)<1e-8) { sample.scale=1; }
            requiredZoom=std::max(requiredZoom,stabilizationZoom(sample,aspect));
            samples.append(QJsonObject{{"timeMs",sample.timeMs},{"x",sample.x},{"y",sample.y},{"angle",sample.angle},{"scale",sample.scale}});
        }
        begin=end;
    }
    return {{"samples",samples},{"requiredZoom",requiredZoom}};
}
inline bool stabilizationFits(const StabilizationMatrix& matrix) {
    for (double x : {0.,1.}) { for (double y : {0.,1.}) {
        const double u=matrix[0]*x+matrix[1]*y+matrix[2],v=matrix[3]*x+matrix[4]*y+matrix[5];
        if (!std::isfinite(u+v) || u< -1e-8 || u>1+1e-8 || v< -1e-8 || v>1+1e-8) { return false; }
    } }
    return true;
}
inline StabilizationMatrix stabilizationMatrix(const Clip& clip,const QJsonObject& effect,double timelineMs) {
    const double strength=std::clamp(effect.value("strength").toDouble(1),0.,1.);
    if (!strength || !analysisMatches(clip,effect)) { return stabilizationIdentity; }
    const auto data=effect.value("analysis").toObject(); const double time=clipSourceMsAt(clip,timelineMs);
    if (time<data.value("rangeStartMs").toDouble()-1e-6 || time>data.value("rangeEndMs").toDouble()+1e-6) { return stabilizationIdentity; }
    const auto samples=data.value("samples").toArray(); qsizetype low=0,high=samples.size();
    while (low<high) { const auto mid=low+(high-low)/2; if (samples[mid].toObject().value("timeMs").toDouble()<=time+1e-6) { low=mid+1; } else { high=mid; } }
    const auto selected=samples[std::max<qsizetype>(0,low-1)].toObject();
    StabilizationSample sample{time,selected.value("x").toDouble(),selected.value("y").toDouble(),
                               selected.value("angle").toDouble(),selected.value("scale").toDouble(1)};
    if (!(sample.scale>0) || !std::isfinite(sample.x+sample.y+sample.angle+sample.scale)) { return stabilizationIdentity; }
    const auto authored=clip.raw.value("crop").toObject();
    std::array crop{authored.value("left").toDouble(),authored.value("top").toDouble(),authored.value("right").toDouble(),authored.value("bottom").toDouble()};
    if (std::any_of(crop.begin(),crop.end(),[](double v) { return !std::isfinite(v) || v<0; }) || crop[0]+crop[2]>=1-1e-4 || crop[1]+crop[3]>=1-1e-4) { crop={0,0,0,0}; }
    const double zoom=std::min(std::clamp(effect.value("maxZoom").toDouble(1.1),1.,1.5),
        1+(data.value("requiredZoom").toDouble()-1)*strength/std::min(1-crop[0]-crop[2],1-crop[1]-crop[3]));
    const auto matrix=[&](double amount) { return stabilizationAffine(sample,data.value("height").toDouble()/data.value("width").toDouble(),amount,zoom,crop); };
    const auto requested=matrix(strength); if (stabilizationFits(requested)) { return requested; }
    double minimum=0,maximum=strength;
    for (int i=0;i<24;++i) { const double middle=(minimum+maximum)/2; if (stabilizationFits(matrix(middle))) { minimum=middle; } else { maximum=middle; } }
    return matrix(minimum);
}
}
