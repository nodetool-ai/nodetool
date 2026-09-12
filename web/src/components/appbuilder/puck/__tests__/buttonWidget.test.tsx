import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { AppInstanceState } from "@nodetool-ai/app-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import { makeTestRuntime, TEST_SCOPE } from "../../__tests__/testRuntime";
import { withConditions } from "../conditionalWidget";
import { ButtonWidget } from "../widgets";

const runningState = (): Partial<AppInstanceState> => ({
  invocations: {
    invocation1: {
      id: "invocation1",
      operationId: "main",
      status: "running",
      startedAt: 1
    }
  },
  activeInvocation: { main: "invocation1" }
});

const renderButton = (
  props: React.ComponentProps<typeof ButtonWidget>,
  initial: Partial<AppInstanceState> = {},
  overrides: Parameters<typeof makeTestRuntime>[1] = {}
) => {
  const runtime = makeTestRuntime(initial, overrides);
  const result = render(
    <ThemeProvider theme={mockTheme}>
      <runtime.wrapper>
        <ButtonWidget {...props} />
      </runtime.wrapper>
    </ThemeProvider>
  );
  return { ...runtime, ...result };
};

const ConditionalCancelButton = withConditions((props) => (
  <ButtonWidget
    id={props.id}
    label="Cancel"
    disabled={props.disabled === true}
    events={[{ trigger: "click", kind: "cancel", operationId: "main" }]}
  />
));

describe("ButtonWidget", () => {
  it("disables a run action only while its operation is running", async () => {
    const user = userEvent.setup();
    const runtime = renderButton({
      id: "run",
      label: "Run",
      events: [{ trigger: "click", kind: "run", operationId: "main" }]
    });

    const idleButton = screen.getByRole("button", { name: "Run" });
    expect(idleButton).toBeEnabled();
    await user.click(idleButton);
    expect(runtime.value.dispatch).toHaveBeenCalledWith({
      kind: "run",
      operationId: "main"
    });

    act(() => {
      runtime.store.getState().dispatchEvent({
        type: "runStarted",
        invocation: {
          id: "invocation1",
          operationId: "main",
          status: "running",
          startedAt: 1
        },
        outputKeys: []
      });
    });
    const runningButton = screen.getByRole("button", { name: "Running" });
    expect(runningButton).toBeDisabled();
    expect(runtime.value.dispatch).toHaveBeenCalledTimes(1);

    act(() => {
      runtime.store.getState().dispatchEvent({
        type: "invocationStatus",
        invocationId: "invocation1",
        status: "completed"
      });
    });
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
  });

  it("keeps a cancel action enabled while its operation is running", async () => {
    const user = userEvent.setup();
    const runtime = renderButton(
      {
        id: "cancel",
        label: "Cancel",
        events: [{ trigger: "click", kind: "cancel", operationId: "main" }]
      },
      runningState()
    );

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(runtime.value.dispatch).toHaveBeenCalledWith({
      kind: "cancel",
      operationId: "main"
    });
  });

  it("activates an enabled cancel action from the keyboard", async () => {
    const user = userEvent.setup();
    const runtime = renderButton(
      {
        id: "cancel-keyboard",
        label: "Cancel",
        events: [{ trigger: "click", kind: "cancel", operationId: "main" }]
      },
      runningState()
    );

    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(runtime.value.dispatch).toHaveBeenCalledWith({
      kind: "cancel",
      operationId: "main"
    });
  });

  it("keeps a literal variable action enabled during a run", async () => {
    const user = userEvent.setup();
    const runtime = renderButton(
      {
        id: "set-phase",
        label: "Review",
        events: [
          {
            trigger: "click",
            kind: "setVariable",
            key: "var:phase",
            value: "review"
          }
        ]
      },
      runningState(),
      {
        scope: {
          ...TEST_SCOPE,
          variables: [
            {
              id: "phase",
              name: "phase",
              scope: "instance",
              persist: false
            }
          ]
        }
      }
    );

    const button = screen.getByRole("button", { name: "Review" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(runtime.value.dispatch).toHaveBeenCalledWith({
      kind: "setVariable",
      variableId: "phase",
      value: "review"
    });
  });

  it("lets an explicit disabled condition disable a cancel action", () => {
    const runtime = makeTestRuntime(runningState());

    render(
      <ThemeProvider theme={mockTheme}>
        <runtime.wrapper>
          <ConditionalCancelButton
            id="conditional-cancel"
            disabledWhen={{
              binding: "op:main/exec#running",
              op: "notEmpty"
            }}
          />
        </runtime.wrapper>
      </ThemeProvider>
    );

    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button).toBeDisabled();
    expect(runtime.value.dispatch).not.toHaveBeenCalled();
  });

  it("treats mixed run and literal events as a run action while busy", () => {
    const runtime = renderButton(
      {
        id: "mixed",
        label: "Run and advance",
        events: [
          {
            trigger: "click",
            kind: "setVariable",
            key: "var:phase",
            value: "running"
          },
          { trigger: "click", kind: "run", operationId: "main" }
        ]
      },
      runningState()
    );

    const button = screen.getByRole("button", { name: "Running" });
    expect(button).toBeDisabled();
    expect(runtime.value.dispatch).not.toHaveBeenCalled();
  });
});
