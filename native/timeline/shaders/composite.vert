#version 440

// One textured quad. `mvp` places it: a layer's transform on the canvas, or
// the letterbox fit of the canvas in the item.
layout(location = 0) in vec2 position;
layout(location = 1) in vec2 texcoord;

layout(location = 0) out vec2 v_texcoord;

layout(std140, binding = 0) uniform buf {
    mat4 mvp;
    mat4 colorMatrix;
    float opacity;
    float flipV;
    float mode;
};

void main()
{
    v_texcoord = vec2(texcoord.x, flipV > 0.5 ? 1.0 - texcoord.y : texcoord.y);
    gl_Position = mvp * vec4(position, 0.0, 1.0);
}
