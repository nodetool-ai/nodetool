/**
 * @typedef {Object} JobUpdate
 * @property {string} type - The type of update ('job_update', 'node_progress', 'node_update')
 * @property {string} [status] - The job status ('completed', 'failed')
 * @property {any} [result] - The result data when job is completed
 * @property {string} [error] - Error message if job failed
 * @property {number} [progress] - Progress value for node_progress
 * @property {number} [total] - Total value for node_progress
 */

/**
 * Class for managing workflow execution and WebSocket communication
 */
class WorkflowRunner {
  /**
   * @param {string} apiUrl - The API endpoint URL
   * @param {string} workerUrl - The WebSocket worker URL
   */
  constructor(apiUrl, workerUrl) {
    this.apiUrl = apiUrl;
    this.workerUrl = workerUrl;
    this.socket = null;
    this.state = "idle";
    this.token = "local_token";
    this.onMessage = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
  }

  /**
   * Establishes WebSocket connection
   * @returns {Promise<void>}
   * @throws {Error} If connection fails
   */
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
          setTimeout(connectWebSocket, 5000);
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

  /**
   * Loads available workflows from the API
   * @returns {Promise<Array<Object>>} Array of workflow objects
   * @throws {Error} If API request fails
   */
  async loadWorkflows() {
    try {
      const response = await fetch(`${this.apiUrl}/workflows/`, {
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

  /**
   * Retrieves details for a specific workflow
   * @param {string} workflowId - ID of the workflow to fetch
   * @returns {Promise<Object>} Workflow details
   * @throws {Error} If API request fails
   */
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

  /**
   * Runs a workflow with specified parameters
   * @param {string} workflowId - ID of the workflow to run
   * @param {Object} [params={}] - Parameters to pass to the workflow
   * @returns {Promise<any>} Result of the workflow execution
   * @throws {Error} If execution fails or times out
   */
  async run(workflowId, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
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

      this.state = "running";
      this.resolveRun = resolve;
      this.rejectRun = reject;

      // Add a timeout to reject the promise if no response is received
      this.runTimeout = setTimeout(() => {
        this.rejectRun(new Error("Workflow execution timed out"));
      }, 60000);
    });
  }

  /**
   * Handles incoming WebSocket messages
   * @private
   * @param {JobUpdate} data - The decoded message data
   */
  handleMessage(data) {
    console.log("Received message:", data);
    if (data.type === "job_update" && data.status === "completed") {
      this.state = "idle";
      clearTimeout(this.runTimeout);
      this.resolveRun(data.result);
    } else if (data.type === "job_update" && data.status === "failed") {
      this.state = "idle";
      clearTimeout(this.runTimeout);
      this.rejectRun(new Error(data.error));
    } else if (data.type === "error") {
      this.state = "idle";
      clearTimeout(this.runTimeout);
      this.rejectRun(new Error(data.error));
    } else {
      this.handleProgress(data);
    }
  }

  /**
   * Handles progress updates from the workflow
   * @private
   * @param {JobUpdate} data - The progress update data
   */
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
