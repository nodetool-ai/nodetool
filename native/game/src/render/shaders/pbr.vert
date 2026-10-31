#version 440
#extension GL_GOOGLE_include_directive : require
#include "pbr_scene.glsl"
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;
layout(location=3) in vec4 color;
layout(location=0) out vec3 worldPosition;
layout(location=1) out vec3 worldNormal;
layout(location=2) out vec2 texcoord;
layout(location=3) out vec4 vertexColor;
void main() {
 vec4 world=material.model*vec4(position,1.0);
 worldPosition=world.xyz;
 worldNormal=normalize(mat3(material.normalMatrix)*normal);
 texcoord=uv;vertexColor=color;
 gl_Position=scene.viewProjection*world;
}
