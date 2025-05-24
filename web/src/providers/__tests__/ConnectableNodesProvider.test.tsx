import React from "react";
import { render, act } from "@testing-library/react";
import { ConnectableNodesProvider } from "../ConnectableNodesProvider";
import useConnectableNodes from "../../stores/ConnectableNodesStore";
import metadataStore from "../../stores/MetadataStore";

// Mock metadata store
jest.mock("../../stores/MetadataStore", () => {
  const getState = jest.fn(() => ({ metadata: {} }));
  return { __esModule: true, default: { getState } };
});
// Access the mocked getState function
const getState = (metadataStore as any).getState as jest.Mock;

// Mock filter utilities
const mockFilterByInput = jest.fn();
const mockFilterByOutput = jest.fn();
jest.mock("../../components/node_menu/typeFilterUtils", () => ({
  filterTypesByInputType: (metadata: any, type: any) => mockFilterByInput(metadata, type),
  filterTypesByOutputType: (metadata: any, type: any) => mockFilterByOutput(metadata, type)
}));

const sampleType = {
  type: "test",
  optional: false,
  type_args: [],
  type_name: "test"
};

function setup(active = true) {
  let ctx: any;
  function Consumer() {
    ctx = useConnectableNodes();
    return null;
  }
  render(
    <ConnectableNodesProvider active={active}>
      <Consumer />
    </ConnectableNodesProvider>
  );
  return () => ctx!;
}


describe('ConnectableNodesProvider', () => {
  beforeEach(() => {
    mockFilterByInput.mockClear();
    mockFilterByOutput.mockClear();
    getState.mockReturnValue({ metadata: {} });
  });

  test('initial state values are set correctly', () => {
    const getCtx = setup();
    const ctx = getCtx();
    expect(ctx.nodeMetadata).toEqual([]);
    expect(ctx.filterType).toBeNull();
    expect(ctx.typeMetadata).toBeNull();
    expect(ctx.isVisible).toBe(false);
    expect(ctx.menuPosition).toBeNull();
    expect(ctx.sourceHandle).toBeNull();
    expect(ctx.targetHandle).toBeNull();
    expect(ctx.nodeId).toBeNull();
  });

  test('state updates through setters', () => {
    const getCtx = setup();
    act(() => {
      const ctx = getCtx();
      ctx.setFilterType('input');
      ctx.setTypeMetadata(sampleType);
      ctx.setSourceHandle('s');
      ctx.setTargetHandle('t');
      ctx.setNodeId('id');
    });
    const ctx = getCtx();
    expect(ctx.filterType).toBe('input');
    expect(ctx.typeMetadata).toEqual(sampleType);
    expect(ctx.sourceHandle).toBe('s');
    expect(ctx.targetHandle).toBe('t');
    expect(ctx.nodeId).toBe('id');
  });

  test('showMenu and hideMenu manage visibility when active', () => {
    const getCtx = setup();
    act(() => {
      getCtx().showMenu({ x: 1, y: 2 });
    });
    expect(getCtx().isVisible).toBe(true);
    expect(getCtx().menuPosition).toEqual({ x: 1, y: 2 });
    act(() => {
      getCtx().hideMenu();
    });
    expect(getCtx().isVisible).toBe(false);
    expect(getCtx().menuPosition).toBeNull();
  });

  test('showMenu does nothing when inactive', () => {
    const getCtx = setup(false);
    act(() => {
      getCtx().showMenu({ x: 5, y: 6 });
    });
    expect(getCtx().isVisible).toBe(false);
    expect(getCtx().menuPosition).toBeNull();
  });

  test('getConnectableNodes returns empty when typeMetadata or filterType missing', () => {
    const getCtx = setup();
    const result = getCtx().getConnectableNodes();
    expect(result).toEqual([]);
    expect(mockFilterByInput).not.toHaveBeenCalled();
    expect(mockFilterByOutput).not.toHaveBeenCalled();
  });

  test('getConnectableNodes uses filterTypesByInputType when filterType="input"', () => {
    const metadata = { a: 'b' } as any;
    getState.mockReturnValue({ metadata });
    mockFilterByInput.mockReturnValue(['in']);
    const getCtx = setup();
    act(() => {
      const ctx = getCtx();
      ctx.setFilterType('input');
      ctx.setTypeMetadata(sampleType);
    });
    const result = getCtx().getConnectableNodes();
    expect(mockFilterByInput).toHaveBeenCalledWith(Object.values(metadata), sampleType);
    expect(result).toEqual(['in']);
  });

  test('getConnectableNodes uses filterTypesByOutputType when filterType="output"', () => {
    const metadata = { a: 'b' } as any;
    getState.mockReturnValue({ metadata });
    mockFilterByOutput.mockReturnValue(['out']);
    const getCtx = setup();
    act(() => {
      const ctx = getCtx();
      ctx.setFilterType('output');
      ctx.setTypeMetadata(sampleType);
    });
    const result = getCtx().getConnectableNodes();
    expect(mockFilterByOutput).toHaveBeenCalledWith(Object.values(metadata), sampleType);
    expect(result).toEqual(['out']);
  });
});
