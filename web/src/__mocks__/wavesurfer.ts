/**
 * Mock for wavesurfer.js library
 */

export const WaveSurfer = {
  create: jest.fn(() => ({
    on: jest.fn(),
    un: jest.fn(),
    unAll: jest.fn(),
    play: jest.fn(),
    playPause: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seekTo: jest.fn(),
    setMuted: jest.fn(),
    zoom: jest.fn(),
    getDuration: jest.fn(() => 120),
    getCurrentTime: jest.fn(() => 0),
    isPlaying: jest.fn(() => false),
    getWrapper: jest.fn(() => ({
      getBoundingClientRect: jest.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 100,
        right: 800,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: jest.fn()
      })),
      scrollWidth: 800,
      clientWidth: 800
    })),
    destroy: jest.fn(),
    load: jest.fn()
  }))
};

export const Minimap = {
  create: jest.fn(() => ({
    destroy: jest.fn()
  }))
};

export const Record = {
  create: jest.fn(() => ({
    on: jest.fn(),
    unAll: jest.fn(),
    isRecording: jest.fn(() => false),
    startRecording: jest.fn(() => Promise.resolve()),
    stopRecording: jest.fn()
  }))
};

export default WaveSurfer;
