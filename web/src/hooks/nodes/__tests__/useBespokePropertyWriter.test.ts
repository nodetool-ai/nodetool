import { renderHook, act } from "@testing-library/react";
import { useBespokePropertyWriter } from "../useBespokePropertyWriter";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn()
}));

jest.mock("../useInputNodeAutoRun", () => ({
  useNodeAutoRun: jest.fn()
}));

import { useNodes } from "../../../contexts/NodeContext";
import { useNodeAutoRun } from "../useInputNodeAutoRun";

const mockUseNodes = useNodes as jest.MockedFunction<typeof useNodes>;
const mockUseNodeAutoRun = useNodeAutoRun as jest.MockedFunction<
  typeof useNodeAutoRun
>;

describe("useBespokePropertyWriter", () => {
  const nodeId = "node-1";
  const nodeType = "nodetool.image.Resize";

  const mockUpdateNodeProperties = jest.fn();
  const mockOnPropertyChange = jest.fn();
  const mockOnPropertyChangeComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseNodes.mockReturnValue(mockUpdateNodeProperties);
    mockUseNodeAutoRun.mockReturnValue({
      onPropertyChange: mockOnPropertyChange,
      onPropertyChangeComplete: mockOnPropertyChangeComplete
    });
  });

  it("passes nodeId, nodeType, and 'bespoke' propertyName to useNodeAutoRun", () => {
    renderHook(() => useBespokePropertyWriter({ nodeId, nodeType }));

    expect(mockUseNodeAutoRun).toHaveBeenCalledWith({
      nodeId,
      nodeType,
      propertyName: "bespoke"
    });
  });

  it("setProperty calls updateNodeProperties with correct nodeId and property", () => {
    const { result } = renderHook(() =>
      useBespokePropertyWriter({ nodeId, nodeType })
    );

    act(() => {
      result.current.setProperty("width", 512);
    });

    expect(mockUpdateNodeProperties).toHaveBeenCalledWith(nodeId, {
      width: 512
    });
  });

  it("setProperty calls onPropertyChange after updating", () => {
    const { result } = renderHook(() =>
      useBespokePropertyWriter({ nodeId, nodeType })
    );

    act(() => {
      result.current.setProperty("height", 256);
    });

    expect(mockUpdateNodeProperties).toHaveBeenCalledTimes(1);
    expect(mockOnPropertyChange).toHaveBeenCalledTimes(1);
  });

  it("setProperties calls updateNodeProperties with all updates", () => {
    const { result } = renderHook(() =>
      useBespokePropertyWriter({ nodeId, nodeType })
    );

    const updates = { width: 1024, height: 768, quality: 90 };

    act(() => {
      result.current.setProperties(updates);
    });

    expect(mockUpdateNodeProperties).toHaveBeenCalledWith(nodeId, updates);
  });

  it("setProperties calls onPropertyChange after updating", () => {
    const { result } = renderHook(() =>
      useBespokePropertyWriter({ nodeId, nodeType })
    );

    act(() => {
      result.current.setProperties({ width: 1024, height: 768 });
    });

    expect(mockUpdateNodeProperties).toHaveBeenCalledTimes(1);
    expect(mockOnPropertyChange).toHaveBeenCalledTimes(1);
  });

  it("setPropertyComplete forwards to onPropertyChangeComplete", () => {
    const { result } = renderHook(() =>
      useBespokePropertyWriter({ nodeId, nodeType })
    );

    act(() => {
      result.current.setPropertyComplete();
    });

    expect(mockOnPropertyChangeComplete).toHaveBeenCalledTimes(1);
  });
});
