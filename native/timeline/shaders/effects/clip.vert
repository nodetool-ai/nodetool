#version 440
layout(location=0) in vec2 position;
layout(location=1) in vec2 texcoord;
layout(location=0) out vec2 uv;
layout(std140,binding=0) uniform buf {
    mat4 matrix;
    mat4 colorMatrix;
    vec4 geometry; // input flip, input format, operation, unused
    vec4 sourceRect; // extraction in source pixels, or copy-back destination
    vec4 dimensions; // source width/height, logical crop width/height
    vec4 origin; // logical origin in a padded working surface
    vec4 p[4];
};
void main() {
    uv=texcoord;
    gl_Position=matrix*vec4(position,0,1);
}
