import { render } from "@testing-library/react";
import { stub } from "../../../../test-utils/doubles";
import type { Workflow } from "../../../../stores/ApiTypes";
import type { AppDocMeta } from "@nodetool-ai/app-runtime";
import PuckAppEditor from "../PuckAppEditor";

const runtime = jest.fn((..._args: unknown[]) => null);
jest.mock("../../runtime/useAppRuntime", () => ({
  useAppRuntime: (...args: unknown[]) => runtime(...args)
}));
jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (select: (state: unknown) => unknown) =>
    select({ nodeStores: {} })
}));
jest.mock("@puckeditor/core", () => ({
  Puck: () => null,
  useGetPuck: jest.fn()
}));
jest.mock("../config", () => ({ appConfig: {} }));
jest.mock("../PuckAgentBinder", () => ({
  __esModule: true,
  default: () => null
}));
jest.mock("../../workflowState", () => ({ extractWorkflowState: () => ({}) }));
jest.mock("../BuilderWorkflowContext", () => ({
  BuilderWorkflowProvider: ({ children }: { children: React.ReactNode }) =>
    children
}));

it("keeps Recipe protection in the live design runtime document", () => {
  const recipe = stub<NonNullable<AppDocMeta["recipe"]>>({
    schemaVersion: 1,
    slug: "protected"
  });
  const meta: AppDocMeta = {
    operations: [],
    resources: [],
    variables: [],
    recipe
  };
  render(
    <PuckAppEditor
      applicationId="app"
      workflow={stub<Workflow>({ id: "wf" })}
      data={{ root: {}, content: [] }}
      meta={meta}
      onPublish={jest.fn()}
    />
  );
  expect(runtime).toHaveBeenLastCalledWith(
    expect.anything(),
    true,
    expect.objectContaining({
      document: expect.objectContaining({ recipe, schemaVersion: 5 })
    })
  );
});
