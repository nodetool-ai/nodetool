/**
 * Shared full-screen pass vertex shader for fragment modules.
 *
 * A single oversized triangle (3 vertices) covering the viewport. Emits
 * normalized UVs in `[0,1]` with a top-left origin — the pool's canonical
 * coordinate convention. Fragment modules consume `@location(0) uv: vec2f`.
 */
export const FULLSCREEN_TRIANGLE_VERTEX = /* wgsl */ `
struct FullscreenVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> FullscreenVertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let pos = positions[vertexIndex];
  var out: FullscreenVertexOutput;
  out.position = vec4f(pos, 0.0, 1.0);
  // Map clip-space [-1,1] to UV [0,1] with top-left origin (flip Y).
  out.uv = vec2f((pos.x + 1.0) * 0.5, (1.0 - pos.y) * 0.5);
  return out;
}
`;

/** Vertex entry point name in {@link FULLSCREEN_TRIANGLE_VERTEX}. */
export const FULLSCREEN_VERTEX_ENTRY = "vs_main";
