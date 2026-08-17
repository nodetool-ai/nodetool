import { renderHook } from "@testing-library/react";
import { useValueCalculation, useDragHandling } from "../useNumberInput";

describe("useNumberInput", () => {
  describe("useValueCalculation", () => {
    it("returns calculateStep and calculateDecimalPlaces functions", () => {
      const { result } = renderHook(() => useValueCalculation());

      expect(result.current.calculateStep).toBeDefined();
      expect(result.current.calculateStep).toEqual(expect.any(Function));
      expect(result.current.calculateDecimalPlaces).toBeDefined();
      expect(result.current.calculateDecimalPlaces).toEqual(expect.any(Function));
    });

    it("calculateStep returns correct step for unbounded int", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(undefined, undefined, "int");
      expect(step).toBe(1);
    });

    it("calculateStep returns correct step for unbounded float", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(undefined, undefined, "float");
      expect(step).toBe(0.1);
    });

    it("calculateStep returns correct step for bounded int", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(0, 100, "int");
      expect(step).toBe(1);
    });

    it("calculateStep returns correct step for bounded float", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(0, 10, "float");
      expect(step).toBe(0.1);
    });

    it("calculateStep returns correct step for small range", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(0, 1, "float");
      expect(step).toBe(0.01);
    });

    it("calculateStep returns correct step for very small range", () => {
      const { result } = renderHook(() => useValueCalculation());

      const step = result.current.calculateStep(0, 0.1, "float");
      expect(step).toBe(0.01);
    });

    it("calculateDecimalPlaces returns 0 for int type", () => {
      const { result } = renderHook(() => useValueCalculation());

      const decimals = result.current.calculateDecimalPlaces(1);
      expect(decimals).toBe(0);
    });

    it("calculateDecimalPlaces returns correct places for float step", () => {
      const { result } = renderHook(() => useValueCalculation());

      const decimals = result.current.calculateDecimalPlaces(0.1);
      expect(decimals).toBe(1);
    });

    it("calculateDecimalPlaces returns 2 places for 0.01 step", () => {
      const { result } = renderHook(() => useValueCalculation());

      const decimals = result.current.calculateDecimalPlaces(0.01);
      expect(decimals).toBe(2);
    });

    it("calculateDecimalPlaces returns 3 places for 0.001 step", () => {
      const { result } = renderHook(() => useValueCalculation());

      const decimals = result.current.calculateDecimalPlaces(0.001);
      expect(decimals).toBe(3);
    });

    it("calculateDecimalPlaces returns 4 places for 0.0001 step", () => {
      const { result } = renderHook(() => useValueCalculation());

      const decimals = result.current.calculateDecimalPlaces(0.0001);
      expect(decimals).toBe(4);
    });
  });

  describe("useDragHandling", () => {
    /** The drag inputs and mutable drag state these tests assemble. */
    interface DragProps {
      min: number;
      max: number;
      inputType: "float" | "int";
      onChange: jest.Mock;
      onChangeComplete: jest.Mock | undefined;
    }

    interface DragState {
      localValue: string;
      isDragging: boolean;
      hasExceededDragThreshold: boolean;
      dragStartX: number;
      currentDragValue: number;
      decimalPlaces: number;
      lastClientX: number;
      actualSliderWidth: number;
    }

    const createMockProps = (overrides: Partial<DragProps> = {}) => ({
      min: 0,
      max: 100,
      inputType: "float" as const,
      onChange: jest.fn(),
      onChangeComplete: undefined,
      ...overrides,
    });

    const createMockState = (overrides: Partial<DragState> = {}): DragState => ({
      localValue: "50",
      isDragging: false,
      hasExceededDragThreshold: false,
      dragStartX: 0,
      currentDragValue: 50,
      decimalPlaces: 1,
      lastClientX: 0,
      actualSliderWidth: 200,
      ...overrides,
    });

    const createMockContainer = () => {
      const div = document.createElement("div");
      const mockRect: DOMRect = {
        x: 50,
        y: 100,
        top: 100,
        bottom: 140,
        left: 50,
        right: 250,
        width: 200,
        height: 40,
        toJSON: () => "",
      };
      div.getBoundingClientRect = jest.fn(() => mockRect);
      return div;
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("returns handleMouseMove and handleMouseUp functions", () => {
      const props = createMockProps();
      const state = createMockState();
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      expect(result.current.handleMouseMove).toBeDefined();
      expect(result.current.handleMouseMove).toEqual(expect.any(Function));
      expect(result.current.handleMouseUp).toBeDefined();
      expect(result.current.handleMouseUp).toEqual(expect.any(Function));
    });

    it("handleMouseMove does nothing when not dragging", () => {
      const props = createMockProps();
      const state = createMockState({ isDragging: false });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      const mouseEvent = new MouseEvent("mousemove");
      result.current.handleMouseMove(mouseEvent);

      expect(props.onChange).not.toHaveBeenCalled();
      expect(setInputIsFocused).not.toHaveBeenCalled();
    });

    it("handleMouseMove sets hasExceededDragThreshold when drag exceeds threshold", () => {
      const props = createMockProps();
      const state = createMockState({
        isDragging: true,
        hasExceededDragThreshold: false,
        dragStartX: 100,
        lastClientX: 100,
        currentDragValue: 50,
      });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      const mouseEvent = new MouseEvent("mousemove", {
        clientX: 160,
        clientY: 120,
      });
      result.current.handleMouseMove(mouseEvent);

      expect(dragStateRef.current.hasExceededDragThreshold).toBe(true);
      expect(setInputIsFocused).toHaveBeenCalledWith(false);
    });

    it("handleMouseMove calls onChange when value changes", () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const state = createMockState({
        isDragging: true,
        hasExceededDragThreshold: true,
        dragStartX: 100,
        lastClientX: 100,
        currentDragValue: 50,
      });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      const mouseEvent = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 120,
      });
      result.current.handleMouseMove(mouseEvent);

      expect(onChange).toHaveBeenCalled();
    });

    it("handleMouseUp stops dragging and updates state", () => {
      const onChangeComplete = jest.fn();
      const props = createMockProps({ onChangeComplete });
      const state = createMockState({
        isDragging: true,
        hasExceededDragThreshold: true,
        currentDragValue: 55,
      });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(dragStateRef.current.isDragging).toBe(false);
      expect(setState).toHaveBeenCalled();
      expect(onChangeComplete).toHaveBeenCalledWith(55);
    });

    it("handleMouseUp focuses input when threshold not exceeded", () => {
      const props = createMockProps();
      const state = createMockState({
        isDragging: true,
        hasExceededDragThreshold: false,
        currentDragValue: 50,
      });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(dragStateRef.current.isDragging).toBe(false);
      expect(setInputIsFocused).toHaveBeenCalledWith(true);
    });

    it("handleMouseUp does nothing when not dragging", () => {
      const props = createMockProps();
      const state = createMockState({ isDragging: false });
      const setState = jest.fn();
      const setInputIsFocused = jest.fn();
      const containerRef = { current: createMockContainer() };
      const dragStateRef = { current: state };
      const setSpeedFactorState = jest.fn();

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          setState,
          setInputIsFocused,
          containerRef as any,
          dragStateRef as any,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(setState).not.toHaveBeenCalled();
    });
  });
});
