/**
 * Tests for MediaGenerationStore — the resolveImageSize helper and the
 * mode/param setters.
 */

import {
  useMediaGenerationStore,
  resolveImageSize,
  IMAGE_ASPECT_RATIOS,
} from './MediaGenerationStore';

describe('resolveImageSize', () => {
  it('returns a square for the 1:1 aspect ratio at 1K', () => {
    expect(resolveImageSize('1K', '1:1')).toEqual({ width: 1024, height: 1024 });
  });

  it('makes width larger than height for a landscape ratio', () => {
    const { width, height } = resolveImageSize('1K', '16:9');
    expect(height).toBe(1024);
    expect(width).toBe(Math.round((1024 * 16) / 9));
    expect(width).toBeGreaterThan(height);
  });

  it('makes height larger than width for a portrait ratio', () => {
    const { width, height } = resolveImageSize('1K', '9:16');
    expect(width).toBe(1024);
    expect(height).toBe(Math.round((1024 * 16) / 9));
    expect(height).toBeGreaterThan(width);
  });

  it('scales with the resolution preset', () => {
    expect(resolveImageSize('2K', '1:1')).toEqual({ width: 2048, height: 2048 });
    expect(resolveImageSize('4K', '1:1')).toEqual({ width: 4096, height: 4096 });
  });

  it('falls back to a square when the aspect ratio is unknown', () => {
    expect(resolveImageSize('1K', 'bogus')).toEqual({ width: 1024, height: 1024 });
  });

  it('handles every known image aspect ratio without throwing', () => {
    for (const ratio of IMAGE_ASPECT_RATIOS) {
      const size = resolveImageSize('1K', ratio.id);
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });
});

describe('MediaGenerationStore', () => {
  beforeEach(() => {
    useMediaGenerationStore.setState({
      mode: 'chat',
      image: { resolution: '1K', aspectRatio: '1:1', variations: 1 },
      video: { resolution: '1080p', aspectRatio: '16:9', duration: 5 },
    });
  });

  it('defaults to chat mode', () => {
    expect(useMediaGenerationStore.getState().mode).toBe('chat');
  });

  it('setMode switches the active mode', () => {
    useMediaGenerationStore.getState().setMode('image');
    expect(useMediaGenerationStore.getState().mode).toBe('image');
  });

  it('setImageParams merges into existing image params', () => {
    useMediaGenerationStore.getState().setImageParams({ resolution: '2K' });
    const { image } = useMediaGenerationStore.getState();
    expect(image.resolution).toBe('2K');
    // unchanged fields are preserved
    expect(image.aspectRatio).toBe('1:1');
    expect(image.variations).toBe(1);
  });

  it('setVideoParams merges into existing video params', () => {
    useMediaGenerationStore.getState().setVideoParams({ duration: 8 });
    const { video } = useMediaGenerationStore.getState();
    expect(video.duration).toBe(8);
    expect(video.resolution).toBe('1080p');
    expect(video.aspectRatio).toBe('16:9');
  });
});
