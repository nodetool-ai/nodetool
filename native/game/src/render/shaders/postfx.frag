// Adapted from pinned Three UnrealBloomPass, OutputShader and AgX shader chunks.
// See native/game/assets/SMAA.md and native/game/licenses/three-LICENSE.
#version 440
layout(location=0) in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(std140,binding=0) uniform Params { mat4 clipCorrection;vec4 metrics;vec4 p0;vec4 p1;vec4 p2;vec4 weights[22]; };
layout(binding=1) uniform sampler2D t0;
layout(binding=2) uniform sampler2D t1;
layout(binding=3) uniform sampler2D t2;
layout(binding=4) uniform sampler2D t3;
layout(binding=5) uniform sampler2D t4;
vec4 sampleRT(sampler2D tex,vec2 uv){return texture(tex,vec2(uv.x,metrics.z>0.5?uv.y:1.0-uv.y));}
vec3 agx(vec3 color){
 const mat3 to2020=mat3(vec3(.6274,.0691,.0164),vec3(.3293,.9195,.0880),vec3(.0433,.0113,.8956));
 const mat3 toSRGB=mat3(vec3(1.6605,-.1246,-.0182),vec3(-.5876,1.1329,-.1006),vec3(-.0728,-.0083,1.1187));
 const mat3 inset=mat3(vec3(.856627153315983,.137318972929847,.11189821299995),vec3(.0951212405381588,.761241990602591,.0767994186031903),vec3(.0482516061458583,.101439036467562,.811302368396859));
 const mat3 outset=mat3(vec3(1.1271005818144368,-.1413297634984383,-.14132976349843826),vec3(-.11060664309660323,1.157823702216272,-.11060664309660294),vec3(-.016493938717834573,-.016493938717834257,1.2519364065950405));
 color=inset*(to2020*(color*p1.y));
 color=clamp((log2(max(color,vec3(1e-10)))+12.47393)/(4.026069+12.47393),0.0,1.0);
 vec3 x2=color*color,x4=x2*x2;
 color=15.5*x4*x2-40.14*x4*color+31.96*x4-6.868*x2*color+.4298*x2+.1191*color-.00232;
 color=outset*color;
 return clamp(toSRGB*pow(max(vec3(0.0),color),vec3(2.2)),0.0,1.0);
}
vec3 srgb(vec3 value){return mix(pow(value,vec3(.41666))*1.055-vec3(.055),value*12.92,lessThanEqual(value,vec3(.0031308)));}
void main(){
 int operation=int(p0.x);
 if(operation==0){vec4 texel=sampleRT(t0,vUv);float l=dot(texel.rgb,vec3(.2126,.7152,.0722));outColor=texel*smoothstep(p1.x,p1.x+p2.w,l);}
 else if(operation==1){vec3 sum=sampleRT(t0,vUv).rgb*weights[0].x;for(int i=1;i<22;i++){if(i>=int(p0.y))break;vec2 offset=p0.zw*metrics.xy*float(i);sum+=(sampleRT(t0,vUv+offset).rgb+sampleRT(t0,vUv-offset).rgb)*weights[i].x;}outColor=vec4(sum,1.0);}
 else if(operation==2){vec3 bloom=vec3(0.0);float factors[5]=float[5](1.,.8,.6,.4,.2);bloom+=mix(factors[0],1.2-factors[0],p1.w)*sampleRT(t0,vUv).rgb;bloom+=mix(factors[1],1.2-factors[1],p1.w)*sampleRT(t1,vUv).rgb;bloom+=mix(factors[2],1.2-factors[2],p1.w)*sampleRT(t2,vUv).rgb;bloom+=mix(factors[3],1.2-factors[3],p1.w)*sampleRT(t3,vUv).rgb;bloom+=mix(factors[4],1.2-factors[4],p1.w)*sampleRT(t4,vUv).rgb;bloom*=3.0*p1.z;outColor=vec4(bloom,max(bloom.r,max(bloom.g,bloom.b)));}
 else if(operation==3){outColor=sampleRT(t0,vUv)+sampleRT(t1,vUv);}
 else if(operation==4){vec4 texel=sampleRT(t0,vUv);outColor=vec4(srgb(agx(texel.rgb)),texel.a);}
 else {vec4 texel=sampleRT(t0,vUv);float d=length(vUv-vec2(.5))*1.41421356;float shade=smoothstep(p2.y,p2.y+p2.z,d);outColor=vec4(texel.rgb*(1.0-p2.x*shade),texel.a);}
}
