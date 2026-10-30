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
