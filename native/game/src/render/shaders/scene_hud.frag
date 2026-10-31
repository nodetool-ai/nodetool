#version 440
layout(binding=1) uniform sampler2D source;
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
void main() { color=texture(source,uv); }
