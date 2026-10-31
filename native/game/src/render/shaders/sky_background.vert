#version 440
layout(location=0) out vec2 position;
layout(std140,binding=0) uniform Camera{mat4 correction;mat4 inverseViewProjection;vec4 cameraPosition;vec4 settings;vec4 background;};
void main(){vec2 p=gl_VertexIndex==0?vec2(-1,1):gl_VertexIndex==1?vec2(3,1):vec2(-1,-3);position=p;gl_Position=correction*vec4(p,0,1);}
