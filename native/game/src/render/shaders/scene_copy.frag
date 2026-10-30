#version 440
layout(std140,binding=0) uniform Copy { mat4 correction;vec4 parameters; } copy;
layout(binding=1) uniform sampler2D source;
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
void main() { color=texture(source,vec2(uv.x,copy.parameters.x>.5?1.0-uv.y:uv.y)); }
