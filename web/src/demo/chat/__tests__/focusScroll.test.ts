import { applyAnchoredChatScroll } from "../focusScroll";

const rect = (top: number, height: number): DOMRect => ({
  x: 0,
  y: top,
  top,
  left: 0,
  right: 100,
  bottom: top + height,
  width: 100,
  height,
  toJSON: () => ({}),
});

describe("applyAnchoredChatScroll", () => {
  it("captures one anchor position and reuses it after target growth and backward seeks", () => {
    const root = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.className = "scrollable-message-wrapper";
    const target = document.createElement("div");
    target.dataset.focusId = "answer";
    scroller.append(target);
    root.append(scroller);
    Object.defineProperties(scroller, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 1200 },
    });
    scroller.getBoundingClientRect = () => rect(100, 400);
    target.getBoundingClientRect = () => rect(700, 100);
    const positions = { current: new Map<string, number>() };

    applyAnchoredChatScroll(root, ["answer"], positions);
    const anchored = scroller.scrollTop;
    expect(anchored).toBe(450);

    target.getBoundingClientRect = () => rect(900, 300);
    scroller.scrollTop = 0;
    applyAnchoredChatScroll(root, ["answer"], positions);
    expect(scroller.scrollTop).toBe(anchored);
  });

  it("resets overview and non-chat shots identically after a direct or backward seek", () => {
    const root = document.createElement("div");
    const scroller = document.createElement("div");
    scroller.className = "scrollable-message-wrapper";
    root.append(scroller);
    const outside = document.createElement("div");
    outside.dataset.focusId = "panel";
    root.append(outside);
    scroller.scrollTop = 73;
    const positions = { current: new Map<string, number>() };

    applyAnchoredChatScroll(root, [], positions);
    expect(scroller.scrollTop).toBe(0);
    scroller.scrollTop = 73;
    applyAnchoredChatScroll(root, ["panel"], positions);
    expect(scroller.scrollTop).toBe(0);
  });
});
