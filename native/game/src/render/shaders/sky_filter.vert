#version 440
precision mediump float;
layout(location=0) in vec2 position;
layout(location=1) in vec2 uv;
layout(location=2) in float faceIndex;
layout(location=0) out vec3 direction;
void main(){vec2 p=2.0*uv-1.0;int face=int(faceIndex);if(face==0){direction=vec3(1,p.y,p.x);}else if(face==1){direction=vec3(-p.x,1,-p.y);}else if(face==2){direction=vec3(-p.x,p.y,1);}else if(face==3){direction=vec3(-1,p.y,-p.x);}else if(face==4){direction=vec3(-p.x,-1,p.y);}else{direction=vec3(p.x,p.y,-1);}gl_Position=vec4(position,0,1);}
