1. Add `findMany` method to `Workflow` model in `packages/models/src/workflow.ts`.
   - The method should accept an array of workflow IDs and the user ID.
   - It will fetch the workflows in a single batched query using `getManyByIds`.
   - It will then perform the access check (ownership, public access, or collaborator grant) on the returned workflows.
   - It needs to perform the collaborator check efficiently, likely using `WorkflowCollaborator.grantedWorkflowIds` if there are private workflows that are not owned.

2. Refactor `packages/agents/src/capabilities/apps.ts` to use `findMany`.
   - Replace the loop `await Workflow.find(userId, id)` with a single call to `await Workflow.findMany(userId, [...ids])`.
   - Iterate through the result from `findMany`.

3. Ensure benchmarks/tests are run to verify the change.

4. Complete pre commit steps.
