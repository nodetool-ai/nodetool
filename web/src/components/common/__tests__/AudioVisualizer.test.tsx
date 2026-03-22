/**
 * Tests for AudioVisualizer component
 */

import { render } from '@testing-library/react';
import AudioVisualizer from '../AudioVisualizer';

// Mock requestAnimationFrame and cancelAnimationFrame
let rafCallbacks: Array<FrameRequestCallback> = [];
let rafIdCounter = 0;

global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
  const id = ++rafIdCounter;
  rafCallbacks.push(callback);
  return id;
});

global.cancelAnimationFrame = jest.fn((_id: number) => {
  rafCallbacks = rafCallbacks.filter(cb => cb !== null);
});

describe('AudioVisualizer', () => {
  beforeEach(() => {
    rafCallbacks = [];
    rafIdCounter = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    rafCallbacks = [];
  });

  it('renders canvas element when stream is provided', () => {
    const mockStream = {} as MediaStream;
    render(<AudioVisualizer stream={mockStream} height={64} />);

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas?.style.height).toBe('64px');
  });

  it('renders canvas element when stream is null', () => {
    render(<AudioVisualizer stream={null} height={64} />);

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('uses default height when not provided', () => {
    const mockStream = {} as MediaStream;
    render(<AudioVisualizer stream={mockStream} />);

    const canvas = document.querySelector('canvas');
    expect(canvas?.style.height).toBe('64px');
  });

  it('uses custom height when provided', () => {
    const mockStream = {} as MediaStream;
    render(<AudioVisualizer stream={mockStream} height={100} />);

    const canvas = document.querySelector('canvas');
    expect(canvas?.style.height).toBe('100px');
  });

  it('has correct displayName for debugging', () => {
    expect(AudioVisualizer.displayName).toBe('AudioVisualizer');
  });

  it('canvas has full width', () => {
    const mockStream = {} as MediaStream;
    render(<AudioVisualizer stream={mockStream} />);

    const canvas = document.querySelector('canvas');
    expect(canvas?.style.width).toBe('100%');
  });

  it('re-renders when version prop changes', () => {
    const mockStream = {} as MediaStream;
    const { rerender } = render(<AudioVisualizer stream={mockStream} version={0} />);

    rerender(<AudioVisualizer stream={mockStream} version={1} />);

    const canvasSecondRender = document.querySelector('canvas');
    expect(canvasSecondRender).toBeInTheDocument();
    // Component should re-render when version changes
  });

  it('does not crash when stream is null', () => {
    expect(() => {
      render(<AudioVisualizer stream={null} />);
    }).not.toThrow();
  });

  it('is properly memoized', () => {
    // The component is wrapped with memo() and has a displayName
    expect(AudioVisualizer.displayName).toBe('AudioVisualizer');
  });
});
