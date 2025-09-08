// Mock canvas module for tests
const createCanvas = jest.fn(() => ({
  getContext: jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(4)
    })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => ({
      data: new Uint8ClampedArray(4)
    })),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn()
  })),
  toBuffer: jest.fn((callback: any) => callback(null, Buffer.from(""))),
  width: 300,
  height: 150
}));

const loadImage = jest.fn(() => Promise.resolve({}));
const Image = jest.fn(() => ({}));

export { createCanvas, loadImage, Image };
export default { createCanvas, loadImage, Image };