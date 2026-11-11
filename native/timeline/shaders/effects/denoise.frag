#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
    mat4 matrix; mat4 colorMatrix; vec4 geometry; vec4 sourceRect; vec4 dimensions; vec4 origin; vec4 p[4];
};
layout(binding=1) uniform sampler2D source;
layout(binding=2) uniform sampler2D second;
layout(binding=3) uniform sampler2D third;

vec4 ycc(vec4 c) { float y=dot(c.rgb,vec3(.2126,.7152,.0722)); return vec4(y,(c.b-y)/1.8556,(c.r-y)/1.5748,c.a); }
vec3 rgb(vec3 c) { float r=c.x+1.5748*c.z,b=c.x+1.8556*c.y;return vec3(r,(c.x-.2126*r-.0722*b)/.7152,b); }
vec4 currentRaw(ivec2 at) {
    at=clamp(at,ivec2(origin.xy),ivec2(origin.xy+dimensions.zw)-1);
    if (geometry.x>.5) { at.y=int(dimensions.y)-1-at.y; }
    return texelFetch(source,at,0);
}
vec3 straight(vec4 c) {
    if (geometry.y > 3.5) { return c.a > 0.0 ? c.rgb/c.a : vec3(0.0); }
    return c.rgb/max(c.a,1./255.);
}
vec4 current(ivec2 at) { vec4 c=currentRaw(at);return vec4(straight(c),c.a); }
vec4 neighbor(int index,ivec2 at) {
    ivec2 coord=clamp(at-ivec2(origin.xy)+ivec2(p[1].xy),ivec2(p[1].xy),ivec2(p[1].xy+dimensions.zw)-1);
    vec4 c;
    if (index==0) { if (p[1].z>.5) { coord.y=textureSize(second,0).y-1-coord.y; } c=texelFetch(second,coord,0); }
    else { if (p[1].w>.5) { coord.y=textureSize(third,0).y-1-coord.y; } c=texelFetch(third,coord,0); }
    return vec4(straight(c),c.a);
}
ivec2 patchOffset(int i) {
    if (i==1) return ivec2(-1,0);if (i==2) return ivec2(1,0);
    if (i==3) return ivec2(0,-1);if (i==4) return ivec2(0,1);return ivec2(0);
}
vec4 meanColor(int index) {
    vec4 sum=vec4(0);
    for (int y=0;y<4;++y) { for (int x=0;x<4;++x) {
        float jitter=float((x*13+y*7)%11-5)*.04;
        ivec2 at=ivec2(origin.xy)+ivec2(floor(vec2(float(x)+.5+jitter,float(y)+.5-jitter)*dimensions.zw/4.));
        vec4 c=ycc(index<0 ? current(at) : neighbor(index,at));sum+=vec4(c.rgb*c.a,c.a)/16.;
    } }
    return vec4(straight(sum),sum.a);
}
float patchError(int index,ivec2 at,ivec2 offset,vec4 reference[5]) {
    float error=0;
    for (int i=0;i<5;++i) { vec4 delta=ycc(neighbor(index,at+offset+patchOffset(i)))-reference[i];
        error+=(delta.x*delta.x+.25*dot(delta.yzw,delta.yzw))/5.; }
    return error;
}
void main() {
    ivec2 at=ivec2(floor(uv*dimensions.xy));
    if (any(lessThan(at,ivec2(origin.xy))) || any(greaterThanEqual(at,ivec2(origin.xy+dimensions.zw)))) { fragColor=vec4(0);return; }
    vec4 center=current(at);if (center.a==0.) { fragColor=vec4(0);return; }
    vec4 yc=ycc(center);
    if (int(geometry.z+.5)==32) {
        float luma=p[0].x,chroma=p[0].y;int radius=int(p[0].w+.5);
        float sigmaY=.01+.08*luma,sigmaC=.01+.08*chroma;vec3 sum=vec3(0);vec2 weights=vec2(0);
        for (int y=-radius;y<=radius;++y) { for (int x=-radius;x<=radius;++x) {
            vec4 c=ycc(current(at+ivec2(x,y)));vec3 delta=c.xyz-yc.xyz;float dc=dot(delta.yz,delta.yz);
            float space=exp(-float(x*x+y*y)/float(2*radius*radius))*c.a;
            float wy=space*exp(-delta.x*delta.x/(2.*sigmaY*sigmaY)-dc/.02);
            float wc=space*exp(-dc/(2.*sigmaC*sigmaC)-delta.x*delta.x/.0072);
            sum+=c.xyz*vec3(wy,wc,wc);weights+=vec2(wy,wc);
        } }
        vec3 filtered=yc.xyz+vec3(luma,chroma,chroma)*(sum/vec3(weights.x,weights.y,weights.y)-yc.xyz);
        fragColor=vec4(clamp(rgb(filtered),vec3(0),vec3(1))*center.a,center.a);return;
    }
    vec4 centerMean=meanColor(-1);vec3 sum=center.rgb;float total=1.;
    vec4 reference[5];for (int i=0;i<5;++i) { reference[i]=ycc(current(at+patchOffset(i))); }
    for (int index=0;index<2;++index) {
        if (index==0 && any(notEqual(textureSize(second,0),ivec2(p[2].xy)))) continue;
        if (index==1 && any(notEqual(textureSize(third,0),ivec2(p[2].xy)))) continue;
        vec4 delta=abs(centerMean-meanColor(index));if (delta.x+.5*(delta.y+delta.z+delta.w)>=.08) continue;
        float best=patchError(index,at,ivec2(0),reference);ivec2 offset=ivec2(0);
        for (int step=4;step>=1;step/=2) {
            ivec2 base=offset;
            for (int y=-1;y<=1;++y) { for (int x=-1;x<=1;++x) {
                ivec2 trial=clamp(base+ivec2(x,y)*step,ivec2(-4),ivec2(4));
                float cost=patchError(index,at,trial,reference)+.00001*float(trial.x*trial.x+trial.y*trial.y);
                if (cost<best) { best=cost;offset=trial; }
            } }
        }
        vec4 c=neighbor(index,at+offset);vec3 dc=abs(ycc(c).xyz-yc.xyz);float difference=max(dc.x,max(dc.y,dc.z));
        float weight=p[0].z*(1.-smoothstep(.03,.12,sqrt(patchError(index,at,offset,reference))))
            *(1.-smoothstep(.08,.2,difference))*(1.-smoothstep(.02,.1,abs(c.a-center.a)));
        sum+=c.rgb*weight;total+=weight;
    }
    fragColor=total==1. ? currentRaw(at) : vec4(clamp(sum/total,vec3(0),vec3(1))*center.a,center.a);
}
