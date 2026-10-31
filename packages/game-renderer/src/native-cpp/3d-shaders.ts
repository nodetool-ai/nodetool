/** Native skin normals use each joints inverse-transpose before weighting. */
export const NATIVE_SKIN_NORMAL_VERTEX = `
#ifdef USE_SKINNING
vec3 nativeNormal = vec3(0.0);
if (skinWeight.x > 0.0) nativeNormal += skinWeight.x * (abs(determinant(mat3(bindMatrixInverse * boneMatX * bindMatrix))) > 0.0 ? transpose(inverse(mat3(bindMatrixInverse * boneMatX * bindMatrix))) : mat3(1.0)) * objectNormal;
if (skinWeight.y > 0.0) nativeNormal += skinWeight.y * (abs(determinant(mat3(bindMatrixInverse * boneMatY * bindMatrix))) > 0.0 ? transpose(inverse(mat3(bindMatrixInverse * boneMatY * bindMatrix))) : mat3(1.0)) * objectNormal;
if (skinWeight.z > 0.0) nativeNormal += skinWeight.z * (abs(determinant(mat3(bindMatrixInverse * boneMatZ * bindMatrix))) > 0.0 ? transpose(inverse(mat3(bindMatrixInverse * boneMatZ * bindMatrix))) : mat3(1.0)) * objectNormal;
if (skinWeight.w > 0.0) nativeNormal += skinWeight.w * (abs(determinant(mat3(bindMatrixInverse * boneMatW * bindMatrix))) > 0.0 ? transpose(inverse(mat3(bindMatrixInverse * boneMatW * bindMatrix))) : mat3(1.0)) * objectNormal;
objectNormal = nativeNormal;
#endif
`;

/** Keep writes representable in the native RGBA16F scene target. */
export const NATIVE_FINITE_HDR_FRAGMENT = `
outgoingLight = vec3(
  isnan(outgoingLight.r) ? 0.0 : clamp(outgoingLight.r, 0.0, 65504.0),
  isnan(outgoingLight.g) ? 0.0 : clamp(outgoingLight.g, 0.0, 65504.0),
  isnan(outgoingLight.b) ? 0.0 : clamp(outgoingLight.b, 0.0, 65504.0)
);
`;

/** Three's shadow shaders omit vertex colors and factor opacity from their alpha test. */
export function nativeVertexAlphaShadowShader(shader: { vertexShader: string; fragmentShader: string }): void {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\n#include <color_pars_vertex>")
    .replace("#include <begin_vertex>", "#include <color_vertex>\n#include <begin_vertex>");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\n#include <color_pars_fragment>\nuniform float nativeOpacity;")
    .replace("#include <alphatest_fragment>", "diffuseColor.a *= nativeOpacity;\n#include <color_fragment>\n#include <alphatest_fragment>");
}
