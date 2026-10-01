import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { parseApplicationDocument } from "@nodetool-ai/app-runtime";
import priceDrop from "../../../../../packages/base-nodes/nodetool/examples/apps/product-price-drop.app.json";
import mockTheme from "../../../__mocks__/themeMock";
import { TextInputWidget, ChoiceCardsWidget, ApprovalWidget } from "../puck/widgets";
import { makeTestRuntime } from "./testRuntime";

it("writes exact Recipe copy and generic decisions into normal Application variables", () => {
  const app = parseApplicationDocument(priceDrop.app);
  if (!app) throw new Error("Invalid Recipe Application fixture");
  const runtime = makeTestRuntime({variables: {direction: "Bold editorial rhythm", approval: "pending"}}, {scope: {defaultOperationId: "plan", operations: [], variables: app.variables}});
  const content = priceDrop.app.ui.content;
  const input = content.find(item => item.props.id === "newPrice")!.props;
  const direction = content.find(item => item.props.id === "direction")!.props;
  const approval = content.find(item => item.props.id === "approval")!.props;
  render(<ThemeProvider theme={mockTheme}><runtime.wrapper>
    <TextInputWidget id={input.id} binding={input.binding} label={input.label} />
    <ChoiceCardsWidget id={direction.id} binding={direction.binding} label={direction.label} options={direction.options} />
    <ApprovalWidget id={approval.id} binding={approval.binding} label={approval.label} description={approval.description} />
  </runtime.wrapper></ThemeProvider>);
  fireEvent.change(screen.getByLabelText("New price"), {target: {value: "  €29  "}});
  fireEvent.click(screen.getByRole("radio", {name: "Quiet premium"}));
  fireEvent.click(screen.getByRole("button", {name: "Approve"}));
  expect(runtime.store.getState().variables.newPrice).toBe("  €29  ");
  expect(runtime.store.getState().variables.direction).toBe("Quiet premium composition");
  expect(runtime.store.getState().variables.approval).toBe("approved");
  const mapping = app.operations.find(op => op.id === "plan")!.inputs.newPrice;
  expect(mapping).toEqual({from: "variable", variableId: "newPrice"});
});
