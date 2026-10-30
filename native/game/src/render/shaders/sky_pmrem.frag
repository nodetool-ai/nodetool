#version 440
#extension GL_GOOGLE_include_directive : require
// Exact 256-sample GGX VNDF filter from three@0.185.1 PMREMGenerator.js.
// Copyright 2010-2026 three.js authors. MIT: ../Sky3D-LICENSE.txt.
#include "sky_ibl.glsl"
layout(location=0) in vec3 direction;
layout(location=0) out vec4 color;
layout(std140,binding=0) uniform Params{vec4 settings;};
layout(binding=1) uniform sampler2D source;
float radicalInverse(uint bits){bits=(bits<<16u)|(bits>>16u);bits=((bits&0x55555555u)<<1u)|((bits&0xAAAAAAAAu)>>1u);bits=((bits&0x33333333u)<<2u)|((bits&0xCCCCCCCCu)>>2u);bits=((bits&0x0F0F0F0Fu)<<4u)|((bits&0xF0F0F0F0u)>>4u);bits=((bits&0x00FF00FFu)<<8u)|((bits&0xFF00FF00u)>>8u);return float(bits)*2.3283064365386963e-10;}
void main(){vec3 N=normalize(direction);float roughness=settings.z;if(roughness<.001){color=vec4(skyBilinearCubeUV(source,N,settings.y),1);return;}
 vec3 up=abs(N.z)<.999?vec3(0,0,1):vec3(1,0,0),tangent=normalize(cross(up,N)),bitangent=cross(N,tangent),sum=vec3(0);float weight=0,alpha=roughness*roughness;
 for(uint i=0u;i<256u;++i){vec2 Xi=vec2(float(i)/256.0,radicalInverse(i));float r=sqrt(Xi.x),phi=6.28318530718*Xi.y,t1=r*cos(phi),t2=r*sin(phi);vec3 nh=vec3(t1,t2,sqrt(max(0.0,1.0-t1*t1-t2*t2)));vec3 hTangent=normalize(vec3(alpha*nh.xy,max(0.0,nh.z)));vec3 H=normalize(tangent*hTangent.x+bitangent*hTangent.y+N*hTangent.z),L=normalize(2.0*dot(N,H)*H-N);float cosine=max(dot(N,L),0.0);if(cosine>0.0){sum+=skyBilinearCubeUV(source,L,settings.y)*cosine;weight+=cosine;}}
 color=vec4(weight>0.0?sum/weight:sum,1);
}
