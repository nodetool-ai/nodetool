import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { DEFAULT_OPERATION_ID } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, OUTPUT_KEY } from "../../__tests__/testRuntime";
import { ChatComposerWidget, ChatThreadWidget } from "../ChatWidgets";

const HISTORY = "var:chat";
const REPLY = `op:${DEFAULT_OPERATION_ID}/out:out1`;
const PROMPT = `op:${DEFAULT_OPERATION_ID}/in:in1`;

const SCOPED = {
  scope: {
    defaultOperationId: DEFAULT_OPERATION_ID,
    operations: [
      {
        operationId: DEFAULT_OPERATION_ID,
        inputs: [{ nodeId: "in1", name: "prompt" }],
        outputs: [{ nodeId: "out1", name: "result" }],
        nodeIds: ["in1", "out1"]
      }
    ],
    variables: [
      { id: "chat", name: "chat", scope: "instance" as const, persist: false }
    ]
  }
};

const renderWith = (
  ui: React.ReactElement,
  runtime: ReturnType<typeof makeTestRuntime>
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>{ui}</runtime.wrapper>
    </ThemeProvider>
  );

describe("ChatThreadWidget", () => {
  it("renders a bound conversation as user and assistant turns", () => {
    const runtime = makeTestRuntime(
      {
        variables: {
          chat: [
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi there" }
          ]
        }
      },
      SCOPED
    );
    renderWith(<ChatThreadWidget id="t1" binding={HISTORY} />, runtime);

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("hi there")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows the placeholder when the conversation is empty", () => {
    const runtime = makeTestRuntime({}, SCOPED);
    renderWith(
      <ChatThreadWidget id="t1" binding={HISTORY} placeholder="Say something" />,
      runtime
    );
    expect(screen.getByText("Say something")).toBeInTheDocument();
  });

  it("appends the streaming reply after the conversation", () => {
    const runtime = makeTestRuntime(
      {
        variables: { chat: [{ role: "user", content: "hello" }] },
        outputs: {
          [OUTPUT_KEY]: {
            value: "thinking out loud",
            invocationId: "inv1",
            status: "streaming",
            revision: 1
          }
        },
        invocations: {
          inv1: {
            id: "inv1",
            operationId: DEFAULT_OPERATION_ID,
            status: "running" as const,
            startedAt: 1
          }
        }
      },
      SCOPED
    );
    renderWith(
      <ChatThreadWidget id="t1" binding={HISTORY} streamBinding={REPLY} />,
      runtime
    );
    expect(screen.getByText("thinking out loud")).toBeInTheDocument();
  });

  it("folds a completed reply into the conversation variable", async () => {
    const runtime = makeTestRuntime(
      {
        variables: { chat: [{ role: "user", content: "hello" }] },
        outputs: {
          [OUTPUT_KEY]: {
            value: "the answer",
            invocationId: "inv1",
            status: "done",
            revision: 2
          }
        },
        invocations: {
          inv1: {
            id: "inv1",
            operationId: DEFAULT_OPERATION_ID,
            status: "completed" as const,
            startedAt: 1
          }
        }
      },
      SCOPED
    );
    renderWith(
      <ChatThreadWidget id="t1" binding={HISTORY} streamBinding={REPLY} />,
      runtime
    );

    await waitFor(() =>
      expect(runtime.value.write).toHaveBeenCalledWith(
        { kind: "variable", variableId: "chat" },
        [
          { role: "user", content: "hello" },
          { type: "message", role: "assistant", content: "the answer" }
        ]
      )
    );
    // The reply now lives in the conversation, so the live bubble must not
    // render it a second time.
    expect(screen.getAllByText("the answer")).toHaveLength(1);
  });
});

describe("ChatComposerWidget", () => {
  const RUN_EVENT = [{ trigger: "click" as const, kind: "run" }];

  it("sends the draft to the bound input and runs the workflow", async () => {
    const user = userEvent.setup();
    const runtime = makeTestRuntime({}, SCOPED);
    renderWith(
      <ChatComposerWidget
        id="c1"
        binding={PROMPT}
        historyBinding={HISTORY}
        events={RUN_EVENT}
      />,
      runtime
    );

    const box = screen.getByLabelText("Message");
    await user.type(box, "write me a poem");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(runtime.store.getState().inputs[`${DEFAULT_OPERATION_ID}:in1`].value).toBe(
      "write me a poem"
    );
    expect(runtime.value.write).toHaveBeenCalledWith(
      { kind: "variable", variableId: "chat" },
      [{ type: "message", role: "user", content: "write me a poem" }]
    );
    expect(runtime.value.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "run", operationId: DEFAULT_OPERATION_ID })
    );
    expect(box).toHaveValue("");
  });

  it("sends the whole conversation when the format asks for it", async () => {
    const user = userEvent.setup();
    const runtime = makeTestRuntime(
      { variables: { chat: [{ role: "assistant", content: "how can I help?" }] } },
      SCOPED
    );
    renderWith(
      <ChatComposerWidget
        id="c1"
        binding={PROMPT}
        historyBinding={HISTORY}
        valueFormat="history"
        events={RUN_EVENT}
      />,
      runtime
    );

    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(runtime.store.getState().inputs[`${DEFAULT_OPERATION_ID}:in1`].value).toEqual([
      { role: "assistant", content: "how can I help?" },
      { type: "message", role: "user", content: "hi" }
    ]);
  });

  it("will not send an empty draft", async () => {
    const runtime = makeTestRuntime({}, SCOPED);
    renderWith(
      <ChatComposerWidget id="c1" binding={PROMPT} events={RUN_EVENT} />,
      runtime
    );
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(runtime.value.dispatch).not.toHaveBeenCalled();
  });
});
