import React from "react";

const mockGetNode = jest.fn();
const mockGetNodes = jest.fn();
const mockGetEdges = jest.fn();
const mockScreenToFlowPosition = jest.fn((pos) => pos);

module.exports = {
  useReactFlow: () => ({
    getNode: mockGetNode,
    getNodes: mockGetNodes,
    getEdges: mockGetEdges,
    screenToFlowPosition: mockScreenToFlowPosition
  }),
  Panel: () => null,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useStore: () => (() => ({})),
  Node: function MockNode() { return null; },
  Edge: function MockEdge() { return null; },
  Handle: function MockHandle() { return null; },
  Position: {
    Top: "top",
    Bottom: "bottom",
    Left: "left",
    Right: "right"
  },
  MarkerType: {
    ArrowClosed: "arrowclosed",
    Arrow: "arrow",
    Bezier: "bezier",
    Step: "step",
    SmoothStep: "smoothstep",
    Percentage: "percentage"
  },
  ConnectionMode: {
    Strict: "strict",
    Loose: "loose"
  },
  getRectOfNodes: jest.fn(),
  getTransformForBounds: jest.fn(),
  applyNodeChanges: jest.fn(),
  applyEdgeChanges: jest.fn(),
  addEdge: jest.fn(),
  onNodesChange: jest.fn(),
  onEdgesChange: jest.fn(),
  onConnect: jest.fn(),
  useNodesState: jest.fn(),
  useEdgesState: jest.fn(),
  Controls: function MockControls() { return null; },
  Background: function MockBackground() { return null; },
  MiniMap: function MockMiniMap() { return null; },
  PanelBottom: function MockPanelBottom() { return null; }
};
