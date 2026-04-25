import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import AlphaSlider from "../AlphaSlider";

describe("AlphaSlider", () => {
  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider theme={mockTheme}>
        {component}
      </ThemeProvider>
    );
  };

  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders correctly with default props", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.querySelector("div");
      expect(slider).toBeInTheDocument();
    });

    it("renders with horizontal orientation by default", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      expect(slider).toHaveStyle({ width: "100%" });
      expect(slider).toHaveStyle({ height: "24px" });
    });

    it("renders with vertical orientation", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} orientation="vertical" />
      );

      const slider = container.firstChild as HTMLElement;
      expect(slider).toHaveStyle({ width: "24px" });
      expect(slider).toHaveStyle({ height: "100%" });
    });

    it("renders alpha gradient layer", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#00ff00" alpha={0.7} onChange={mockOnChange} />
      );

      const gradient = container.querySelector(".alpha-gradient");
      expect(gradient).toBeInTheDocument();
    });

    it("renders cursor indicator", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#0000ff" alpha={0.3} onChange={mockOnChange} />
      );

      const cursor = container.querySelector(".alpha-cursor");
      expect(cursor).toBeInTheDocument();
    });
  });

  describe("cursor positioning", () => {
    it("positions cursor at correct location for horizontal orientation", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} orientation="horizontal" />
      );

      const cursor = container.querySelector(".alpha-cursor") as HTMLElement;
      expect(cursor.style.left).toBe("50%");
    });

    it("positions cursor at correct location for vertical orientation", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} orientation="vertical" />
      );

      const cursor = container.querySelector(".alpha-cursor") as HTMLElement;
      expect(cursor.style.top).toBe("50%");
    });

    it("positions cursor at 0% when alpha is 0", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0} onChange={mockOnChange} />
      );

      const cursor = container.querySelector(".alpha-cursor") as HTMLElement;
      expect(cursor.style.left).toBe("0%");
    });

    it("positions cursor at 100% when alpha is 1", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={1} onChange={mockOnChange} />
      );

      const cursor = container.querySelector(".alpha-cursor") as HTMLElement;
      expect(cursor.style.left).toBe("100%");
    });
  });

  describe("gradient colors", () => {
    it("applies cursor background color", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#00ff00" alpha={0.5} onChange={mockOnChange} />
      );

      const cursor = container.querySelector(".alpha-cursor") as HTMLElement;
      expect(cursor.style.backgroundColor).toBe("rgb(0, 255, 0)");
    });
  });

  describe("mouse interaction", () => {
    it("calls onChange when clicking on slider", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      fireEvent.mouseDown(slider, { clientX: 100, clientY: 50 });

      expect(mockOnChange).toHaveBeenCalled();
    });

    it("calls onChange with correct alpha value on click", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 100, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledWith(0.5);
    });

    it("clamps alpha to 0 when clicking at left edge", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 0, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledWith(0);
    });

    it("clamps alpha to 1 when clicking at right edge", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 200, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledWith(1);
    });

    it("updates alpha while dragging", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 50, clientY: 12 });
      fireEvent.mouseMove(slider, { clientX: 100, clientY: 12 });
      fireEvent.mouseMove(slider, { clientX: 150, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledTimes(3);
    });

    it("stops updating alpha after mouse up", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 100, clientY: 12 });
      fireEvent.mouseUp(slider);
      fireEvent.mouseMove(slider, { clientX: 150, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("stops dragging when mouse leaves", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 100, clientY: 12 });
      fireEvent.mouseLeave(slider);
      fireEvent.mouseMove(slider, { clientX: 150, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("vertical orientation interaction", () => {
    it("calculates alpha correctly in vertical mode", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} orientation="vertical" />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 24,
        height: 200,
        right: 24,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 12, clientY: 100 });

      expect(mockOnChange).toHaveBeenCalledWith(0.5);
    });

    it("inverts alpha calculation in vertical mode", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} orientation="vertical" />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 24,
        height: 200,
        right: 24,
        bottom: 200,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 12, clientY: 0 });
      expect(mockOnChange).toHaveBeenCalledWith(1);

      mockOnChange.mockClear();

      fireEvent.mouseDown(slider, { clientX: 12, clientY: 200 });
      expect(mockOnChange).toHaveBeenCalledWith(0);
    });
  });

  describe("touch interaction", () => {
    it("calls onChange on touch start", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.touchStart(slider, {
        touches: [{ clientX: 100, clientY: 12 }] as any
      });

      expect(mockOnChange).toHaveBeenCalledWith(0.5);
    });

    it("updates alpha during touch move", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.touchStart(slider, {
        touches: [{ clientX: 50, clientY: 12 }] as any
      });
      fireEvent.touchMove(slider, {
        touches: [{ clientX: 100, clientY: 12 }] as any
      });
      fireEvent.touchMove(slider, {
        touches: [{ clientX: 150, clientY: 12 }] as any
      });

      expect(mockOnChange).toHaveBeenCalledTimes(3);
    });

    it("stops updating on touch end", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.touchStart(slider, {
        touches: [{ clientX: 100, clientY: 12 }] as any
      });
      fireEvent.touchEnd(slider);
      fireEvent.touchMove(slider, {
        touches: [{ clientX: 150, clientY: 12 }] as any
      });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("global mouse events", () => {
    it("stops dragging on global mouse up", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 100, clientY: 12 });
      fireEvent.mouseUp(window);
      fireEvent.mouseMove(slider, { clientX: 150, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("stops dragging on global touch end", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.touchStart(slider, {
        touches: [{ clientX: 100, clientY: 12 }] as any
      });
      fireEvent.touchEnd(window);
      fireEvent.touchMove(slider, {
        touches: [{ clientX: 150, clientY: 12 }] as any
      });

      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("alpha precision", () => {
    it("rounds alpha to 2 decimal places", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 333,
        height: 24,
        right: 333,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 100, clientY: 12 });

      const calledValue = mockOnChange.mock.calls[0][0];
      expect(calledValue).toBe(Math.round(calledValue * 100) / 100);
    });
  });

  describe("memo behavior", () => {
    it("has displayName for debugging", () => {
      expect(AlphaSlider.displayName).toBe("AlphaSlider");
    });
  });

  describe("edge cases", () => {
    it("handles negative coordinates", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: -50, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledWith(0);
    });

    it("handles coordinates outside bounds", () => {
      const { container } = renderWithTheme(
        <AlphaSlider color="#ff0000" alpha={0.5} onChange={mockOnChange} />
      );

      const slider = container.firstChild as HTMLElement;
      jest.spyOn(slider, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 200,
        height: 24,
        right: 200,
        bottom: 24,
        x: 0,
        y: 0,
        toJSON: () => ({})
      });

      fireEvent.mouseDown(slider, { clientX: 250, clientY: 12 });

      expect(mockOnChange).toHaveBeenCalledWith(1);
    });
  });
});
