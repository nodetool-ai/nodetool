// The shader catalog the gpu capability runs: @nodetool-ai/gpu's shader
// modules and recipes as data, exported at bundle build time by
// guest/host/gpu-catalog.mjs. This part needs no GPU: it parses the
// document, packs uniforms and resolves recipe params.
#pragma once

#include "kernel/json.h"

#include <array>
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace gr::host::gpu {

struct InputContract {
  bool straight = false;  // alpha "straight"; otherwise premultiplied
  bool optional = false;
};

struct Binding {
  enum class Kind { Uniform, Texture, StorageTexture, Sampler, ExternalTexture };
  std::string name;
  uint32_t binding = 0;
  Kind kind = Kind::Texture;
};

struct UniformField {
  std::string name;
  std::string type;  // f32 | i32 | u32 | vec2f | vec3f | vec4f
  uint32_t offset = 0;
  int index = -1;
};

struct Module {
  std::string key;  // id@version
  std::string kind;  // fragment | compute | recipe
  std::map<std::string, InputContract> inputs;  // io.inputs
  std::string dimensions;  // io.output.dimensions
  Json paramDefaults;

  // Shader modules.
  std::string wgsl;
  std::string entryPoint;
  std::array<uint32_t, 3> workgroupSize{1, 1, 1};
  Json layout;  // GPUBindGroupLayoutDescriptor entries
  std::vector<Binding> bindings;  // in the Executor's order
  Json samplers;  // binding name -> GPUSamplerDescriptor
  bool hasUniform = false;
  uint32_t uniformSize = 0;
  std::vector<UniformField> fields;
  std::vector<uint8_t> packedDefaults;  // paramDefaults as typegpu packs them

  // Recipes.
  Json intermediates;
  Json passes;
};

struct Catalog {
  std::string vertex;  // full-screen triangle prepended to fragment WGSL
  std::string vertexEntryPoint;
  std::string toStraight;  // alpha convert module keys
  std::string toPremultiplied;
  std::map<std::string, Module> modules;
  // Distinguishes catalogs of different bundles in the pipeline cache.
  size_t hash = 0;

  // Throws when `key` is not in the catalog.
  const Module& module(const std::string& key) const;
};

// Throws std::runtime_error on a malformed document.
std::shared_ptr<const Catalog> parseCatalog(const std::string& json);

// JavaScript's Number(value) for a JSON value; a missing value is undefined.
double jsNumber(const Json* value);

// Packs `params` into the module's uniform struct the way typegpu's
// writeToArrayBuffer does: fields by name, vectors by index, numbers through
// Number(). Throws where typegpu would (a vector field that is undefined or
// null).
std::vector<uint8_t> packUniform(const Module& module, const Json& params);

// A recipe pass's params: literals, and "$.name" references into the
// recipe's params (missing references are dropped, as undefined).
Json resolvePassParams(const Json& passParams, const Json& recipeParams);

}  // namespace gr::host::gpu
