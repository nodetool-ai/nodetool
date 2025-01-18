import { encode, decode } from "@msgpack/msgpack";

const WORKER_URL = "ws://127.0.0.1:8000/predict";

/**
 * Class to handle workflow execution and WebSocket communication
 */
class WorkflowRunner {
  /**
   * Creates a new WorkflowRunner instance
   * @param {Object} config - Configuration object
   * @param {string} config.token - Authentication token
   */
  constructor(config) {
    this.token = config.token;
    this.socket = null;

    this.onProgressCallback = null;
    this.onErrorCallback = null;
    this.onNodeUpdateCallback = null;
    this.onJobUpdateCallback = null;
  }

  /**
   * Sets the progress callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Sets the error callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Sets the node update callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onNodeUpdate(callback) {
    this.onNodeUpdateCallback = callback;
  }

  /**
   * Sets the job update callback
   * @param {Function} callback - The callback function
   * @returns {void}
   */
  onJobUpdate(callback) {
    this.onJobUpdateCallback = callback;
  }

  /**
   * Establishes WebSocket connection
   * @returns {Promise<void>}
   */
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(WORKER_URL);
      this.socket.onopen = () => {
        console.log("WebSocket connected");
        resolve();
      };
      this.socket.onerror = reject;
    });
  }

  /**
   * Runs the specified workflow
   * @param {string} workflowId - ID of the workflow to run
   * @param {Object} params - Parameters for the workflow
   * @returns {Promise<Object>} The workflow results
   */
  async run(workflowId, params) {
    const loaderContainer = document.querySelector(".loader-container");
    if (loaderContainer instanceof HTMLElement) {
      loaderContainer.style.display = "flex";
    }

    await this.connect();

    const request = {
      type: "run_job_request",
      workflow_id: workflowId,
      job_type: "workflow",
      auth_token: this.token,
      params: params,
    };

    this.socket.send(
      encode({
        command: "run_job",
        data: request,
      })
    );

    return new Promise((resolve, reject) => {
      this.socket.onmessage = async (event) => {
        const arrayBuffer = await event.data.arrayBuffer();
        /** @type any */
        const data = decode(new Uint8Array(arrayBuffer));

        if (data.type === "job_update") {
          if (this.onJobUpdateCallback) {
            this.onJobUpdateCallback(data);
          }
          if (data.status === "completed") {
            resolve(data.result);
          } else if (data.status === "failed") {
            reject(new Error(data.error));
          }
        } else if (data.type === "node_progress") {
          if (this.onProgressCallback) {
            this.onProgressCallback(data.progress, data.total);
          }
        } else if (data.type === "node_update") {
          if (this.onNodeUpdateCallback) {
            this.onNodeUpdateCallback(data);
          }
        }
      };
    });
  }
}

export { WorkflowRunner };
