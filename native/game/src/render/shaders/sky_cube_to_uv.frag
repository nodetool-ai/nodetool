#version 440
#extension GL_GOOGLE_include_directive : require
#include "sky_ibl.glsl"
layout(location=0) in vec3 direction;
layout(location=0) out vec4 color;
layout(std140,binding=0) uniform Params{vec4 settings;};
layout(binding=1) uniform samplerCube source;
void main(){color=vec4(texture(source,direction).rgb,1);}
