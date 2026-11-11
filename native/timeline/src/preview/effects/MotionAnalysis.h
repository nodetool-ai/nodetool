#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <optional>
#include <span>
#include <vector>

namespace nt::effects {
struct MotionFrame { int width=0,height=0; std::vector<float> luma; };
struct MotionPoint { double x=0,y=0; };
struct MotionMatch { MotionPoint from,to; };
// Coordinates are centered, in source-width units. Similarity maps previous to current.
struct CameraMotion { double a=1,b=0,x=0,y=0; int inliers=0; };
struct CameraPath { double timeMs=0,x=0,y=0,angle=0,logScale=0; bool cut=false; };

inline MotionFrame motionFrame(std::span<const uint8_t> rgb,int width,int height) {
    MotionFrame frame{width,height,std::vector<float>(size_t(width)*height)};
    for (size_t i=0;i<frame.luma.size();++i) {
        frame.luma[i]=float((.2126*rgb[i*3]+.7152*rgb[i*3+1]+.0722*rgb[i*3+2])/255);
    }
    return frame;
}
inline double cornerScore(const MotionFrame& frame,int x,int y) {
    double xx=0,xy=0,yy=0;
    for (int dy=-1;dy<=1;++dy) { for (int dx=-1;dx<=1;++dx) {
        const auto at=(y+dy)*frame.width+x+dx;
        const double gx=(frame.luma[at+1]-frame.luma[at-1])/2;
        const double gy=(frame.luma[at+frame.width]-frame.luma[at-frame.width])/2;
        xx+=gx*gx; xy+=gx*gy; yy+=gy*gy;
    } }
    return (xx+yy-std::sqrt((xx-yy)*(xx-yy)+4*xy*xy))/2;
}
inline double patchCorrelation(const MotionFrame& a,int ax,int ay,const MotionFrame& b,int bx,int by) {
    double sa=0,sb=0,aa=0,bb=0,ab=0;
    for (int y=-3;y<=3;++y) { for (int x=-3;x<=3;++x) {
        const double av=a.luma[(ay+y)*a.width+ax+x],bv=b.luma[(by+y)*b.width+bx+x];
        sa+=av; sb+=bv; aa+=av*av; bb+=bv*bv; ab+=av*bv;
    } }
    const double variance=(aa-sa*sa/49)*(bb-sb*sb/49);
    return variance>1e-10 ? (ab-sa*sb/49)/std::sqrt(variance) : -1;
}
inline std::optional<MotionPoint> matchPatch(const MotionFrame& from,int x,int y,const MotionFrame& to) {
    constexpr int radius=8,side=radius*2+1;
    std::array<double,side*side> scores; scores.fill(-1);
    double best=-1; int bx=0,by=0;
    for (int dy=-radius;dy<=radius;++dy) { for (int dx=-radius;dx<=radius;++dx) {
        if (x+dx<3 || y+dy<3 || x+dx>=to.width-3 || y+dy>=to.height-3) { continue; }
        const double score=patchCorrelation(from,x,y,to,x+dx,y+dy);
        scores[(dy+radius)*side+dx+radius]=score;
        if (score>best) { best=score; bx=dx; by=dy; }
    } }
    if (best<.85) { return {}; }
    double second=-1;
    for (int dy=-radius;dy<=radius;++dy) { for (int dx=-radius;dx<=radius;++dx) {
        if (std::abs(dx-bx)<=1 && std::abs(dy-by)<=1) { continue; }
        second=std::max(second,scores[(dy+radius)*side+dx+radius]);
    } }
    if (best-second<.015) { return {}; }
    const auto offset=[&](int stride,int coordinate) {
        if (std::abs(coordinate)==radius) { return 0.; }
        const int at=(by+radius)*side+bx+radius;
        const double left=scores[at-stride],right=scores[at+stride],denominator=left-2*best+right;
        return denominator< -1e-9 ? std::clamp(.5*(left-right)/denominator,-.5,.5) : 0.;
    };
    return MotionPoint{x+bx+offset(1,bx),y+by+offset(side,by)};
}
inline MotionPoint movePoint(const CameraMotion& motion,MotionPoint point) {
    return {motion.a*point.x-motion.b*point.y+motion.x,motion.b*point.x+motion.a*point.y+motion.y};
}
inline std::optional<CameraMotion> fitCameraMotion(std::span<const MotionMatch> matches,double threshold,double aspect) {
    if (matches.size()<8 || matches.size()>64) { return {}; }
    const auto inlier=[&](const CameraMotion& motion,const MotionMatch& match) {
        const auto mapped=movePoint(motion,match.from);
        return std::hypot(mapped.x-match.to.x,mapped.y-match.to.y)<=threshold;
    };
    CameraMotion best; double bestScore=0;
    for (size_t i=0;i<matches.size();++i) { for (size_t j=i+1;j<matches.size();++j) {
        const auto& p=matches[i]; const auto& q=matches[j];
        const double dx=q.from.x-p.from.x,dy=q.from.y-p.from.y;
        const double ex=q.to.x-p.to.x,ey=q.to.y-p.to.y,denominator=dx*dx+dy*dy;
        if (denominator<.0016) { continue; }
        CameraMotion model{(dx*ex+dy*ey)/denominator,(dx*ey-dy*ex)/denominator};
        if (std::hypot(model.a,model.b)<.85 || std::hypot(model.a,model.b)>1.15 || std::abs(std::atan2(model.b,model.a))>.2) { continue; }
        model.x=p.to.x-model.a*p.from.x+model.b*p.from.y;
        model.y=p.to.y-model.b*p.from.x-model.a*p.from.y;
        double score=0; std::array<bool,4> quadrants{};
        for (const auto& match : matches) {
            if (!inlier(model,match)) { continue; }
            ++model.inliers;
            const bool border=std::abs(match.from.x)>.25 || std::abs(match.from.y)>.25*aspect;
            score+=border ? 2 : 1;
            quadrants[(match.from.x>0 ? 1 : 0)+(match.from.y>0 ? 2 : 0)]=true;
        }
        if (model.inliers<8 || model.inliers<int(std::ceil(matches.size()*.45)) ||
            std::count(quadrants.begin(),quadrants.end(),true)<3) { continue; }
        if (score>bestScore) { bestScore=score; best=model; }
    } }
    if (!bestScore) { return {}; }
    MotionPoint from{},to{}; double count=0;
    for (const auto& match : matches) { if (inlier(best,match)) {
        from.x+=match.from.x; from.y+=match.from.y; to.x+=match.to.x; to.y+=match.to.y; ++count;
    } }
    from.x/=count; from.y/=count; to.x/=count; to.y/=count;
    double dot=0,cross=0,variance=0;
    for (const auto& match : matches) { if (inlier(best,match)) {
        const double x=match.from.x-from.x,y=match.from.y-from.y,u=match.to.x-to.x,v=match.to.y-to.y;
        dot+=x*u+y*v; cross+=x*v-y*u; variance+=x*x+y*y;
    } }
    if (variance<1e-9) { return {}; }
    CameraMotion fitted{dot/variance,cross/variance};
    fitted.x=to.x-fitted.a*from.x+fitted.b*from.y;
    fitted.y=to.y-fitted.b*from.x-fitted.a*from.y;
    if (std::hypot(fitted.a,fitted.b)<.85 || std::hypot(fitted.a,fitted.b)>1.15 || std::abs(std::atan2(fitted.b,fitted.a))>.2) { return {}; }
    fitted.inliers=int(std::count_if(matches.begin(),matches.end(),[&](const auto& match) { return inlier(fitted,match); }));
    if (fitted.inliers<8 || fitted.inliers<int(std::ceil(matches.size()*.45))) { return {}; }
    return fitted;
}
inline std::optional<CameraMotion> estimateCameraMotion(const MotionFrame& from,const MotionFrame& to,double aspect) {
    if (from.width!=to.width || from.height!=to.height || from.width<28 || from.height<28) { return {}; }
    const int columns=std::clamp(from.width/20,2,8),rows=std::clamp(from.height/18,2,8);
    std::vector<MotionMatch> matches;
    for (int row=0;row<rows;++row) { for (int column=0;column<columns;++column) {
        int px=0,py=0; double best=.003;
        const int x0=11+(from.width-22)*column/columns,x1=11+(from.width-22)*(column+1)/columns;
        const int y0=11+(from.height-22)*row/rows,y1=11+(from.height-22)*(row+1)/rows;
        for (int y=y0;y<y1;y+=2) { for (int x=x0;x<x1;x+=2) {
            const double score=cornerScore(from,x,y); if (score>best) { best=score; px=x; py=y; }
        } }
        if (!px) { continue; }
        const auto target=matchPatch(from,px,py,to); if (!target) { continue; }
        const auto back=matchPatch(to,int(std::round(target->x)),int(std::round(target->y)),from);
        if (!back || std::hypot(back->x-px,back->y-py)>1.5) { continue; }
        matches.push_back({{(px+.5)/from.width-.5,((py+.5)/from.height-.5)*aspect},
                           {(target->x+.5)/from.width-.5,((target->y+.5)/from.height-.5)*aspect}});
    } }
    return fitCameraMotion(matches,1.5*std::max(1./from.width,aspect/from.height),aspect);
}
}
