/**
 * @typedef {Object} JobUpdate
 * @property {string} type - The type of update ('job_update', 'node_progress', 'node_update', 'output_update', 'preview_update', 'log_update', 'notification', 'edge_update', 'planning_update', 'tool_call_update', 'tool_result_update', 'task_update', 'prediction', 'chunk')
 * @property {string} [status] - The job status ('completed', 'failed', 'running', 'queued', 'suspended', 'cancelled', 'timed_out', 'paused')
 * @property {any} [result] - The result data when job is completed
 * @property {string} [error] - Error message if job failed
 * @property {number} [progress] - Progress value for node_progress
 * @property {number} [total] - Total value for node_progress
 * @property {string} [node_id] - Node ID for node-specific updates
 * @property {string} [node_name] - Node name for display
 * @property {string} [node_type] - Node type identifier
 * @property {any} [value] - Value for output_update and preview_update
 * @property {string} [job_id] - Job ID for tracking
 * @property {string} [message] - Status message
 * @property {string} [output_name] - Output name for output_update
 * @property {string} [output_type] - Output type for output_update
 * @property {Object} [metadata] - Metadata for output_update
 * @property {Object} [properties] - Updated properties for node_update
 * @property {Object} [run_state] - Run state info for job_update
 * @property {number} [duration] - Duration for completed jobs
 * @property {string} [workflow_id] - Workflow ID
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
    this.onOutputUpdate = null;
    this.onPreviewUpdate = null;
    this.onNodeUpdate = null;
    this.onJobUpdate = null;
    this.onLogUpdate = null;
    this.onNotification = null;
    this.onEdgeUpdate = null;
    this.onPlanningUpdate = null;
    this.onToolCallUpdate = null;
    this.onToolResultUpdate = null;
    this.onTaskUpdate = null;
    this.onPrediction = null;
    this.onChunk = null;
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
      case "log_update":
        this.handleLogUpdate(data);
        break;
      case "notification":
        this.handleNotification(data);
        break;
      case "edge_update":
        this.handleEdgeUpdate(data);
        break;
      case "planning_update":
        this.handlePlanningUpdate(data);
        break;
      case "tool_call_update":
        this.handleToolCallUpdate(data);
        break;
      case "tool_result_update":
        this.handleToolResultUpdate(data);
        break;
      case "task_update":
        this.handleTaskUpdate(data);
        break;
      case "prediction":
        this.handlePrediction(data);
        break;
      case "chunk":
        this.handleChunk(data);
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
   * Handles output update messages (streaming output values from output nodes)
   * @private
   * @param {Object} data - The output update data
   */
  handleOutputUpdate(data) {
    console.log("Output update:", data);
    if (this.onOutputUpdate) {
      this.onOutputUpdate({
        node_id: data.node_id,
        node_name: data.node_name,
        output_name: data.output_name,
        value: data.value,
        output_type: data.output_type,
        metadata: data.metadata || {}
      });
    }
  }

  /**
   * Handles preview update messages (intermediate results during execution)
   * @private
   * @param {Object} data - The preview update data
   */
  handlePreviewUpdate(data) {
    console.log("Preview update:", data);
    if (this.onPreviewUpdate) {
      this.onPreviewUpdate({
        node_id: data.node_id,
        value: data.value
      });
    }
  }

  /**
   * Handles node progress updates
   * @private
   * @param {Object} data - The progress update data
   */
  handleNodeProgress(data) {
    if (this.onProgress) {
      this.onProgress({
        node_id: data.node_id,
        progress: data.progress,
        total: data.total
      });
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
        node_id: data.node_id,
        node_name: data.node_name,
        node_type: data.node_type,
        status: data.status,
        error: data.error,
        result: data.result,
        properties: data.properties
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
   * Handles log update messages
   * @private
   * @param {Object} data - The log update data
   */
  handleLogUpdate(data) {
    if (this.onLogUpdate) {
      this.onLogUpdate({
        node_id: data.node_id,
        node_name: data.node_name,
        content: data.content,
        severity: data.severity
      });
    }
  }

  /**
   * Handles notification messages
   * @private
   * @param {Object} data - The notification data
   */
  handleNotification(data) {
    if (this.onNotification) {
      this.onNotification({
        node_id: data.node_id,
        content: data.content,
        severity: data.severity
      });
    }
  }

  /**
   * Handles edge update messages
   * @private
   * @param {Object} data - The edge update data
   */
  handleEdgeUpdate(data) {
    if (this.onEdgeUpdate) {
      this.onEdgeUpdate({
        edge_id: data.edge_id,
        status: data.status,
        counter: data.counter
      });
    }
  }

  /**
   * Handles planning update messages
   * @private
   * @param {Object} data - The planning update data
   */
  handlePlanningUpdate(data) {
    if (this.onPlanningUpdate) {
      this.onPlanningUpdate(data);
    }
  }

  /**
   * Handles tool call update messages
   * @private
   * @param {Object} data - The tool call update data
   */
  handleToolCallUpdate(data) {
    if (this.onToolCallUpdate) {
      this.onToolCallUpdate(data);
    }
  }

  /**
   * Handles tool result update messages
   * @private
   * @param {Object} data - The tool result update data
   */
  handleToolResultUpdate(data) {
    if (this.onToolResultUpdate) {
      this.onToolResultUpdate(data);
    }
  }

  /**
   * Handles task update messages
   * @private
   * @param {Object} data - The task update data
   */
  handleTaskUpdate(data) {
    if (this.onTaskUpdate) {
      this.onTaskUpdate(data);
    }
  }

  /**
   * Handles prediction messages
   * @private
   * @param {Object} data - The prediction data
   */
  handlePrediction(data) {
    if (this.onPrediction) {
      this.onPrediction(data);
    }
  }

  /**
   * Handles chunk messages
   * @private
   * @param {Object} data - The chunk data
   */
  handleChunk(data) {
    if (this.onChunk) {
      this.onChunk(data);
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
