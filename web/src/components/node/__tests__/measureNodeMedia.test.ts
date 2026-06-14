import { measureNodeMedia } from "../measureNodeMedia";

function makeNode(): HTMLElement {
  const node = document.createElement("div");
  node.className = "react-flow__node";
  return node;
}

function mockRect(el: Element, width: number, height: number): void {
  jest
    .spyOn(el, "getBoundingClientRect")
    .mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
}

describe("measureNodeMedia", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns null when the node holds no decoded media", () => {
    const node = makeNode();
    node.appendChild(document.createElement("span"));
    expect(measureNodeMedia(node, 1, 200, 200)).toBeNull();
  });

  it("measures ratio and chrome offsets from the media container", () => {
    const node = makeNode();
    const container = document.createElement("div");
    container.className = "image-output";
    const canvas = document.createElement("canvas");
    canvas.width = 200; // intrinsic
    canvas.height = 100;
    container.appendChild(canvas);
    node.appendChild(container);

    // Container box is 300x160 on screen; the node is 320x240 (flow units).
    mockRect(container, 300, 160);

    expect(measureNodeMedia(node, 1, 320, 240)).toEqual({
      ratio: 2,
      sidePad: 20, // 320 - 300
      chrome: 80 // 240 - 160
    });
  });

  it("divides the container box by the viewport zoom", () => {
    const node = makeNode();
    const container = document.createElement("div");
    container.className = "preview-area";
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    container.appendChild(canvas);
    node.appendChild(container);

    // At zoom 2 a 200x200 screen box is a 100x100 flow box.
    mockRect(container, 200, 200);

    const box = measureNodeMedia(node, 2, 130, 150);
    expect(box).not.toBeNull();
    expect(box?.ratio).toBe(1);
    expect(box?.sidePad).toBe(30); // 130 - 100
    expect(box?.chrome).toBe(50); // 150 - 100
  });

  it("ignores a canvas with no intrinsic size", () => {
    const node = makeNode();
    const container = document.createElement("div");
    container.className = "image-output";
    const canvas = document.createElement("canvas");
    canvas.width = 0;
    canvas.height = 0;
    container.appendChild(canvas);
    node.appendChild(container);

    expect(measureNodeMedia(node, 1, 200, 200)).toBeNull();
  });
});
