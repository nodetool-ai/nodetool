/** esbuild settings shared by server artifacts and their regression tests. */
export const backendServerBuildOptions = {
  bundle: true,
  // Resource-change messages derive their type from model constructor names.
  keepNames: true,
  platform: "node",
  format: "esm",
  target: "node20"
};
