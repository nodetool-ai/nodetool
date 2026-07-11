/** @jest-environment node */
import { eventToAction } from "../types";
import type { AppEvent, AppAction } from "../types";

describe("eventToAction", () => {
  it("converts a setState event to a setState action", () => {
    const event: AppEvent = {
      trigger: "change",
      kind: "setState",
      key: "color",
      value: "red"
    };
    expect(eventToAction(event)).toEqual({
      kind: "setState",
      key: "color",
      value: "red"
    });
  });

  it("defaults key and value to empty string for setState", () => {
    const event: AppEvent = { trigger: "click", kind: "setState" };
    expect(eventToAction(event)).toEqual({
      kind: "setState",
      key: "",
      value: ""
    });
  });

  it("converts a toggleState event", () => {
    const event: AppEvent = {
      trigger: "click",
      kind: "toggleState",
      key: "visible"
    };
    expect(eventToAction(event)).toEqual({
      kind: "toggleState",
      key: "visible"
    });
  });

  it("defaults key to empty string for toggleState", () => {
    const event: AppEvent = { trigger: "click", kind: "toggleState" };
    expect(eventToAction(event)).toEqual({ kind: "toggleState", key: "" });
  });

  it("converts a cancel event", () => {
    const event: AppEvent = { trigger: "click", kind: "cancel" };
    expect(eventToAction(event)).toEqual({ kind: "cancel" });
  });

  it("converts a run event and passes through from", () => {
    const event: AppEvent = { trigger: "click", kind: "run" };
    expect(eventToAction(event, "prompt")).toEqual({
      kind: "run",
      from: "prompt"
    });
  });

  it("run action has undefined from when not provided", () => {
    const event: AppEvent = { trigger: "click", kind: "run" };
    const action = eventToAction(event);
    expect(action.kind).toBe("run");
    expect((action as { from?: string }).from).toBeUndefined();
  });

  it("falls through to run for unknown kind", () => {
    const event = { trigger: "click", kind: "unknown" } as unknown as AppEvent;
    const action = eventToAction(event, "input1");
    expect(action.kind).toBe("run");
    expect((action as { from?: string }).from).toBe("input1");
  });
});
