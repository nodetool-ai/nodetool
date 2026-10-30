#version 440
#extension GL_GOOGLE_include_directive : require
#include "pbr_scene.glsl"
layout(binding=2) uniform sampler2D baseMap;
layout(location=2) in vec2 texcoord;
void main() { if(material.surface.w>.5 && material.surface.w<1.5 && texture(baseMap,texcoord).a*material.baseColor.a<material.surface.z) discard; }
