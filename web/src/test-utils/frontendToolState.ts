/**
 * A tool test reads two or three members of `FrontendToolState` and has to
 * supply every one of them, so a new member on the interface would otherwise
 * break each test that stands the state up.
 */
import type { FrontendToolState } from "../lib/tools/frontendTools";

export const makeFrontendToolState = (
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState => ({
  nodeMetadata: {},
  currentWorkflowId: "wf-1",
  getWorkflow: jest.fn(),
  addWorkflow: jest.fn(),
  removeWorkflow: jest.fn(),
  getNodeStore: jest.fn(),
  updateWorkflow: jest.fn(),
  saveWorkflow: jest.fn(),
  getCurrentWorkflow: jest.fn(),
  setCurrentWorkflowId: jest.fn(),
  fetchWorkflow: jest.fn(),
  newWorkflow: jest.fn(),
  createNew: jest.fn(),
  searchTemplates: jest.fn(),
  copy: jest.fn(),
  ...overrides
});
