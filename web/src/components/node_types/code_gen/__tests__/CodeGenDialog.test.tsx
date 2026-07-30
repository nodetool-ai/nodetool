import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";
import "@testing-library/jest-dom";

import CodeGenDialog from "../CodeGenDialog";
import mockTheme from "../../../../__mocks__/themeMock";
import type { CodeGenResult } from "../../../../serverState/codeGen";

const mockApply = jest.fn();
jest.mock("../../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({ applyCodeGenSubmission: mockApply })
}));

const mockGenerate = jest.fn();
const mockCancel = jest.fn();
let mockResult: CodeGenResult | undefined;
let mockIsPending = false;

jest.mock("../../../../serverState/codeGen", () => ({
  useGenerateCode: () => ({
    generate: mockGenerate,
    cancel: mockCancel,
    reset: jest.fn(),
    result: mockResult,
    isPending: mockIsPending
  })
}));

let mockModelState = {
  model: { provider: "anthropic", id: "claude-sonnet-5", name: "Sonnet" },
  source: "code_preference" as const,
  skipped: [],
  isLoading: false,
  isBlocked: false
};

jest.mock("../../../../hooks/useCodeAuthoringModel", () => ({
  useCodeAuthoringModel: () => mockModelState,
  CODE_AUTHORING_SOURCE_LABEL: {
    code_preference: "Code Generation default",
    chat: "Chat model",
    language_model_preference: "Language Model default",
    application_default: "Application default"
  }
}));

const mockLoadMonaco = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../../hooks/editor/useMonacoEditor", () => ({
  useMonacoEditor: () => ({
    MonacoEditor: null,
    monacoLoadError: null,
    isMonacoLoading: false,
    loadMonacoIfNeeded: mockLoadMonaco,
    monacoRef: { current: null },
    monacoOnMount: jest.fn(),
    handleMonacoFind: jest.fn(),
    handleMonacoFormat: jest.fn()
  })
}));

const submission: codeGen.CodeGenSubmission = {
  title: "Merge rows on id",
  summary: "Joins two lists on their id field.",
  code: "return { merged: [] };",
  inputs: [{ name: "left", type: { type: "list", type_args: [] } }],
  outputs: [{ name: "merged", type: { type: "list", type_args: [] } }]
};

const renderDialog = (props: Partial<React.ComponentProps<typeof CodeGenDialog>> = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <CodeGenDialog
          open
          nodeId="code-1"
          onClose={props.onClose ?? jest.fn()}
          {...props}
        />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("CodeGenDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResult = undefined;
    mockIsPending = false;
    mockModelState = {
      model: { provider: "anthropic", id: "claude-sonnet-5", name: "Sonnet" },
      source: "code_preference",
      skipped: [],
      isLoading: false,
      isBlocked: false
    };
  });

  it("sends the instruction, inputs and resolved model", async () => {
    const user = userEvent.setup();
    renderDialog({
      inputs: [{ name: "rows", type: { type: "list", type_args: [] } }]
    });

    await user.type(
      screen.getByLabelText(/what should this node do/i),
      "merge them"
    );
    await user.click(screen.getByRole("button", { name: /generate/i }));

    expect(mockGenerate).toHaveBeenCalledWith({
      instruction: "merge them",
      inputs: [{ name: "rows", type: { type: "list", type_args: [] } }],
      provider: "anthropic",
      model: "claude-sonnet-5"
    });
  });

  it("keeps Generate disabled until an instruction is typed", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });

  it("applies the submission to the node and closes", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    mockResult = { status: "ok", submission };
    renderDialog({ onClose });

    expect(screen.getByText("Merge rows on id")).toBeInTheDocument();
    expect(
      screen.getByText("Joins two lists on their id field.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(mockApply).toHaveBeenCalledWith("code-1", submission);
    expect(onClose).toHaveBeenCalled();
  });

  it("cancelling changes nothing on the node", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    mockResult = { status: "ok", submission };
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("cannot apply before a submission arrives", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: /^apply$/i })).toBeDisabled();
  });

  it("announces progress and offers a stop while generating", () => {
    mockIsPending = true;
    renderDialog();
    const live = screen.getByRole("status", { name: "Generation status" });
    expect(live).toHaveTextContent(/generating code/i);
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
  });

  it("loads Monaco only when the code view is opened", async () => {
    const user = userEvent.setup();
    mockResult = { status: "ok", submission };
    renderDialog();

    expect(mockLoadMonaco).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /show generated code/i })
    );
    await waitFor(() => expect(mockLoadMonaco).toHaveBeenCalled());
  });

  it("blocks generation when no tool-capable model resolves", () => {
    mockModelState = {
      ...mockModelState,
      model: null as never,
      source: null as never,
      isBlocked: true
    };
    renderDialog();
    expect(
      screen.getByText(/no model available for code generation/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });

  describe("error states", () => {
    const cases: Array<[string, CodeGenResult, RegExp]> = [
      [
        "provider_unavailable",
        {
          status: "error",
          error: {
            code: "provider_unavailable",
            message: "no key",
            provider: "anthropic"
          }
        },
        /anthropic is not available/i
      ],
      [
        "aborted",
        { status: "error", error: { code: "aborted", message: "stopped" } },
        /generation cancelled/i
      ],
      [
        "no_valid_submission",
        {
          status: "error",
          error: {
            code: "no_valid_submission",
            message: "gave up",
            issues: ["output `merged` is not assigned on every return path"],
            rounds: 3
          }
        },
        /could not produce valid code/i
      ],
      [
        "rate_limited",
        {
          status: "error",
          error: {
            code: "rate_limited",
            message: "slow down",
            retryAfterMs: 5000
          }
        },
        /too many generations at once/i
      ],
      [
        "internal",
        { status: "error", error: { code: "internal", message: "boom" } },
        /generation failed/i
      ],
      [
        "unauthorized",
        {
          status: "error",
          error: { code: "unauthorized", message: "sign in" }
        },
        /sign in to generate code/i
      ],
      [
        "offline",
        { status: "error", error: { code: "offline", message: "no network" } },
        /you are offline/i
      ]
    ];

    it.each(cases)("renders a distinct state for %s", (_code, result, copy) => {
      mockResult = result;
      renderDialog();
      expect(screen.getByRole("status", { name: "Generation status" })).toHaveTextContent(copy);
      expect(screen.getAllByText(copy).length).toBeGreaterThan(0);
    });

    it("shows the validation issues fed back to the model", () => {
      mockResult = {
        status: "error",
        error: {
          code: "no_valid_submission",
          message: "gave up",
          issues: ["output `merged` is not assigned on every return path"],
          rounds: 3
        }
      };
      renderDialog();
      expect(
        screen.getByText(/not assigned on every return path/i)
      ).toBeInTheDocument();
    });

    it("waits out a rate limit with a concrete delay", () => {
      mockResult = {
        status: "error",
        error: { code: "rate_limited", message: "x", retryAfterMs: 5000 }
      };
      renderDialog();
      expect(screen.getByText(/wait about 5s/i)).toBeInTheDocument();
    });
  });
});
