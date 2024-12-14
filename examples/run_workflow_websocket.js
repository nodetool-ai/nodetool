const WebSocket = require("ws");
const readline = require("readline");

const WORKER_URL = "ws://localhost:8000/predict";
const API_TOKEN = "local_token"; // can be anything for local

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

class WorkflowRunner {
  constructor() {
    this.socket = null;
    this.jobId = null;
    this.state = "idle";
    this.mode = "text"; // Default to text mode
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WORKER_URL);

      this.socket.on("open", () => {
        console.log("WebSocket connected");
        this.state = "connected";
        this.setMode("text"); // Set mode to text after connection
        resolve();
      });

      this.socket.on("message", (data) => {
        const message = JSON.parse(data); // Parse JSON instead of msgpack
        this.handleMessage(message);
      });

      this.socket.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.state = "error";
        reject(error);
      });

      this.socket.on("close", () => {
        console.log("WebSocket disconnected");
        this.state = "idle";
      });
    });
  }

  setMode(mode) {
    this.mode = mode;
    const setModeCommand = {
      command: "set_mode",
      data: { mode: mode },
    };
    this.socket.send(JSON.stringify(setModeCommand));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.state = "idle";
    }
  }

  handleMessage(message) {
    console.log(message.type, message);

    switch (message.type) {
      case "job_update":
        this.jobId = message.job_id;
        switch (message.status) {
          case "completed":
            console.log("Job completed");
            this.state = "idle";
            this.disconnect();
            break;
          case "running":
            this.state = "running";
            break;
          case "cancelled":
            console.log("Job cancelled");
            this.state = "idle";
            this.disconnect();
            break;
          case "failed":
            console.error("Job failed:", message.error || "");
            this.state = "idle";
            this.disconnect();
            break;
        }
        break;
      case "prediction":
        console.log(`Node ${message.node_id} status: ${message.status}`);
        if (message.logs) console.log(`Logs: ${message.logs}`);
        break;
      case "node_progress":
        console.log(
          `Node ${message.node_id} progress: ${message.progress}/${message.total}`
        );
        break;
      case "node_update":
        if (message.error) {
          console.error(`Node ${message.node_id} error:`, message.error);
        } else {
          console.log(`Node ${message.node_id} status: ${message.status}`);
          if (message.logs) console.log(`Logs: ${message.logs}`);
          if (message.result) console.log(`Result:`, message.result);
        }
        break;
      default:
        console.log("Unknown message type:", message);
    }
  }

  async run(workflowId, params = {}) {
    if (!this.socket || this.state !== "connected") {
      await this.connect();
    }

    const runJobRequest = {
      command: "run_job",
      data: {
        type: "run_job_request",
        api_url: "http://localhost:8000/api",
        workflow_id: workflowId,
        auth_token: API_TOKEN,
        params: params,
      },
    };

    this.socket.send(JSON.stringify(runJobRequest));
    this.state = "running";
  }

  async cancel() {
    if (!this.socket || !this.jobId) {
      return;
    }

    const cancelJobRequest = {
      command: "cancel_job",
      data: { job_id: this.jobId },
    };

    this.socket.send(JSON.stringify(cancelJobRequest));
    this.state = "cancelled";
  }
}

const runner = new WorkflowRunner();

rl.question("Workflow ID: ", async (workflowId) => {
  try {
    await runner.run(workflowId);
    console.log("Workflow started. Press Ctrl+C to cancel.");
  } catch (error) {
    console.error("Error running workflow:", error);
    rl.close();
  }
});

process.on("SIGINT", async () => {
  console.log("\nCancelling job...");
  await runner.cancel();
  rl.close();
});

rl.on("close", () => {
  runner.disconnect();
  process.exit(0);
});
