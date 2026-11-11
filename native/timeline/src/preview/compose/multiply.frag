#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
layout(std140,binding=0) uniform buf { mat4 matrix; vec4 flipsBorder; vec4 sizes; };
layout(binding=1) uniform sampler2D backdrop;
layout(binding=2) uniform sampler2D layer;
void main() {
    vec4 b = texture(backdrop, vec2(uv.x, flipsBorder.x > 0.5 ? 1.0-uv.y : uv.y));
    vec4 l = texture(layer, vec2(uv.x, flipsBorder.y > 0.5 ? 1.0-uv.y : uv.y));
    color = l*b + l*(1.0-b.a) + b*(1.0-l.a);
}
