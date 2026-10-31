#version 440
layout(location=0) in vec3 position;
layout(location=1) in vec2 uv;
layout(location=0) out vec2 vUv;
layout(std140,binding=0) uniform Params { mat4 clipCorrection;vec4 metrics;vec4 p0;vec4 p1;vec4 p2;vec4 weights[22]; };
void main(){vUv=uv;gl_Position=clipCorrection*vec4(position,1.0);}
