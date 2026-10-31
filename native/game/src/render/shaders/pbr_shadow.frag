#version 440
#extension GL_GOOGLE_include_directive : require
#include "pbr_scene.glsl"
layout(binding=2) uniform sampler2D baseMap;
layout(location=2) in vec2 texcoord;
layout(location=3) in float vertexAlpha;
void main() { if(material.surface.w>.5 && material.surface.w<1.5 && texture(baseMap,texcoord).a*material.baseColor.a*vertexAlpha<material.surface.z) discard; }
