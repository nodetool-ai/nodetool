#version 440
layout(location=0) in vec3 position;
layout(location=1) in vec4 color;
layout(location=2) in vec2 uv;
layout(location=0) out vec4 vColor;
layout(location=1) out vec2 vUv;
layout(location=2) out vec4 shadowPosition;
layout(std140,binding=0) uniform Camera { mat4 viewProjection;mat4 lightProjection;vec4 shadowParameters; };
void main() { vColor=color;vUv=uv;shadowPosition=lightProjection*vec4(position,1.0);gl_Position=viewProjection*vec4(position,1.0); }
