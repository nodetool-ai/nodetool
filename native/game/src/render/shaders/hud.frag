#version 440
layout(location=0) in vec2 vUv;
layout(binding=1) uniform sampler2D hud;
layout(location=0) out vec4 fragColor;
void main() { fragColor=texture(hud,vUv); }
