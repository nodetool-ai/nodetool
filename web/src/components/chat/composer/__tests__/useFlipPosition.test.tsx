// web/src/components/chat/composer/__tests__/useFlipPosition.test.tsx
import React, { useRef } from "react";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { useFlipPosition } from "../useFlipPosition";

function makeRect(x: number, y: number, w = 100, h = 40): DOMRect {
  return {
    x, y, width: w, height: h, top: y, left: x,
    right: x + w, bottom: y + h, toJSON: () => ({})
  } as DOMRect;
}

function Harness({ trigger }: { trigger: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFlipPosition(ref, [trigger]);
  return <div ref={ref} data-testid="box" />;
}

describe("useFlipPosition", () => {
  let animateSpy: jest.SpyInstance;
  let matchMediaMock: jest.Mock;

  beforeEach(() => {
    animateSpy = jest
      .spyOn(Element.prototype, "animate")
      .mockReturnValue({} as Animation);
    matchMediaMock = jest.fn().mockReturnValue({ matches: false });
    // @ts-ignore test stub
    window.matchMedia = matchMediaMock;
  });

  afterEach(() => {
    animateSpy.mockRestore();
  });

  it("does not animate on first render (no previous rect)", () => {
    const rects = [makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    render(<Harness trigger={1} />);
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("animates from the previous rect to the current rect on change", () => {
    const rects = [makeRect(0, 500), makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    const { rerender } = render(<Harness trigger={1} />);
    rerender(<Harness trigger={2} />);

    expect(animateSpy).toHaveBeenCalledTimes(1);
    const keyframes = animateSpy.mock.calls[0][0] as Keyframe[];
    expect(String(keyframes[0].transform)).toContain("translate");
  });

  it("skips animation when prefers-reduced-motion is set", () => {
    matchMediaMock.mockReturnValue({ matches: true });
    const rects = [makeRect(0, 500), makeRect(0, 500), makeRect(0, 0)];
    let call = 0;
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => rects[Math.min(call++, rects.length - 1)]);

    const { rerender } = render(<Harness trigger={1} />);
    rerender(<Harness trigger={2} />);
    expect(animateSpy).not.toHaveBeenCalled();
  });
});
