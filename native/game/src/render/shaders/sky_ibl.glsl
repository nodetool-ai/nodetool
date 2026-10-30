// three@0.185.1 cube_uv_reflection_fragment.glsl.js and
// envmap_physical_pars_fragment.glsl.js. Copyright 2010-2026 three.js authors.
// MIT license: ../Sky3D-LICENSE.txt. Constants and roughness mapping match PMREMGenerator.
#ifndef NODETOOL_SKY_IBL
#define NODETOOL_SKY_IBL
float skyFace(vec3 d){vec3 a=abs(d);if(a.x>a.z){return a.x>a.y?(d.x>0.0?0.0:3.0):(d.y>0.0?1.0:4.0);}return a.z>a.y?(d.z>0.0?2.0:5.0):(d.y>0.0?1.0:4.0);}
vec2 skyUV(vec3 d,float f){vec2 uv;if(f==0.0){uv=d.zy/abs(d.x);}else if(f==1.0){uv=vec2(-d.x,-d.z)/abs(d.y);}else if(f==2.0){uv=vec2(-d.x,d.y)/abs(d.z);}else if(f==3.0){uv=vec2(-d.z,d.y)/abs(d.x);}else if(f==4.0){uv=vec2(-d.x,d.z)/abs(d.y);}else{uv=d.xy/abs(d.z);}return .5*(uv+1.0);}
vec3 skyBilinearCubeUV(sampler2D map,vec3 direction,float mip){float face=skyFace(direction),filterIndex=max(4.0-mip,0.0);mip=max(mip,4.0);float size=exp2(mip);vec2 uv=skyUV(direction,face)*(size-2.0)+1.0;if(face>2.0){uv.y+=size;face-=3.0;}uv.x+=face*size+filterIndex*48.0;uv.y+=4.0*(256.0-size);return texture(map,uv/vec2(768.0,1024.0)).rgb;}
float skyRoughnessToMip(float roughness){if(roughness>=.8){return (1.0-roughness)/.2-2.0;}if(roughness>=.4){return (.8-roughness)*3.0/.4-1.0;}if(roughness>=.305){return (.4-roughness)/.095+2.0;}if(roughness>=.21){return (.305-roughness)/.095+3.0;}return -2.0*log2(max(1.16*roughness,1e-10));}
vec4 skyTextureCubeUV(sampler2D map,vec3 direction,float roughness){float mip=clamp(skyRoughnessToMip(roughness),-2.0,8.0),fraction=fract(mip),integer=floor(mip);vec3 a=skyBilinearCubeUV(map,direction,integer);if(fraction==0.0){return vec4(a,1.0);}return vec4(mix(a,skyBilinearCubeUV(map,direction,integer+1.0),fraction),1.0);}
vec3 skyCubeDirection(vec2 uv,int face){vec2 p=2.0*uv-1.0;if(face==0){return vec3(1.0,p.y,p.x);}if(face==1){return vec3(-p.x,1.0,-p.y);}if(face==2){return vec3(-p.x,p.y,1.0);}if(face==3){return vec3(-1.0,p.y,-p.x);}if(face==4){return vec3(-p.x,-1.0,p.y);}return vec3(p.x,p.y,-1.0);}
#endif
