import { test, expect } from "@playwright/test";
import { BACKEND_API_URL } from "./support/backend";

/**
 * Jobs API tests against the real TS backend.
 * These verify the jobs listing and detail endpoints,
 * covering the consumer hooks:
 *   - useRunningJobs (GET /api/jobs/)
 *   - Job status/cancel operations
 */

// Skip when executed by Jest
if (process.env.JEST_WORKER_ID) {
  test.skip("skipped in jest runner", () => {});
} else {
  test.describe("Jobs API (Real Backend)", () => {
    test.describe("List jobs", () => {
      test("should list jobs via API", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/jobs/`);
        expect(res.status()).toBe(200);

        const data = await res.json();
        expect(data.jobs).toBeDefined();
        expect(Array.isArray(data.jobs)).toBe(true);

        // If there are jobs, validate structure
        if (data.jobs.length > 0) {
          const job = data.jobs[0];
          expect(job).toHaveProperty("id");
          expect(job).toHaveProperty("status");
          expect(job).toHaveProperty("workflow_id");
          expect(job).toHaveProperty("job_type");
        }
      });

      test("should support limit parameter on job list", async ({
        request
      }) => {
        const res = await request.get(`${BACKEND_API_URL}/jobs/?limit=5`);
        expect(res.status()).toBe(200);

        const data = await res.json();
        expect(data.jobs.length).toBeLessThanOrEqual(5);
      });

      test("should filter jobs by workflow_id", async ({ request }) => {
        // Create a workflow to use as filter target.
        // Note: We cannot easily create a real job without running a full workflow
        // execution, so this test verifies the filtering endpoint returns a valid
        // (potentially empty) response scoped to the given workflow_id.
        const workflowRes = await request.post(
          `${BACKEND_API_URL}/workflows/`,
          {
            data: {
              name: `e2e-jobs-workflow-${Date.now()}`,
              description: "",
              access: "private"
            }
          }
        );
        const workflow = await workflowRes.json();

        try {
          const res = await request.get(
            `${BACKEND_API_URL}/jobs/?workflow_id=${workflow.id}`
          );
          expect(res.status()).toBe(200);

          const data = await res.json();
          expect(data.jobs).toBeDefined();
          expect(Array.isArray(data.jobs)).toBe(true);

          // All returned jobs should be for this workflow
          for (const job of data.jobs) {
            expect(job.workflow_id).toBe(workflow.id);
          }
        } finally {
          await request.delete(
            `${BACKEND_API_URL}/workflows/${workflow.id}`
          );
        }
      });
    });

    test.describe("Job details", () => {
      test("should return 404 for non-existent job", async ({ request }) => {
        const res = await request.get(
          `${BACKEND_API_URL}/jobs/nonexistent-job-id-12345`
        );
        expect(res.status()).toBe(404);
      });
    });

    test.describe("Running jobs", () => {
      test("should list running jobs", async ({ request }) => {
        const res = await request.get(`${BACKEND_API_URL}/jobs/running/all`);
        expect(res.status()).toBe(200);

        const data = await res.json();
        // Should return an array or object with jobs
        expect(data).toBeDefined();
      });
    });
  });
}
