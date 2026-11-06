#version 440
layout(location=0) in vec2 uv;
layout(location=0) out vec4 color;
layout(binding=1) uniform sampler2D source;
void main() {
    vec4 c = texture(source,uv);
    color = vec4(vec3(c.a)-c.rgb,c.a);
}
