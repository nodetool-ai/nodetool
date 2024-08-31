class WorkflowRunner {
  constructor(apiUrl, workerUrl) {
    this.apiUrl = apiUrl;
    this.workerUrl = workerUrl;
    this.socket = null;
    this.state = "idle";
    this.token = "";
    this.onMessage = null;
    this.onProgress = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const connectWebSocket = () => {
        this.socket = new WebSocket(this.workerUrl);
        this.socket.binaryType = "arraybuffer";

        this.socket.onopen = () => {
          console.log("WebSocket connected");
          this.state = "connected";
          resolve();
        };

        this.socket.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.state = "error";
          reject(error);
        };

        this.socket.onclose = () => {
          console.log("WebSocket closed, attempting to reconnect...");
          this.state = "idle";
          setTimeout(connectWebSocket, 5000); // Attempt to reconnect after 5 seconds
        };

        this.socket.onmessage = (event) => {
          const arrayBuffer = event.data;
          const data = msgpack.decode(new Uint8Array(arrayBuffer));
          this.handleMessage(data);
        };
      };

      connectWebSocket();
    });
  }

  async loadWorkflows() {
    try {
      const response = await fetch(`${this.apiUrl}/workflows`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to load workflows: ${response.status} ${response.statusText}`
        );
      }
      return await response.json();
    } catch (error) {
      console.error("Error loading workflows:", error);
      throw error;
    }
  }

  async getWorkflowDetails(workflowId) {
    try {
      const response = await fetch(`${this.apiUrl}/workflows/${workflowId}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load workflow details");
      }
      return await response.json();
    } catch (error) {
      console.error("Error loading workflow details:", error);
      throw error;
    }
  }

  async run(workflowId, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const sendRequest = () => {
        this.state = "running";

        const request = {
          type: "run_job_request",
          api_url: this.apiUrl,
          workflow_id: workflowId,
          job_type: "workflow",
          auth_token: this.token,
          params: params,
        };

        console.log("Sending request:", request);

        this.socket.send(
          msgpack.encode({
            command: "run_job",
            data: request,
          })
        );

        this.resolveRun = resolve;
        this.rejectRun = reject;
      };

      if (this.socket.readyState === WebSocket.OPEN) {
        sendRequest();
      } else {
        this.socket.addEventListener("open", sendRequest, { once: true });
      }
    });
  }

  handleMessage(data) {
    console.log("Received message:", data);
    if (data.type === "job_update" && data.status === "completed") {
      this.state = "idle";
      this.resolveRun(data.result);
    } else if (data.type === "job_update" && data.status === "failed") {
      this.state = "idle";
      this.rejectRun(new Error(data.error));
    } else if (data.type === "error") {
      this.state = "idle";
      this.rejectRun(new Error(data.error));
    } else {
      this.handleProgress(data);
    }
  }

  handleProgress(data) {
    if (data.type === "node_progress") {
      const progress = (data.progress / data.total) * 100;
      if (this.onProgress) {
        this.onProgress(progress);
      }
    } else if (data.type === "node_update") {
      if (this.onMessage) {
        this.onMessage(data);
      }
    }
  }
}
