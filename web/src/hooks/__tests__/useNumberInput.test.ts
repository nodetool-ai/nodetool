import { renderHook } from "@testing-library/react";
import { useValueCalculation, useDragHandling } from "../useNumberInput";
import { InputProps, NumberInputState } from "../../components/inputs/NumberInput";

describe("useNumberInput", () => {
  describe("useValueCalculation", () => {
    it("returns calculation functions", () => {
      const { result } = renderHook(() => useValueCalculation());

      expect(result.current.calculateStep).toBeDefined();
      expect(result.current.calculateDecimalPlaces).toBeDefined();
      expect(typeof result.current.calculateStep).toBe("function");
      expect(typeof result.current.calculateDecimalPlaces).toBe("function");
    });

    it("returns stable callbacks", () => {
      const { result, rerender } = renderHook(() => useValueCalculation());
      const firstResult = result.current;

      rerender();
      const secondResult = result.current;

      expect(firstResult.calculateStep).toBe(secondResult.calculateStep);
      expect(firstResult.calculateDecimalPlaces).toBe(secondResult.calculateDecimalPlaces);
    });
  });

  describe("useDragHandling", () => {
    const createMockProps = (overrides: Partial<InputProps> = {}): InputProps => ({
      nodeId: "test-node",
      name: "test",
      id: "test-id",
      min: 0,
      max: 100,
      inputType: "int",
      value: 50,
      onChange: () => {},
      onChangeComplete: () => {},
      ...overrides,
    } as InputProps);

    const createMockState = (overrides: Partial<NumberInputState> = {}): NumberInputState => ({
      isDefault: false,
      localValue: "50",
      originalValue: 50,
      dragStartX: 0,
      decimalPlaces: 0,
      isDragging: false,
      hasExceededDragThreshold: false,
      dragInitialValue: 50,
      currentDragValue: 50,
      lastClientX: 0,
      actualSliderWidth: 100,
      ...overrides,
    });

    const createContainerRef = () => ({
      current: {
        getBoundingClientRect: () => ({
          top: 100,
          bottom: 140,
          left: 50,
          right: 250,
          width: 200,
          height: 40,
        }),
      } as unknown as HTMLDivElement,
    });

    const createDragStateRef = () => ({
      current: {
        isDragging: false,
        dragStartX: 0,
        currentDragValue: 50,
        decimalPlaces: 0,
        lastClientX: 100,
        hasExceededDragThreshold: false,
        actualSliderWidth: 200,
      } as NumberInputState,
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("returns handleMouseMove and handleMouseUp callbacks", () => {
      const props = createMockProps();
      const state = createMockState();
      const setState = () => {};
      const inputIsFocused = true;
      const setInputIsFocused = () => {};
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      expect(result.current.handleMouseMove).toBeDefined();
      expect(result.current.handleMouseUp).toBeDefined();
      expect(typeof result.current.handleMouseMove).toBe("function");
      expect(typeof result.current.handleMouseUp).toBe("function");
    });

    it("does not drag when isDragging is false", () => {
      const onChange = jest.fn();
      const props = createMockProps({ onChange });
      const state = createMockState({ isDragging: false });
      const setState = () => {};
      const inputIsFocused = true;
      const setInputIsFocused = () => {};
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      const mouseEvent = new MouseEvent("mousemove", { clientX: 200 });
      result.current.handleMouseMove(mouseEvent);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("sets input focused when mouse up with threshold not exceeded", () => {
      const onChangeComplete = jest.fn();
      const props = createMockProps({ onChangeComplete });
      const state = createMockState({ isDragging: true });
      const setState = () => {};
      const inputIsFocused = false;
      const setInputIsFocused = jest.fn();
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      dragStateRef.current.isDragging = true;
      dragStateRef.current.hasExceededDragThreshold = false;
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(setInputIsFocused).toHaveBeenCalledWith(true);
      expect(onChangeComplete).not.toHaveBeenCalled();
    });

    it("calls onChangeComplete when mouse up with threshold exceeded", () => {
      const onChangeComplete = jest.fn();
      const props = createMockProps({ onChangeComplete });
      const state = createMockState({ isDragging: true });
      const setState = () => {};
      const inputIsFocused = false;
      const setInputIsFocused = jest.fn();
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      dragStateRef.current.isDragging = true;
      dragStateRef.current.hasExceededDragThreshold = true;
      dragStateRef.current.currentDragValue = 55;
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(onChangeComplete).toHaveBeenCalledWith(55);
    });

    it("calls onDragStart once when drag threshold is exceeded", () => {
      const onDragStart = jest.fn();
      const props = createMockProps({ onDragStart });
      const state = createMockState({ isDragging: true, dragStartX: 100, lastClientX: 100 });
      const setState = () => {};
      const inputIsFocused = true;
      const setInputIsFocused = jest.fn();
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      dragStateRef.current.isDragging = true;
      dragStateRef.current.dragStartX = 100;
      dragStateRef.current.lastClientX = 100;
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      result.current.handleMouseMove(new MouseEvent("mousemove", { clientX: 120, clientY: 120 }));
      result.current.handleMouseMove(new MouseEvent("mousemove", { clientX: 130, clientY: 120 }));

      expect(onDragStart).toHaveBeenCalledTimes(1);
    });

    it("calls onDragEnd when drag threshold was exceeded and mouse is released", () => {
      const onDragEnd = jest.fn();
      const props = createMockProps({ onDragEnd });
      const state = createMockState({ isDragging: true });
      const setState = () => {};
      const inputIsFocused = false;
      const setInputIsFocused = jest.fn();
      const containerRef = createContainerRef();
      const dragStateRef = createDragStateRef();
      dragStateRef.current.isDragging = true;
      dragStateRef.current.hasExceededDragThreshold = true;
      const setSpeedFactorState = () => {};

      const { result } = renderHook(() =>
        useDragHandling(
          props,
          state,
          setState,
          inputIsFocused,
          setInputIsFocused,
          containerRef,
          dragStateRef,
          setSpeedFactorState
        )
      );

      result.current.handleMouseUp();

      expect(onDragEnd).toHaveBeenCalledTimes(1);
    });
  });
});
