import { startCanvasLoop } from '../canvas';

function mockMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mq = {
    matches,
    addEventListener: jest.fn((_: string, l: () => void) => listeners.push(l)),
    removeEventListener: jest.fn()
  };
  window.matchMedia = jest.fn().mockReturnValue(mq);
  return mq;
}

describe('startCanvasLoop', () => {
  const canvas = document.createElement('canvas');
  const ref = { current: canvas };
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    window.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    window.cancelAnimationFrame = jest.fn();
  });

  it('draws every frame until cleanup', () => {
    const mq = mockMatchMedia(false);
    const draw = jest.fn();
    const stop = startCanvasLoop(ref, draw);
    expect(draw).not.toHaveBeenCalled();
    frames.shift()!(0);
    frames.shift()!(0);
    expect(draw).toHaveBeenCalledTimes(2);
    stop();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('paints one static frame under reduced motion', () => {
    mockMatchMedia(true);
    const draw = jest.fn();
    startCanvasLoop(ref, draw);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledWith(canvas);
    expect(frames).toHaveLength(0);
  });
});
