#include "pbr_scene.glsl"
#include "sky_ibl.glsl"
#include "anisotropic3d.glsl"
layout(location=0) in vec3 worldPosition;
layout(location=1) in vec3 worldNormal;
layout(location=2) in vec2 texcoord;
layout(location=3) in vec4 vertexColor;
layout(location=0) out vec4 hdrColor;
#ifndef PBR_TRANSPARENT
layout(location=1) out float linearDepth;
#endif
layout(binding=2) uniform sampler2D baseMap;
layout(binding=3) uniform sampler2D normalMap;
layout(binding=4) uniform sampler2DArrayShadow directionalShadows;
layout(binding=5) uniform sampler2DArrayShadow pointShadows;
layout(binding=6) uniform sampler2D environmentSpecular;
layout(binding=7) uniform sampler2D environmentDiffuse;
layout(binding=9) uniform sampler2D dfgMap;
const float PI=3.14159265358979323846;
float sat(float x) { return clamp(x,0.0,1.0); }
vec3 schlick(vec3 f0,float dotVH) {
 float fresnel=exp2((-5.55473*dotVH-6.98316)*dotVH);
 return (1.0-f0)*fresnel+f0;
}
vec3 brdf(vec3 n,vec3 v,vec3 l,vec3 f0,float roughness) {
 vec3 h=normalize(l+v);float nl=sat(dot(n,l)),nv=sat(dot(n,v)),nh=sat(dot(n,h)),vh=sat(dot(v,h));
 float alpha=roughness*roughness,a2=alpha*alpha;
 float gv=nl*sqrt(a2+(1.0-a2)*nv*nv),gl=nv*sqrt(a2+(1.0-a2)*nl*nl);
 float visibility=.5/max(gv+gl,1e-6),denom=nh*nh*(a2-1.0)+1.0;
 float distribution=a2/(PI*denom*denom);
 vec2 dfgV=texture(dfgMap,vec2(roughness,nv)).rg,dfgL=texture(dfgMap,vec2(roughness,nl)).rg;
 vec3 fV=f0*dfgV.x+dfgV.y,fL=f0*dfgL.x+dfgL.y;
 float emsV=1.0-dfgV.x-dfgV.y,emsL=1.0-dfgL.x-dfgL.y;
 vec3 favg=f0+(1.0-f0)*.047619;
 vec3 multi=fV*fL*favg/max(vec3(1e-6),1.0-emsV*emsL*favg)*(emsV*emsL);
 return schlick(f0,vh)*(visibility*distribution)+multi;
}
vec3 normalFromMap(vec3 n) {
 if(material.flags.x<.5) return n;
 vec3 dp0=dFdx(worldPosition),dp1=dFdy(worldPosition);
 vec2 duv0=dFdx(texcoord),duv1=dFdy(texcoord);
 vec3 q1=cross(dp1,n),q0=cross(n,dp0);
 vec3 tangent=q1*duv0.x+q0*duv1.x,bitangent=q1*duv0.y+q0*duv1.y;
 float determinant=max(dot(tangent,tangent),dot(bitangent,bitangent));
 if(determinant<1e-20) return n;
 float scale=(gl_FrontFacing?1.0:-1.0)*scene.backend.y*inversesqrt(determinant);
 vec3 mapped=(material.sampling.y>.5?sampleAnisotropic16(normalMap,texcoord):texture(normalMap,texcoord)).xyz*2.0-1.0;
 // GLTFLoader 0.185.1 flips normalScale.y for primitives without TANGENT.
 // This importer convention is separate from native framebuffer derivatives.
 mapped.xy*=vec2(material.emissiveNormalScale.w,-material.emissiveNormalScale.w);
 return normalize(tangent*scale*mapped.x+bitangent*scale*mapped.y+n*mapped.z);
}
// Sampling follows Three 0.185 shadowmap_pars_fragment (MIT, licenses/three-LICENSE).
vec2 vogel(int index,float phi) {
 float radius=sqrt((float(index)+.5)/5.0),theta=float(index)*2.399963229728653+phi;
 return vec2(cos(theta),sin(theta))*radius;
}
float shadowAngle() {
 vec2 pixel=gl_FragCoord.xy;
 if(scene.backend.y<0.0) pixel.y=scene.backend.w-pixel.y;
 return fract(52.9829189*fract(dot(pixel,vec2(.06711056,.00583715))))*(2.0*PI);
}
vec3 shadowCoordinate(int index,vec3 position) {
 vec4 projected=scene.shadowMatrices[index]*vec4(position,1.0);
 vec3 p=projected.xyz/projected.w;p.xy=p.xy*.5+.5;
 if(scene.backend.x<.5) p.z=p.z*.5+.5;
 return p;
}
float shadowTap(int index,vec3 position) {
 vec3 p=shadowCoordinate(index,position);
 if(any(lessThan(p,vec3(0.0)))||any(greaterThan(p,vec3(1.0)))) return 1.0;
 vec4 layer=scene.shadowLayers[index];float result=0.0,phi=shadowAngle();
 for(int i=0;i<5;++i) {
  vec2 uv=p.xy+vogel(i,phi)*layer.z;
  result+=texture(directionalShadows,vec4(uv,layer.x,p.z+layer.w));
 }
 return result*.2;
}
int pointFace(vec3 delta) {
 vec3 a=abs(delta);
 return a.x>=a.y&&a.x>=a.z?(delta.x>=0.0?0:1):(a.y>=a.z?(delta.y>=0.0?2:3):(delta.z>=0.0?4:5));
}
float pointVisibility(int first,vec3 position,vec3 lightPosition) {
 vec3 delta=position-lightPosition, direction=normalize(delta);
 int original=first+pointFace(delta);
 vec3 coordinate=shadowCoordinate(original,position);
 if(coordinate.z<0.0 || coordinate.z>1.0) return 1.0;
 vec3 a=abs(direction),tangent=a.x>a.z?vec3(0,1,0):vec3(1,0,0);
 tangent=normalize(cross(direction,tangent));vec3 bitangent=cross(direction,tangent);
 float phi=shadowAngle(),result=0.0;vec4 layer=scene.shadowLayers[original];
 for(int i=0;i<5;++i) {
  vec2 offset=vogel(i,phi)*layer.z;
  vec3 sampleDirection=direction+tangent*offset.x+bitangent*offset.y;
  int index=first+pointFace(sampleDirection);
  vec3 p=shadowCoordinate(index,lightPosition+sampleDirection);
  result+=texture(pointShadows,vec4(p.xy,scene.shadowLayers[index].x,coordinate.z+layer.w));
 }
 return result*.2;
}
float visibility(int light,vec3 position,vec3 n,float viewDepth) {
 vec4 settings=scene.lightShadows[light];
 if(settings.x<0.0||material.flags.y<.5) return 1.0;
 int index=int(settings.x),count=int(settings.y);
 if(scene.lightPositionRange[light].w<0.0) {
   if(count>1) {
     if(viewDepth>scene.cascadeSplits[count-1]) return 1.0;
     int cascade=0;
     for(int i=0;i<4;++i) { if(i<count-1 && viewDepth>scene.cascadeSplits[i]) cascade=i+1; }
     index+=cascade;
   }
 } else {
   return pointVisibility(index,position+n*settings.z,scene.lightPositionRange[light].xyz);
 }
 return shadowTap(index,position+n*settings.z);
}
vec2 dfg(float roughness,float nv) { return texture(dfgMap,vec2(roughness,nv)).rg; }
void multiscattering(vec3 f0,vec2 fab,out vec3 singleScatter,out vec3 multiScatter) {
 singleScatter=f0*fab.x+fab.y;
 float ems=1.0-fab.x-fab.y;
 vec3 favg=f0+(1.0-f0)*.047619;
 multiScatter=singleScatter*favg/(1.0-ems*favg)*ems;
}
void main() {
 vec4 base=material.baseColor*vertexColor*(material.sampling.x>.5?sampleAnisotropic16(baseMap,texcoord):texture(baseMap,texcoord));
 if(material.surface.w>.5&&material.surface.w<1.5&&base.a<material.surface.z) discard;
 vec3 n=normalize(worldNormal);
 if(material.flags.z>.5&&!gl_FrontFacing) n=-n;
 vec3 geometryNormal=n;
 n=normalFromMap(n);
 vec3 v=normalize(scene.cameraNear.xyz-worldPosition);
 float metalness=material.surface.x;
 float geometryRoughness=max(max(abs(dFdx(geometryNormal)).x,abs(dFdx(geometryNormal)).y),max(abs(dFdx(geometryNormal)).z,max(max(abs(dFdy(geometryNormal)).x,abs(dFdy(geometryNormal)).y),abs(dFdy(geometryNormal)).z)));
 float roughness=min(1.0,max(material.surface.y,.0525)+geometryRoughness);
 vec3 diffuse=base.rgb*(1.0-metalness),f0=mix(vec3(.04),base.rgb,metalness);
 float depth=-(scene.view*vec4(worldPosition,1.0)).z;
 vec3 outgoing=material.emissiveNormalScale.xyz;
 for(int i=0;i<int(scene.ambientCount.w);++i) {
   vec4 source=scene.lightPositionRange[i];vec3 l;float attenuation=1.0;
   if(source.w<0.0) l=normalize(scene.lightDirectionDecay[i].xyz);
   else {
     vec3 delta=source.xyz-worldPosition;float distance=length(delta);l=delta/max(distance,1e-8);
     attenuation=1.0/max(pow(distance,scene.lightDirectionDecay[i].w),.01);
     attenuation*=pow(sat(1.0-pow(distance/source.w,4.0)),2.0);
   }
   vec3 irradiance=scene.lightColorIntensity[i].rgb*scene.lightColorIntensity[i].a*attenuation*sat(dot(n,l));
   irradiance*=visibility(i,worldPosition,geometryNormal,depth);
   outgoing+=irradiance*(diffuse/PI+brdf(n,v,l,f0,roughness));
 }
 // Ambient diffuse is independent of the environment's multiscattering path.
 outgoing+=diffuse*scene.ambientCount.rgb/PI;
 vec3 irradiance=vec3(0.0);
 vec3 radiance=vec3(0.0);
 if(scene.environment.x>.5) {
   irradiance+=PI*skyTextureCubeUV(environmentDiffuse,n,1.0).rgb*scene.environment.y;
   vec3 reflection=reflect(-v,n);
   reflection=normalize(mix(reflection,n,pow(roughness,4.0)));
   radiance=skyTextureCubeUV(environmentSpecular,reflection,roughness).rgb*scene.environment.y;
 }
 vec2 fab=dfg(roughness,sat(dot(n,v)));
 vec3 dielectricSingle,dielectricMulti,metallicSingle,metallicMulti;
 multiscattering(vec3(.04),fab,dielectricSingle,dielectricMulti);
 multiscattering(base.rgb,fab,metallicSingle,metallicMulti);
 vec3 singleScatter=mix(dielectricSingle,metallicSingle,metalness);
 vec3 multiScatter=mix(dielectricMulti,metallicMulti,metalness);
 vec3 dielectricTotal=dielectricSingle+dielectricMulti;
 outgoing+=radiance*singleScatter+multiScatter*irradiance/PI;
 outgoing+=diffuse*(1.0-dielectricTotal)*irradiance/PI;
 if(material.flags.w>.5) outgoing=base.rgb+material.emissiveNormalScale.xyz;
 if(scene.fogColorEnabled.w>.5) {
   float distance=length(worldPosition-scene.cameraNear.xyz),delta=scene.fogSettings.z*abs(worldPosition.y-scene.cameraNear.y);
   float average=delta<.001?1.0-delta*.5+delta*delta/6.0:(1.0-exp(-min(60.0,delta)))/delta;
   float exponent=clamp(-scene.fogSettings.z*(min(worldPosition.y,scene.cameraNear.y)-scene.fogSettings.y),-60.0,60.0);
   float opacity=min(scene.fogSettings.w,1.0-exp(-min(80.0,scene.fogSettings.x*distance*exp(exponent)*average)));
   outgoing=mix(outgoing,scene.fogColorEnabled.rgb,opacity);
 }
 // Keep HDR writes representable in the RGBA16F scene target.
 for(int channel=0;channel<3;++channel) {
   outgoing[channel]=isnan(outgoing[channel])?0.0:clamp(outgoing[channel],0.0,65504.0);
 }
 hdrColor=vec4(outgoing,material.surface.w>1.5?base.a:1.0);
#ifndef PBR_TRANSPARENT
 linearDepth=depth;
#endif
}
