#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 fragColor;
layout(std140,binding=0) uniform buf {
    mat4 matrix;
    mat4 colorMatrix;
    vec4 geometry;
    vec4 sourceRect;
    vec4 dimensions;
    vec4 origin;
    vec4 p[4];
};
layout(binding=1) uniform sampler2D source;
layout(binding=2) uniform sampler2D second;
layout(binding=3) uniform sampler2D third;

vec2 oriented(vec2 v) { return vec2(v.x,geometry.x>0.5 ? 1-v.y : v.y); }
vec4 readSource(vec2 v) { return texture(source,oriented(v)); }
vec4 loadSource(ivec2 c) {
    c=clamp(c,ivec2(0),ivec2(dimensions.xy)-1);
    if (geometry.x>0.5) { c.y=int(dimensions.y)-1-c.y; }
    return texelFetch(source,c,0);
}
vec3 straight(vec4 c) { return c.rgb/max(c.a,1.0/255.0); }
vec3 rgb2hsv(vec3 rgb) {
    float maxC=max(max(rgb.r,rgb.g),rgb.b), minC=min(min(rgb.r,rgb.g),rgb.b);
    float delta=maxC-minC, h=0, s=0;
    if (delta>0.00001) {
        s=delta/maxC;
        if (maxC==rgb.r) { h=(rgb.g-rgb.b)/delta; if (rgb.g<rgb.b) { h+=6; } }
        else if (maxC==rgb.g) { h=2+(rgb.b-rgb.r)/delta; }
        else { h=4+(rgb.r-rgb.g)/delta; }
        h/=6;
    }
    return vec3(h,s,maxC);
}
vec3 hsv2rgb(vec3 hsv) {
    float h=hsv.x*6, i=floor(h), f=h-i;
    float a=hsv.z*(1-hsv.y), b=hsv.z*(1-hsv.y*f), c=hsv.z*(1-hsv.y*(1-f));
    int idx=int(i)%6;
    if (idx==0) return vec3(hsv.z,c,a);
    if (idx==1) return vec3(b,hsv.z,a);
    if (idx==2) return vec3(a,hsv.z,c);
    if (idx==3) return vec3(a,b,hsv.z);
    if (idx==4) return vec3(c,a,hsv.z);
    return vec3(hsv.z,a,b);
}
float hash31(ivec2 cell,uint seed) {
    uint h=(uint(cell.x)*1597334677u)^(uint(cell.y)*3812015801u)^(seed*2798796415u);
    h=(h^(h>>16u))*2246822519u; h=(h^(h>>13u))*3266489917u; h=h^(h>>16u);
    return float(h>>8u)/16777216.0;
}
float gaussAt(ivec2 cell,uint seed) { return (hash31(cell,seed)+hash31(cell,seed+1013u)+hash31(cell,seed+3037u)-1.5)*2; }
float softenedNoise(vec2 v,uint seed,float softness) {
    ivec2 center=ivec2(floor(v+0.5));
    float sigma=0.7+softness*0.3, falloff=0.5/(sigma*sigma), boundary=exp(-4*falloff), sum=0, energy=0;
    for (int y=-2;y<=2;++y) { for (int x=-2;x<=2;++x) {
        ivec2 cell=center+ivec2(x,y);
        vec2 jitter=vec2(hash31(cell,seed+4001u),hash31(cell,seed+8089u))-0.5;
        vec2 delta=v-(vec2(cell)+jitter);
        float weight=max(0,exp(-(delta.x*delta.x+delta.y*delta.y)*falloff)-boundary);
        sum+=gaussAt(cell,seed)*weight; energy+=weight*weight;
    } }
    return sum/sqrt(energy);
}
float grainAt(vec2 v,uint seed,float roughness,float softness) {
    vec2 coarse=vec2(v.x*0.8-v.y*0.6,v.x*0.6+v.y*0.8);
    vec2 fine=vec2(v.x*0.9238795+v.y*0.3826834,-v.x*0.3826834+v.y*0.9238795)*2;
    return (softenedNoise(coarse,seed,softness)+roughness*softenedNoise(fine+vec2(17,29),seed+7919u,softness))/sqrt(1+roughness*roughness);
}
float softLight(float base,float blend) {
    if (blend<=0.5) return base-(1-2*blend)*base*(1-base);
    float d=sqrt(base);
    if (base<=0.25) d=((16*base-12)*base+4)*base;
    return base+(2*blend-1)*(d-base);
}
// packages/gpu/src/shaders/filters/visualFx/v1, with the optional mask at full coverage.
float visualHash(vec2 v) {
    uint x=uint(int(v.x)), y=uint(int(v.y));
    uint n=x*374761393u+y*668265263u+2246822519u;
    n=(n^(n>>13u))*1274126177u;
    n=n^(n>>16u);
    return float(n&16777215u)/16777215.0;
}
float visualNoise(vec2 v) {
    vec2 i=floor(v), f=fract(v), u=f*f*(vec2(3)-2*f);
    return mix(mix(visualHash(i),visualHash(i+vec2(1,0)),u.x),
               mix(visualHash(i+vec2(0,1)),visualHash(i+vec2(1)),u.x),u.y);
}
float visualFbm(vec2 v) {
    float n=0, amp=0.5;
    vec2 q=v;
    for (int k=0;k<5;++k) {
        n=n+amp*visualNoise(q);
        q=q*2.03+vec2(11.7,5.3);
        amp=amp*0.5;
    }
    return n;
}
vec4 visualSample(vec2 v) { return readSource(clamp(v,vec2(0),vec2(1))); }
vec4 visualFx(vec2 v) {
    int mode=int(round(p[0].x));
    float strength=max(0,p[0].y), scale=max(1,p[0].z), angle=p[0].w;
    float time=p[1].x, seed=p[1].y, softness=p[1].z;
    vec4 colorA=p[2], colorB=p[3];
    vec4 src=visualSample(v), result=src;
    vec2 dims=dimensions.xy, q=v-vec2(0.5);
    if (mode==0) {
        vec2 delta=vec2(cos(angle),sin(angle))*strength/dims;
        vec4 red=visualSample(v+delta), blue=visualSample(v-delta);
        result=vec4(red.r/max(red.a,1.0/255.0)*src.a,src.g,
                    blue.b/max(blue.a,1.0/255.0)*src.a,src.a);
    } else if (mode==1 || mode==2) {
        vec4 sum=vec4(0);
        for (int i=0;i<13;++i) {
            float t=(float(i)-6)/6;
            if (mode==1) {
                float theta=t*strength*8/max(dims.x,dims.y);
                vec2 rotated=vec2(q.x*cos(theta)-q.y*sin(theta),q.x*sin(theta)+q.y*cos(theta));
                sum=sum+visualSample(vec2(0.5)+rotated);
            } else { sum=sum+visualSample(v+q*t*strength/dims*8); }
        }
        result=sum/13;
    } else if (mode==3 || mode==4 || mode==12) {
        float field=visualFbm(v*scale+vec2(time,seed));
        float displacement=(field-0.5)*strength*20;
        if (mode==4) {
            float row=floor(v.y*scale*8);
            displacement=(visualHash(vec2(row,floor(time*24)+seed))-0.5)*strength*40;
        }
        result=visualSample(v+vec2(displacement/dims.x,mode==4 ? 0 : displacement*0.3/dims.y));
    } else if (mode==5) {
        float luma=dot(src.rgb/max(src.a,0.00392),vec3(0.2126,0.7152,0.0722));
        vec2 cell=fract(v*dims/scale)-vec2(0.5);
        float dotRadius=sqrt(max(0,1-luma))*0.62;
        float ink=1-smoothstep(dotRadius-0.08,dotRadius+0.08,length(cell));
        result=vec4(vec3(1-ink)*src.a,src.a);
    } else if (mode==6) {
        float jitter=(visualHash(floor(v*dims)+vec2(seed))-0.5)*strength*2/255;
        result=vec4(clamp(src.rgb+vec3(jitter*src.a),vec3(0),vec3(src.a)),src.a);
    } else if (mode==7 || mode==8) {
        float a=atan(q.y,q.x);
        float beam=pow(max(0,cos((a-angle)*(mode==8 ? 2 : 8))),24);
        float falloff=1/(1+length(q*vec2(1,mode==8 ? 8 : 1))*scale);
        float light=clamp(beam*falloff*strength,0,1);
        result=vec4(src.rgb+(vec3(src.a)-src.rgb)*light*colorB.rgb,src.a);
    } else if (mode>=9 && mode<=11) {
        vec2 reach=scale/dims;
        float shifted=visualSample(v+vec2(cos(angle),sin(angle))*reach).a;
        float around=min(min(visualSample(v+vec2(reach.x,0)).a,visualSample(v-vec2(reach.x,0)).a),
                         min(visualSample(v+vec2(0,reach.y)).a,visualSample(v-vec2(0,reach.y)).a));
        float edge=clamp(src.a-(mode==10 ? around : shifted),0,1)*strength;
        if (mode==9) { result=vec4(mix(src.rgb,colorB.rgb*src.a,clamp(edge,0,1)),src.a); }
        else { result=vec4(src.rgb+(vec3(src.a)-src.rgb)*clamp(edge,0,1)*colorB.rgb,src.a); }
    } else if (mode==13) {
        float field=v.x;
        if (time<0.5) {
            vec2 direction=vec2(cos(angle),sin(angle));
            field=abs(direction.y)>0.5 ? (direction.y>0 ? 1-v.y : v.y) : (direction.x>0 ? 1-v.x : v.x);
        } else if (time<1.5) { field=distance(v,vec2(0.5))/0.70710678; }
        else { field=clamp(visualFbm(v*scale+vec2(seed)),0,1); }
        float feather=max(0.001,softness), edge=strength*(1+feather);
        float reveal=1-smoothstep(edge-feather,edge,field);
        result=src*reveal;
    } else if (mode==14) {
        vec2 center=vec2(0.5+sin(time*6.2831853+seed)*0.3,0.3);
        float light=exp(-distance(v,center)*scale*3)*strength;
        result=vec4(src.rgb+(vec3(src.a)-src.rgb)*light*colorB.rgb,src.a);
    } else if (mode>=15) {
        float value=0;
        if (mode==15) { value=visualHash(floor(v*dims/scale)+vec2(seed,floor(time*24))); }
        else if (mode==16) { value=visualFbm(v*scale+vec2(time,seed)); }
        else if (mode==17) { value=fract(atan(q.y,q.x)/6.2831853+angle/6.2831853+1); }
        else if (mode==18) { value=0.5+0.25*sin(v.x*scale+time)+0.25*cos(v.y*scale*0.7-time); }
        else if (mode==19) { value=visualFbm(v*scale+vec2(time*0.3,-time*0.2)); }
        else if (mode==20) {
            vec2 cell=floor(v*scale), local=fract(v*scale);
            vec2 center=vec2(visualHash(cell+vec2(seed)),visualHash(cell+vec2(seed+17)));
            center.y=fract(center.y+time*(0.1+center.x*0.2));
            value=pow(1-smoothstep(0,0.15,distance(local,center)),2);
        } else if (mode==21) {
            vec2 center=vec2(0.5+sin(time*0.7+seed)*0.6,0.2);
            value=exp(-distance(v,center)*scale*0.5);
        } else {
            vec2 grid=fract(v*scale);
            value=min(min(grid.x,grid.y),min(1-grid.x,1-grid.y))<0.04 ? 1 : 0;
        }
        result=mix(colorA,colorB,clamp(value*strength,0,1));
    }
    return vec4(clamp(result.rgb,vec3(0),vec3(result.a)),result.a);
}
void main() {
    int op=int(geometry.z+0.5);
    vec2 pixel=floor(uv*dimensions.xy);
    vec2 logical=(uv*dimensions.xy-origin.xy)/dimensions.zw;
    vec4 src=readSource(uv);
    vec3 rgb=straight(src);
    if (op==21) { fragColor=visualFx(uv); return; }
    if (op==0) {
        // Extract a crop and pad it, or copy its processed window back into
        // the input-sized output. sourceRect is in destination pixels for back-copy.
        vec2 coord=uv*origin.zw-sourceRect.xy;
        bool inside=all(greaterThanEqual(coord,vec2(0))) && all(lessThan(coord,sourceRect.zw));
        vec2 samplePx=coord+origin.xy;
        vec2 suv=clamp(samplePx,origin.xy+0.5,origin.xy+sourceRect.zw-0.5)/dimensions.xy;
        vec4 c=readSource(suv);
        if (geometry.y>0.5) {
            vec2 v=oriented(suv);
            vec2 cbcr=geometry.y<1.5 ? vec2(texture(second,v).r,texture(third,v).r) : texture(second,v).rg;
            c=vec4(clamp((colorMatrix*vec4(c.r,cbcr,1)).rgb,0,1),1);
        }
        fragColor=inside ? c : vec4(0); return;
    }
    if (op==1) {
        if (abs(p[0].x)>0.001) rgb=clamp(rgb+p[0].x,0,1);
        if (abs(p[0].y-1)>0.001) rgb=clamp((rgb-0.5)*p[0].y+0.5,0,1);
        if (abs(p[0].z-1)>0.001) rgb=clamp(mix(vec3(dot(rgb,vec3(0.299,0.587,0.114))),rgb,p[0].z),0,1);
        if (abs(p[0].w)>0.001) { vec3 hsv=rgb2hsv(rgb); hsv.x=fract(hsv.x+p[0].w/360); rgb=hsv2rgb(hsv); }
        float temp=p[1].x;
        if (abs(temp)>0.001) {
            if (temp>0) rgb=vec3(min(1,rgb.r+temp*0.2),min(1,rgb.g+temp*0.1),max(0,rgb.b-temp*0.2));
            else rgb=vec3(max(0,rgb.r+temp*0.2),max(0,rgb.g+temp*0.05),min(1,rgb.b-temp*0.2));
        }
        if (abs(p[1].y)>0.001) rgb=clamp(rgb+p[1].y*vec3(0.1,-0.2,0.1),0,1);
        if (abs(p[1].z)>0.001 || abs(p[1].w)>0.001) {
            float lum=dot(rgb,vec3(0.299,0.587,0.114));
            float adj=p[1].z*(1-smoothstep(0,0.33,lum))*0.3+p[1].w*smoothstep(0.66,1,lum)*0.3;
            rgb=clamp(rgb+adj,0,1);
        }
    } else if (op==2) {
        if (p[0].x<0.5) { fragColor=src; return; }
        int radius=int(min(p[0].x,20)); float spacing=max(1,p[0].x/20), sigma=p[0].y<=0 ? p[0].x/3 : p[0].y;
        vec4 sum=vec4(0); float weights=0;
        for (int i=-radius;i<=radius;++i) {
            float distance=float(i)*spacing;
            ivec2 offset=ivec2(round(p[0].zw*distance));
            float w=exp(-(distance*distance)/(2*sigma*sigma))/(sqrt(2*3.14159265)*sigma);
            sum+=loadSource(ivec2(pixel)+offset)*w; weights+=w;
        }
        fragColor=sum/weights; return;
    } else if (op==3) {
        float cell=max(1,p[0].x);
        vec2 snapped=(floor(logical*dimensions.zw/cell)+0.5)*cell;
        fragColor=readSource((snapped+origin.xy)/dimensions.xy); return;
    } else if (op==4) {
        float n=clamp(p[0].x,2,256); rgb=clamp(floor(clamp(rgb,0,1)*n)/(n-1),0,1);
        // The export stores 0.5 as byte 128. Resolve UNORM midpoint ties
        // before the render target conversion, which differs between drivers.
        fragColor=floor(vec4(rgb*src.a,src.a)*255+0.5)/255; return;
    } else if (op==5) {
        vec2 centered=(logical-0.5)*2; float r2=dot(centered,centered);
        vec2 warped=centered*(1-p[0].x*(1-r2))*0.5+0.5;
        bool inside=r2<1;
        vec2 s=inside ? warped : logical;
        fragColor=readSource((s*dimensions.zw+origin.xy)/dimensions.xy);
        if (inside && (any(lessThan(warped,vec2(0))) || any(greaterThan(warped,vec2(1))))) fragColor=vec4(0);
        return;
    } else if (op==6) {
        float inner=max(0,p[0].y-p[0].z), outer=max(inner+0.001,p[0].y);
        float t=clamp((length(logical*2-1)-inner)/(outer-inner),0,1);
        fragColor=vec4(src.rgb*(1-p[0].x*t*t*(3-2*t)),src.a); return;
    } else if (op==7) {
        vec4 sum=vec4(0);
        for (int j=-1;j<=1;++j) { for (int i=-1;i<=1;++i) { sum+=loadSource(ivec2(pixel)+ivec2(i,j)); } }
        vec3 diff=rgb-straight(sum/9);
        float mask=step(p[0].y,abs(dot(diff,vec3(0.299,0.587,0.114))));
        rgb=clamp(rgb+diff*p[0].x*mask,0,1);
    } else if (op==8) {
        // A separate RGBA8 ToStraight pass bridges the keyer's input contract.
        rgb=src.rgb;
        float dist=length(rgb-p[0].xyz), t=clamp((dist-p[0].w)/max(p[1].x,0.001),0,1);
        float mask=t*t*(3-2*t);
        if (p[1].y>0.001) {
            float other=(rgb.r+rgb.g+rgb.b-max(rgb.r,max(rgb.g,rgb.b)))*0.5;
            float strength=p[1].y*(1-mask);
            if (p[0].y>max(p[0].x,p[0].z)) rgb.g=mix(rgb.g,min(rgb.g,other),strength);
            else if (p[0].z>max(p[0].x,p[0].y)) rgb.b=mix(rgb.b,min(rgb.b,other),strength);
            else if (p[0].x>max(p[0].y,p[0].z)) rgb.r=mix(rgb.r,min(rgb.r,other),strength);
        }
        float a=src.a*mask; fragColor=vec4(rgb*a,a); return;
    } else if (op==9) {
        rgb=clamp((rgb-p[0].x)/max(0.001,p[0].y-p[0].x),0,1);
        rgb+=p[0].z*(1-rgb)*rgb;
        rgb=pow(max(rgb,vec3(0)),vec3(1/max(0.01,1+p[0].w)));
        rgb+=p[1].x*rgb*(1-rgb);
        rgb=pow(max(rgb,vec3(0)),1/max(vec3(0.01),1+p[1].yzw));
    } else if (op==10) {
        rgb=pow(clamp((rgb-p[0].x)/max(1.0/255.0,p[0].z-p[0].x),0,1),vec3(1/max(0.01,p[0].y)));
    } else if (op==11) {
        rgb=clamp(rgb*p[0].x+p[0].y,0,1);
    } else if (op==12) {
        rgb=pow(max((rgb+p[0].xyz)*p[2].xyz,vec3(0)),1/max(p[1].xyz,vec3(0.01)));
    } else if (op==13) {
        if (src.a<=0 || p[0].x<=0) { fragColor=src; return; }
        uint seed=uint(p[0].w-8192*floor(p[0].w/8192));
        vec2 v=(pixel-origin.xy)/max(p[0].y,1)*1.75;
        float rough=clamp(p[1].x,0,1), soft=clamp(p[1].y,0,1);
        float mono=grainAt(v,seed,rough,soft); vec3 n=vec3(mono);
        if (p[0].z>0) {
            vec3 per=vec3(grainAt(v,seed+131u,rough,soft),grainAt(v,seed+262u,rough,soft),grainAt(v,seed+393u,rough,soft));
            n+=(per-n)*clamp(p[0].z,0,1);
        }
        rgb=src.rgb/src.a;
        float lum=dot(rgb,vec3(0.2126,0.7152,0.0722));
        float response=smoothstep(0.02,0.28,lum)*(1-smoothstep(0.72,1,lum));
        vec3 blend=clamp(0.5+n*clamp(p[0].x,0,1)*0.2*response,0,1);
        rgb=vec3(softLight(rgb.r,blend.r),softLight(rgb.g,blend.g),softLight(rgb.b,blend.b));
    } else if (op==14) {
        int size=int(p[0].y+0.5);
        vec3 coordinate=clamp((rgb-p[1].xyz)/max(p[2].xyz-p[1].xyz,vec3(0.000001)),0,1)*float(size-1);
        ivec3 lo=ivec3(floor(coordinate)), hi=min(lo+1,ivec3(size-1)); vec3 f=fract(coordinate), graded=vec3(0);
        for (int bz=0;bz<=1;++bz) { for (int gy=0;gy<=1;++gy) { for (int rx=0;rx<=1;++rx) {
            int r=rx==1 ? hi.x : lo.x, g=gy==1 ? hi.y : lo.y, b=bz==1 ? hi.z : lo.z;
            float weight=(rx==1 ? f.x : 1-f.x)*(gy==1 ? f.y : 1-f.y)*(bz==1 ? f.z : 1-f.z);
            graded+=texelFetch(second,ivec2(b*size+r,g),0).rgb*weight;
        } } }
        rgb=mix(rgb,graded,clamp(p[0].x,0,1));
    } else if (op==15) {
        float t=smoothstep(p[0].x-max(p[0].y,0.0001),p[0].x+max(p[0].y,0.0001),dot(rgb,vec3(0.299,0.587,0.114)));
        fragColor=src*t; return;
    } else if (op==16) { fragColor=vec4(0,0,0,src.a); return; }
    else if (op==17) { fragColor=clamp(src+texture(second,oriented(uv))*p[0].x,0,1); return; }
    else if (op==18) {
        vec2 shadowUv=uv-p[1].xy/dimensions.xy;
        float a=texture(second,oriented(shadowUv)).a;
        if (any(lessThan(shadowUv,vec2(0))) || any(greaterThan(shadowUv,vec2(1)))) a=0;
        float cov=clamp(a*p[0].w,0,1);
        fragColor=src+vec4(p[0].xyz*cov,cov)*(1-src.a); return;
    } else if (op==19) { fragColor=src.a<=0 ? vec4(0) : vec4(src.rgb/src.a,src.a); return; }
    else if (op==20) { fragColor=vec4(src.rgb*src.a,src.a); return; }
    fragColor=vec4(clamp(rgb,0,1)*src.a,src.a);
}
