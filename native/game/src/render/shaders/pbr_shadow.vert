#version 440
#extension GL_GOOGLE_include_directive : require
#include "pbr_scene.glsl"
layout(std140,binding=8) uniform Pass { mat4 matrix; } pass;
layout(location=0) in vec3 position;
layout(location=2) in vec2 uv;
layout(location=3) in vec4 color;
layout(location=3) out float vertexAlpha;
layout(location=2) out vec2 texcoord;
void main() { texcoord=uv;vertexAlpha=color.a;gl_Position=pass.matrix*material.model*vec4(position,1.0); }
