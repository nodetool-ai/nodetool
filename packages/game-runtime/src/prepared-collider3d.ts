import { gamePreparedCollider3D, type GameAssetBinding3D } from "@nodetool-ai/protocol";

export interface DecodedGameCollider3D {
  readonly vertices: Float32Array;
  readonly indices?: Uint32Array;
  readonly digest: string;
}

/** Verify the prepared JSON artifact before exposing collision geometry to a session. */
export async function decodePreparedGameCollider3D(bytes: Uint8Array, binding: Extract<GameAssetBinding3D, { mediaKind: "collider" }>): Promise<DecodedGameCollider3D> {
  if (binding.preparationVersion !== "1") throw new Error(`Unsupported collider preparation version ${binding.preparationVersion}`);
  if (bytes.byteLength > 32 * 1024 * 1024) throw new Error("Prepared collider exceeds 32 MiB");
  const buffer = Uint8Array.from(bytes);
  const digestBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  const digest = Array.from(new Uint8Array(digestBuffer), (value) => value.toString(16).padStart(2, "0")).join("");
  if (digest !== binding.digest) throw new Error("Prepared collider digest mismatch");
  const geometry = gamePreparedCollider3D.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (geometry.vertices.length / 3 !== binding.vertices || (geometry.indices?.length ?? 0) / 3 !== binding.triangles ||
    binding.shape === "triangleMesh" && !geometry.indices || binding.shape === "convexHull" && geometry.indices) {
    throw new Error("Prepared collider shape or geometry budget does not match its binding");
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let index = 0; index < geometry.vertices.length; index += 3) {
    for (const [offset, axis] of ["x", "y", "z"].entries()) {
      const key = axis as "x" | "y" | "z";
      const value = geometry.vertices[index + offset];
      min[key] = Math.min(min[key], value);
      max[key] = Math.max(max[key], value);
    }
  }
  for (const axis of ["x", "y", "z"] as const) {
    if (binding.bounds.min[axis] > binding.bounds.max[axis] || Math.abs(min[axis] - binding.bounds.min[axis]) > 0.00001 || Math.abs(max[axis] - binding.bounds.max[axis]) > 0.00001) {
      throw new Error("Prepared collider bounds do not match its binding");
    }
  }
  const vertices = Float32Array.from(geometry.vertices);
  if (vertices.some((value) => !Number.isFinite(value))) throw new Error("Prepared collider vertices exceed physics precision limits");
  const decoded: { vertices: Float32Array; indices?: Uint32Array; digest: string } = { vertices, digest };
  if (geometry.indices) decoded.indices = Uint32Array.from(geometry.indices);
  return decoded;
}
