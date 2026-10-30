# Prepared assets

`PreparedAssets` reads a closed manifest rooted in a staged directory. Each entry
uses the document's `id`, `kind`, `path`, `digest`, `size`, and `dependencies`.
Paths must remain inside that directory, including after symlink resolution.
The loader verifies byte size and SHA256 before parsing. glTF URI references must
resolve to explicitly declared dependencies. Network URLs, data URLs, encoded
paths, and parent traversal are rejected.

Call preparation on a host asset-loading thread, never on the simulation or GPU
thread. One loader instance belongs to one thread. Published `PreparedModel`
instances are immutable and may be shared across render instances. `clear()`
releases loader ownership without invalidating references held by a renderer.
Cancellation is checked before reads, between chunks, and during accessor decode.
A cancelled preparation is never added to the model cache.

## Supported model subset

The importer accepts glTF 2 JSON and GLB 2 with triangle primitives, position,
normal, UV, joint, and weight attributes. Materials support opaque base color,
base-color images, metallic and roughness factors, and double-sided rendering.
Images remain verified encoded bytes for the renderer to decode with its own
pixel budget. Nodes preserve local transforms and hierarchy. Skins preserve
joint mappings and inverse bind matrices. Animation supports translation, scale,
and quaternion rotation with STEP or LINEAR interpolation.

Required extensions, sparse accessors, morph targets, transparent materials,
CUBICSPLINE animation, and nontriangle primitives fail explicitly. Unsupported
optional glTF features do not become physics. Collider preparation is a separate
operation owned by the simulation implementation.

`sampleModel` takes an explicit animation index and simulation-derived time.
It contains no mutable mixer state, so pause, seek, and restore use the same
sampling operation. The returned node matrices are in model world space.
Joint matrices are world-space joint transforms multiplied by inverse bind
matrices. Skin a vertex directly with those joint matrices, without multiplying
its mesh node's world matrix again. The entity transform is applied afterward.
