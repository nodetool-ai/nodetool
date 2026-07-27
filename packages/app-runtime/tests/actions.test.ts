import { describe, expect, it } from "vitest";
import { eventToAction, type AppEvent, type EventContext } from "../src/actions.js";

const ctx: EventContext = {
  defaultOperationId: "main",
  resolveVariableId: (key) => (key === "dark" ? "var-dark" : null),
  from: "widget-1"
};

const click = (event: Partial<AppEvent>): AppEvent => ({
  trigger: "click",
  kind: "run",
  ...event
});

describe("eventToAction supported kinds", () => {
  it("runs the named operation, or the default one", () => {
    expect(eventToAction(click({ kind: "run" }), ctx)).toEqual({
      kind: "run",
      operationId: "main",
      from: "widget-1"
    });
    expect(eventToAction(click({ kind: "run", operationId: "publish" }), ctx)).toEqual({
      kind: "run",
      operationId: "publish",
      from: "widget-1"
    });
  });

  it("reads an absent or empty kind as run, the pre-`kind` document shape", () => {
    const legacy = { trigger: "click", operationId: "publish" } as unknown as AppEvent;
    expect(eventToAction(legacy, ctx)).toEqual({
      kind: "run",
      operationId: "publish",
      from: "widget-1"
    });
    expect(eventToAction(click({ kind: "" }), ctx)).toEqual({
      kind: "run",
      operationId: "main",
      from: "widget-1"
    });
  });

  it("sets and toggles variables under both the current and legacy names", () => {
    expect(eventToAction(click({ kind: "setVariable", key: "dark", value: "1" }), ctx)).toEqual(
      { kind: "setVariable", variableId: "var-dark", value: "1" }
    );
    expect(eventToAction(click({ kind: "setState", key: "dark", value: "1" }), ctx)).toEqual({
      kind: "setVariable",
      variableId: "var-dark",
      value: "1"
    });
    expect(eventToAction(click({ kind: "toggleVariable", key: "dark" }), ctx)).toEqual({
      kind: "toggleVariable",
      variableId: "var-dark"
    });
    expect(eventToAction(click({ kind: "toggleState", key: "dark" }), ctx)).toEqual({
      kind: "toggleVariable",
      variableId: "var-dark"
    });
  });

  it("defaults a setVariable with no literal to the empty string", () => {
    expect(eventToAction(click({ kind: "setVariable", key: "dark" }), ctx)).toEqual({
      kind: "setVariable",
      variableId: "var-dark",
      value: ""
    });
  });

  it("cancels the default operation, or one named invocation", () => {
    expect(eventToAction(click({ kind: "cancel" }), ctx)).toEqual({
      kind: "cancel",
      operationId: "main"
    });
    expect(
      eventToAction(click({ kind: "cancel", operationId: "publish", invocationId: "j7" }), ctx)
    ).toEqual({ kind: "cancel", operationId: "publish", invocationId: "j7" });
  });

  it("passes each resource command through", () => {
    for (const command of ["read", "create", "update", "delete", "upload"]) {
      expect(
        eventToAction(click({ kind: "resourceCommand", resourceBindingId: "r1", command }), ctx)
      ).toEqual({ kind: "resourceCommand", resourceBindingId: "r1", command });
    }
  });

  it("opens a bound resource", () => {
    expect(eventToAction(click({ kind: "openResource", resourceBindingId: "r1" }), ctx)).toEqual({
      kind: "openResource",
      resourceBindingId: "r1"
    });
  });
});

describe("eventToAction rejections", () => {
  it("returns null for an unknown kind rather than running the workflow", () => {
    for (const kind of ["runn", "RUN", "setVariabel", "navigate", " run"]) {
      expect(eventToAction(click({ kind }), ctx)).toBeNull();
    }
  });

  it("returns null when a variable action names no live variable", () => {
    expect(eventToAction(click({ kind: "setVariable", key: "ghost" }), ctx)).toBeNull();
    expect(eventToAction(click({ kind: "toggleVariable" }), ctx)).toBeNull();
  });

  it("returns null for a resource command missing a binding or naming no command", () => {
    expect(eventToAction(click({ kind: "resourceCommand", command: "upload" }), ctx)).toBeNull();
    expect(
      eventToAction(click({ kind: "resourceCommand", resourceBindingId: "r1" }), ctx)
    ).toBeNull();
    expect(
      eventToAction(
        click({ kind: "resourceCommand", resourceBindingId: "r1", command: "rename" }),
        ctx
      )
    ).toBeNull();
  });

  it("returns null for openResource with no binding", () => {
    expect(eventToAction(click({ kind: "openResource" }), ctx)).toBeNull();
  });
});
