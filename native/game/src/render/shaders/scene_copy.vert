#version 440
layout(std140,binding=0) uniform Copy { mat4 correction;vec4 parameters; } copy;
layout(location=0) out vec2 uv;
void main() {
 vec2 p=gl_VertexIndex==0?vec2(-1,1):gl_VertexIndex==1?vec2(3,1):vec2(-1,-3);
 uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=copy.correction*vec4(p,0,1);
}
