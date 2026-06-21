/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScopeToggle } from "../ScopeToggle";

describe("ScopeToggle", () => {
  it("is hidden when no worker is attached", () => {
    const { container } = render(
      <ScopeToggle
        scope="local"
        onChange={() => undefined}
        workerName={null}
        supported={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows Local + the worker name when a supported worker is attached", async () => {
    const onChange = jest.fn();
    render(
      <ScopeToggle
        scope="local"
        onChange={onChange}
        workerName="pod-a"
        supported={true}
      />
    );
    expect(
      screen.getByRole("button", { name: /Local/i })
    ).toBeInTheDocument();
    const worker = screen.getByRole("button", { name: /pod-a/i });
    await userEvent.click(worker);
    expect(onChange).toHaveBeenCalledWith("worker");
  });

  it("disables the Worker option when the worker image is too old", () => {
    render(
      <ScopeToggle
        scope="local"
        onChange={() => undefined}
        workerName="pod-a"
        supported={false}
      />
    );
    expect(
      screen.getByRole("button", { name: /pod-a/i })
    ).toBeDisabled();
  });
});
