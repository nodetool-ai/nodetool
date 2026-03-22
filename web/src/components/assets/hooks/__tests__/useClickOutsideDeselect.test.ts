import { renderHook } from "@testing-library/react";
import { useClickOutsideDeselect } from "../useClickOutsideDeselect";

describe("useClickOutsideDeselect", () => {
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    addEventListenerSpy = jest.spyOn(window, "addEventListener");
    removeEventListenerSpy = jest.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should add click event listener on mount", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["test-class"], true, onDeselect));

    expect(addEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("should remove click event listener on unmount", () => {
    const onDeselect = jest.fn();
    const { unmount } = renderHook(() => useClickOutsideDeselect(["test-class"], true, onDeselect));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("should call onDeselect when clicking on element with matching class and isSelected is true", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["asset-grid"], true, onDeselect));

    // Create a mock element with the class
    const mockElement = document.createElement("div");
    mockElement.classList.add("asset-grid");
    document.body.appendChild(mockElement);

    // Trigger click event
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, "target", { value: mockElement });
    window.dispatchEvent(clickEvent);

    expect(onDeselect).toHaveBeenCalledTimes(1);

    // Cleanup
    document.body.removeChild(mockElement);
  });

  it("should not call onDeselect when clicking on element without matching class", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["asset-grid"], true, onDeselect));

    // Create a mock element without the class
    const mockElement = document.createElement("div");
    mockElement.classList.add("some-other-class");
    document.body.appendChild(mockElement);

    // Trigger click event
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, "target", { value: mockElement });
    window.dispatchEvent(clickEvent);

    expect(onDeselect).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(mockElement);
  });

  it("should not call onDeselect when isSelected is false", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["asset-grid"], false, onDeselect));

    // Create a mock element with the class
    const mockElement = document.createElement("div");
    mockElement.classList.add("asset-grid");
    document.body.appendChild(mockElement);

    // Trigger click event
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, "target", { value: mockElement });
    window.dispatchEvent(clickEvent);

    expect(onDeselect).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(mockElement);
  });

  it("should not call onDeselect when clicking on selected-asset-info element", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["asset-grid"], true, onDeselect));

    // Create a mock element with selected-asset-info class
    const mockElement = document.createElement("div");
    mockElement.classList.add("selected-asset-info");
    mockElement.classList.add("asset-grid"); // Also has the match class
    document.body.appendChild(mockElement);

    // Trigger click event
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, "target", { value: mockElement });
    window.dispatchEvent(clickEvent);

    expect(onDeselect).not.toHaveBeenCalled();

    // Cleanup
    document.body.removeChild(mockElement);
  });

  it("should handle multiple class names", () => {
    const onDeselect = jest.fn();
    renderHook(() => useClickOutsideDeselect(["class-one", "class-two"], true, onDeselect));

    // Create a mock element with second class
    const mockElement = document.createElement("div");
    mockElement.classList.add("class-two");
    document.body.appendChild(mockElement);

    // Trigger click event
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, "target", { value: mockElement });
    window.dispatchEvent(clickEvent);

    expect(onDeselect).toHaveBeenCalledTimes(1);

    // Cleanup
    document.body.removeChild(mockElement);
  });
});
