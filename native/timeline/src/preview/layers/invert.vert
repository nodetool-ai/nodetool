#version 440
layout(location=0) in vec2 position;
layout(location=1) in vec2 texcoord;
layout(location=0) out vec2 uv;
layout(std140,binding=0) uniform buf { mat4 matrix; float flip; };
void main() {
    uv = vec2(texcoord.x, flip > 0.5 ? 1.0-texcoord.y : texcoord.y);
    gl_Position = matrix * vec4(position,0,1);
}
