const fetch = require("node-fetch");
const readline = require("readline");

const API_URL = "http://localhost:8000/api";
const API_TOKEN = "local_token"; // can be anything for local

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function runWorkflow(workflowId, params = {}) {
  const response = await fetch(`${API_URL}/jobs/run?stream=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      params: params,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  for await (const chunk of response.body) {
    const lines = chunk.toString().split("\n");
    for (const line of lines) {
      if (line.trim() === "") continue;
      try {
        const message = JSON.parse(line);
        handleMessage(message);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    }
  }
}

function handleMessage(message) {
  switch (message.type) {
    case "job_update":
      console.log("Job status:", message.status);
      if (message.status === "completed") {
        console.log("Workflow completed:", message.result);
      }
      break;
    case "node_progress":
      console.log(
        "Node progress:",
        message.node_id,
        `${((message.progress / message.total) * 100).toFixed(2)}%`
      );
      break;
    case "node_update":
      console.log(
        "Node update:",
        message.node_id,
        message.status,
        message.error || ""
      );
      if (message.logs) console.log("Logs:", message.logs);
      if (message.result) console.log("Result:", message.result);
      break;
    default:
      console.log("Unknown message type:", message);
  }
}

rl.question("Workflow ID: ", async (workflowId) => {
  try {
    console.log("Running workflow...");
    await runWorkflow(workflowId);
    console.log("Workflow execution completed.");
  } catch (error) {
    console.error("Error running workflow:", error);
  } finally {
    rl.close();
  }
});

rl.on("close", () => {
  process.exit(0);
});
