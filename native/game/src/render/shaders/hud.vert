#version 440
layout(location=0) in vec2 position;
layout(location=1) in vec2 uv;
layout(location=0) out vec2 vUv;
void main() { vUv=uv; gl_Position=vec4(position,0.0,1.0); }
