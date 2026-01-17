/**
 * @typedef {Object} JobUpdate
 * @property {string} type - The type of update ('job_update', 'node_progress', 'node_update', 'output_update', 'preview_update')
 * @property {string} [status] - The job status ('completed', 'failed', 'running', 'queued', 'suspended', 'cancelled')
 * @property {any} [result] - The result data when job is completed
 * @property {string} [error] - Error message if job failed
 * @property {number} [progress] - Progress value for node_progress
 * @property {number} [total] - Total value for node_progress
 * @property {string} [node_id] - Node ID for node-specific updates
 * @property {string} [node_name] - Node name for display
 * @property {any} [value] - Value for output_update and preview_update
 * @property {string} [job_id] - Job ID for tracking
 * @property {string} [message] - Status message
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
    this.token = process.env.NODETOOL_TOKEN || "local_token";
    this.onMessage = null;
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    this.onOutputUpdate = null;
    this.onPreviewUpdate = null;
    this.onNodeUpdate = null;
    this.onJobUpdate = null;
    this.jobId = null;
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
      }, 120000);
    });
  }

  /**
   * Handles incoming WebSocket messages
   * @private
   * @param {JobUpdate} data - The decoded message data
   */
  handleMessage(data) {
    console.log("Received message:", data);

    // Store job_id if present
    if (data.job_id) {
      this.jobId = data.job_id;
    }

    // Handle different message types
    switch (data.type) {
      case "job_update":
        this.handleJobUpdate(data);
        break;
      case "output_update":
        this.handleOutputUpdate(data);
        break;
      case "preview_update":
        this.handlePreviewUpdate(data);
        break;
      case "node_progress":
        this.handleNodeProgress(data);
        break;
      case "node_update":
        this.handleNodeUpdate(data);
        break;
      case "error":
        this.handleError(data);
        break;
      default:
        // Pass through to generic message handler
        if (this.onMessage) {
          this.onMessage(data);
        }
    }
  }

  /**
   * Handles job update messages
   * @private
   * @param {JobUpdate} data - The job update data
   */
  handleJobUpdate(data) {
    // Update state based on job status
    switch (data.status) {
      case "running":
      case "queued":
        this.state = "running";
        break;
      case "completed":
        this.state = "idle";
        clearTimeout(this.runTimeout);
        if (this.resolveRun) {
          this.resolveRun(data.result);
        }
        break;
      case "failed":
      case "timed_out":
        this.state = "error";
        clearTimeout(this.runTimeout);
        if (this.rejectRun) {
          this.rejectRun(new Error(data.error || "Job failed"));
        }
        break;
      case "cancelled":
        this.state = "cancelled";
        clearTimeout(this.runTimeout);
        if (this.rejectRun) {
          this.rejectRun(new Error("Job was cancelled"));
        }
        break;
      case "suspended":
        this.state = "suspended";
        break;
      case "paused":
        this.state = "paused";
        break;
    }

    // Notify job update handler
    if (this.onJobUpdate) {
      this.onJobUpdate(data);
    }
  }

  /**
   * Handles output update messages (final results)
   * @private
   * @param {Object} data - The output update data
   */
  handleOutputUpdate(data) {
    console.log("Output update:", data);
    if (this.onOutputUpdate) {
      this.onOutputUpdate({
        nodeId: data.node_id,
        value: data.value
      });
    }
  }

  /**
   * Handles preview update messages (intermediate results)
   * @private
   * @param {Object} data - The preview update data
   */
  handlePreviewUpdate(data) {
    console.log("Preview update:", data);
    if (this.onPreviewUpdate) {
      this.onPreviewUpdate({
        nodeId: data.node_id,
        value: data.value
      });
    }
  }

  /**
   * Handles node progress updates
   * @private
   * @param {JobUpdate} data - The progress update data
   */
  handleNodeProgress(data) {
    const progress = (data.progress / data.total) * 100;
    if (this.onProgress) {
      this.onProgress(progress);
    }
    if (this.onMessage) {
      this.onMessage(data);
    }
  }

  /**
   * Handles node update messages
   * @private
   * @param {Object} data - The node update data
   */
  handleNodeUpdate(data) {
    if (this.onNodeUpdate) {
      this.onNodeUpdate({
        nodeId: data.node_id,
        nodeName: data.node_name,
        status: data.status,
        error: data.error,
        result: data.result
      });
    }
    if (this.onMessage) {
      this.onMessage(data);
    }
  }

  /**
   * Handles error messages
   * @private
   * @param {Object} data - The error data
   */
  handleError(data) {
    this.state = "error";
    clearTimeout(this.runTimeout);
    if (this.rejectRun) {
      this.rejectRun(new Error(data.error || "Unknown error"));
    }
    if (this.onError) {
      this.onError(data.error);
    }
  }

  /**
   * Cancels the current workflow execution
   * @returns {Promise<void>}
   */
  async cancel() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.jobId) {
      this.socket.send(
        msgpack.encode({
          command: "cancel_job",
          data: {
            job_id: this.jobId
          }
        })
      );
    }
  }
}
