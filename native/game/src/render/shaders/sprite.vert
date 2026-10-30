#version 440
layout(location=0) in vec2 position;
layout(location=1) in vec2 texcoord;
layout(location=2) in vec4 color;
layout(location=3) in vec3 worldUnlit;
layout(location=0) out vec2 uv;
layout(location=1) out vec4 tint;
layout(location=2) out vec3 world;
void main() { gl_Position=vec4(position,0,1); uv=texcoord; tint=color; world=worldUnlit; }
