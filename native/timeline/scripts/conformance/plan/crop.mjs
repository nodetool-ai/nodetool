import { clipSourceMsAt, cropRectPx, renderableReframe, resolveReframeCrop } from '@nodetool-ai/timeline';

let compared = 0;
export const cropComparisonCounts = () => ({ compared });
export function resetCropComparisonCounts() {
  compared = 0;
}

export default {
  layer({ web, native, clip, document, timeMs }) {
    // The current plan oracle omits the scene clip. Accept it when supplied.
    const source = web.clip ?? clip ?? {};
    const width = source.width ?? document.width;
    const height = source.height ?? document.height;
    const track = source.reframe?.trackId
      ? document.mediaTracks?.find(candidate => candidate.id === source.reframe.trackId)
      : undefined;
    const reframe = renderableReframe(source, track);
    const reframeCrop = reframe
      ? resolveReframeCrop(reframe, clipSourceMsAt(source, timeMs), {
        width: reframe.sourceWidth ?? width,
        height: reframe.sourceHeight ?? height
      }, { width: document.width, height: document.height }, track)
      : undefined;
    const rect = cropRectPx(reframeCrop ?? source.crop, width, height);
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
