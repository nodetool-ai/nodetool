import { readFileSync } from './fs.mjs';

const codec = () => globalThis.__host.image;
const bytes = (input) => {
  if (typeof input === 'string') return readFileSync(input);
  if (!(input instanceof Uint8Array)) throw new Error('Native sharp requires image bytes or a granted file path');
  return input;
};

/**
 * The sharp chains used by image nodes, evaluated by native libvips. metadata
 * and toBuffer copy their inputs at the call and run on the run's CPU lane.
 */
export async function loadSharp() {
  return (input, options = {}) => {
    const spec = { raw: options.raw, create: input?.create };
    const overlays = [];
    const source = () => spec.create ? new Uint8Array() : bytes(input);
    const pipeline = {
      metadata: async () => codec().metadata(source(), JSON.stringify(spec)),
      resize: (width, height, options = {}) => {
        if (options.fit !== 'fill') throw new Error('Native sharp resize supports fit: fill');
        spec.resize = { width, height }; return pipeline;
      },
      greyscale: () => { spec.greyscale = true; return pipeline; },
      ensureAlpha: () => { spec.ensureAlpha = true; return pipeline; },
      removeAlpha: () => { spec.removeAlpha = true; return pipeline; },
      toColourspace: (space) => {
        if (space !== 'srgb') throw new Error('Native sharp supports srgb colourspace');
        return pipeline;
      },
      extract: (rect) => { spec.extract = rect; return pipeline; },
      composite: (layers) => {
        for (const layer of layers) {
          if (layer.blend && layer.blend !== 'over') throw new Error('Native sharp supports over compositing');
          if (Object.keys(layer).some(k => !['input', 'blend'].includes(k))) throw new Error('Unsupported native sharp composite option');
          overlays.push(bytes(layer.input));
        }
        return pipeline;
      },
      png: () => { spec.format = 'png'; return pipeline; },
      webp: (options = {}) => { spec.format = 'webp'; spec.webp = options; return pipeline; },
      raw: () => { spec.format = 'raw'; return pipeline; },
      toBuffer: async (options = {}) => {
        const result = await codec().transform(source(), JSON.stringify(spec), ...overlays);
        return options.resolveWithObject ? result : result.data;
      }
    };
    return pipeline;
  };
}
