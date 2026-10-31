#ifndef NODETOOL_PBR_SCENE
#define NODETOOL_PBR_SCENE
const int MAX_LIGHTS = 32;
const int MAX_SHADOWS = 28;
layout(std140,binding=0) uniform Scene {
 mat4 viewProjection;
 mat4 view;
 mat4 inverseViewProjection;
 vec4 cameraNear;
 vec4 targetFar;
 vec4 ambientCount;
 vec4 fogColorEnabled;
 vec4 fogSettings;
 vec4 environment;
 vec4 backend;
 vec4 cascadeSplits;
 mat4 shadowMatrices[MAX_SHADOWS];
 vec4 shadowLayers[MAX_SHADOWS];
 vec4 lightPositionRange[MAX_LIGHTS];
 vec4 lightColorIntensity[MAX_LIGHTS];
 vec4 lightDirectionDecay[MAX_LIGHTS];
 vec4 lightShadows[MAX_LIGHTS];
} scene;
layout(std140,binding=1) uniform Material {
 mat4 model;
 mat4 normalMatrix;
 vec4 baseColor;
 vec4 emissiveNormalScale;
 vec4 surface;
 vec4 flags;
 vec4 sampling;
} material;
#endif
