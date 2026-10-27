import { cropRectPx } from '@nodetool-ai/timeline';

let compared = 0;
let skippedReframes = 0;
export const cropComparisonCounts = () => ({ compared, skippedReframes });
export function resetCropComparisonCounts() {
  compared = 0;
  skippedReframes = 0;
}
process.once('beforeExit', () => {
  if (skippedReframes > 0) {
    console.error(`crop: compared ${compared} layers, skipped ${skippedReframes} reframe layers (decorator needs canvas and media tracks)`);
  }
});

export default {
  layer({ web, native, clip, document }) {
    if (clip?.reframe !== undefined) {
      skippedReframes++;
      return [];
    }
    // The current plan oracle omits the scene clip. Accept it when supplied.
    const source = web.clip ?? clip ?? {};
    const width = source.width ?? document.width;
    const height = source.height ?? document.height;
    const rect = cropRectPx(source.crop, width, height);
    const expected = width > 0 && height > 0
      ? [rect.x / width, rect.y / height, rect.width / width, rect.height / height]
      : [0, 0, 1, 1];
    const actual = native.sourceRect ?? [0, 0, 1, 1];
    compared++;
    if (!Array.isArray(actual) || actual.length !== 4) {
      return ['sourceRect must contain four numbers'];
    }
    return expected.flatMap((value, i) => Number.isFinite(actual[i]) && Math.abs(value - actual[i]) <= 1e-6
      ? [] : [`sourceRect[${i}] web ${value} native ${actual[i]}`]);
  }
};
