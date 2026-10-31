#version 440
layout(location=0) in vec3 position;
layout(std140,binding=0) uniform Camera { mat4 viewProjection;mat4 lightProjection;vec4 shadowParameters; };
void main() { gl_Position=lightProjection*vec4(position,1.0); }
