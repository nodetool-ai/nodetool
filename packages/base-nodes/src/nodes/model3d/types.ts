export type Model3DRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  format?: string;
  vertices?: number;
  faces?: number;
};

export type ImageRefLike = { data?: Uint8Array | string; uri?: string };

export type JsonResources = Record<string, Uint8Array>;
export type JsonResourceRef = { uri?: string };

export type Model3DMetadata = {
  uri: string;
  format: string;
  size_bytes: number;
  vertices: number;
  faces: number;
  vertex_count: number;
  face_count: number;
  mesh_count: number;
  primitive_count: number;
  bounds_min: number[];
  bounds_max: number[];
  is_watertight: boolean;
  center_of_mass: number[] | null;
  volume: number | null;
  surface_area: number | null;
};

export type ManifoldMeshLike = {
  numProp: number;
  triVerts: Uint32Array;
  vertProperties: Float32Array;
};

export type ManifoldInstance = {
  add(other: ManifoldInstance): ManifoldInstance;
  subtract(other: ManifoldInstance): ManifoldInstance;
  intersect(other: ManifoldInstance): ManifoldInstance;
  getMesh(): ManifoldMeshLike;
  delete(): void;
};

export type ManifoldApi = {
  setup(): void;
  Manifold: {
    ofMesh(mesh: ManifoldMeshLike): ManifoldInstance;
  };
};

export interface GltfAccessor {
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

export interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
}

export interface GltfMesh {
  primitives: GltfPrimitive[];
  [key: string]: unknown;
}

export interface GltfJson {
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
  meshes?: GltfMesh[];
  [key: string]: unknown;
}
