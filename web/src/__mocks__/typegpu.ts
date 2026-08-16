/**
 * Minimal `typegpu` mock for jsdom Jest.
 *
 * `@nodetool-ai/gpu/webgpu` (the layer compositor) imports TypeGPU at module
 * load to build its bind group layouts. TypeGPU ships ESM-only, which Jest
 * does not transform, so we mock it the same way the suite mocks other ESM
 * deps (react-markdown, etc.). Real GPU work only runs against a device,
 * which jsdom never provides, so these stubs just need to not throw at import.
 */

type Stub = Record<string, unknown>;

const makeBuffer = () => {
  const buffer = {
    buffer: {},
    $usage: () => buffer,
    $name: () => buffer,
    write: () => undefined,
    destroy: () => undefined
  } satisfies Stub;
  return buffer;
};

const makeRoot = () => ({
  device: {},
  unwrap: () => ({}),
  createBuffer: () => makeBuffer(),
  destroy: () => undefined
});

const tgpu = {
  bindGroupLayout: (entries: Record<string, unknown>) => ({
    entries,
    bound: {},
    value: {},
    $: {}
  }),
  initFromDevice: (): Stub => makeRoot(),
  resolve: (options: { template?: string }): string => options?.template ?? ""
};

export default tgpu;

export const writeToArrayBuffer = (): void => undefined;
