import { describe, it, expect, beforeEach } from "vitest";
import {
  MemoryAdapterFactory,
  setGlobalAdapterResolver,
  Job,
} from "@nodetool/models";
import { handleApiRequest } from "../src/http-api.js";

async function jsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

describe("HTTP API: jobs", () => {
  beforeEach(async () => {
    const factory = new MemoryAdapterFactory();
    setGlobalAdapterResolver((schema) => factory.getAdapter(schema));
    await Job.createTable();
  });

  it("GET /api/jobs returns empty list when no jobs exist", async () => {
    const request = new Request("http://localhost/api/jobs", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as {
      jobs: Array<Record<string, unknown>>;
      next_start_key: string | null;
    };
    expect(data.jobs).toEqual([]);
    expect(data.next_start_key).toBeNull();
  });

  it("GET /api/jobs returns jobs for the authenticated user", async () => {
    await Job.create({
      user_id: "user-1",
      workflow_id: "wf-1",
      status: "running",
      name: "Job 1",
    });
    await Job.create({
      user_id: "user-1",
      workflow_id: "wf-2",
      status: "completed",
      name: "Job 2",
    });
    // Job for a different user - should not appear
    await Job.create({
      user_id: "user-2",
      workflow_id: "wf-3",
      status: "running",
      name: "Job 3",
    });

    const request = new Request("http://localhost/api/jobs", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as {
      jobs: Array<Record<string, unknown>>;
      next_start_key: string | null;
    };
    expect(data.jobs.length).toBe(2);
    for (const job of data.jobs) {
      expect(job.user_id).toBe("user-1");
      expect(job.job_type).toBe("workflow");
    }
  });

  it("GET /api/jobs?workflow_id=... filters by workflow_id", async () => {
    await Job.create({
      user_id: "user-1",
      workflow_id: "wf-1",
      status: "running",
      name: "Job A",
    });
    await Job.create({
      user_id: "user-1",
      workflow_id: "wf-2",
      status: "completed",
      name: "Job B",
    });

    const request = new Request("http://localhost/api/jobs?workflow_id=wf-1", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as {
      jobs: Array<Record<string, unknown>>;
      next_start_key: string | null;
    };
    expect(data.jobs.length).toBe(1);
    expect(data.jobs[0].workflow_id).toBe("wf-1");
  });

  it("GET /api/jobs/:id returns a specific job", async () => {
    const created = (await Job.create({
      user_id: "user-1",
      workflow_id: "wf-1",
      status: "running",
      name: "My Job",
    })) as Job;

    const request = new Request(`http://localhost/api/jobs/${created.id}`, {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as Record<string, unknown>;
    expect(data.id).toBe(created.id);
    expect(data.workflow_id).toBe("wf-1");
    expect(data.status).toBe("running");
    expect(data.job_type).toBe("workflow");
    expect(data.error).toBeNull();
    expect(data.cost).toBeNull();
  });

  it("GET /api/jobs/:id returns 404 for nonexistent job", async () => {
    const request = new Request("http://localhost/api/jobs/nonexistent-id", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(404);

    const data = (await jsonBody(response)) as Record<string, unknown>;
    expect(data.detail).toBe("Job not found");
  });

  it("GET /api/jobs/:id returns 404 for job owned by another user", async () => {
    const created = (await Job.create({
      user_id: "user-2",
      workflow_id: "wf-1",
      status: "running",
      name: "Other user job",
    })) as Job;

    const request = new Request(`http://localhost/api/jobs/${created.id}`, {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(404);
  });

  it("POST /api/jobs/:id/cancel cancels a job", async () => {
    const created = (await Job.create({
      user_id: "user-1",
      workflow_id: "wf-1",
      status: "running",
      name: "Running Job",
    })) as Job;

    const request = new Request(`http://localhost/api/jobs/${created.id}/cancel`, {
      method: "POST",
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as Record<string, unknown>;
    expect(data.job_id).toBe(created.id);
    expect(data.status).toBe("cancelled");
    expect(data.is_completed).toBe(true);

    // Verify persisted
    const refreshed = (await Job.get(created.id)) as Job;
    expect(refreshed.status).toBe("cancelled");
  });

  it("POST /api/jobs/:id/cancel returns 404 for nonexistent job", async () => {
    const request = new Request("http://localhost/api/jobs/nonexistent-id/cancel", {
      method: "POST",
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(404);

    const data = (await jsonBody(response)) as Record<string, unknown>;
    expect(data.detail).toBe("Job not found");
  });

  it("GET /api/jobs respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await Job.create({
        user_id: "user-1",
        workflow_id: `wf-${i}`,
        status: "completed",
        name: `Job ${i}`,
      });
    }

    const request = new Request("http://localhost/api/jobs?limit=2", {
      headers: { "x-user-id": "user-1" },
    });
    const response = await handleApiRequest(request);
    expect(response.status).toBe(200);

    const data = (await jsonBody(response)) as {
      jobs: Array<Record<string, unknown>>;
      next_start_key: string | null;
    };
    expect(data.jobs.length).toBe(2);
  });
});
