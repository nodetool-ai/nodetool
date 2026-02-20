/**
 * NodeTool Chat — REST + WebSocket Client
 *
 * Handles:
 *  - REST calls to /api/threads/, /api/messages/, /api/models/
 *  - Unified WebSocket connection (MessagePack-encoded) at /ws
 *  - Sending chat_message commands
 *  - Dispatching inbound messages to registered handlers
 */

(function (root) {
  "use strict";

  var DEFAULT_API_URL = "http://localhost:7777";
  var DEFAULT_WS_URL = "ws://localhost:7777/ws";
  var RECONNECT_DELAY_MS = 3000;
  var MAX_RECONNECT = 10;

  /**
   * @typedef {Object} ChatClient
   */
  function ChatClient(options) {
    options = options || {};
    this.apiUrl = options.apiUrl || DEFAULT_API_URL;
    this.wsUrl = options.wsUrl || DEFAULT_WS_URL;
    this.authToken = options.authToken || null;

    this._socket = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._intentionalClose = false;

    // Event handlers — callers assign these
    this.onConnectionChange = null; // function(state, message)
    this.onMessage = null;          // function(data)
  }

  /* ─── Helpers ──────────────────────────────────────────── */

  ChatClient.prototype._authHeaders = function () {
    var headers = { "Content-Type": "application/json" };
    if (this.authToken) {
      headers["Authorization"] = "Bearer " + this.authToken;
    }
    return headers;
  };

  ChatClient.prototype._fetch = function (path, options) {
    options = options || {};
    options.headers = Object.assign({}, this._authHeaders(), options.headers || {});
    var url = this.apiUrl + path;
    return fetch(url, options).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          var err = new Error("HTTP " + res.status + ": " + body);
          err.status = res.status;
          throw err;
        });
      }
      var ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") !== -1) {
        return res.json();
      }
      return res.text();
    });
  };

  /* ─── WebSocket ─────────────────────────────────────────── */

  ChatClient.prototype.connect = function () {
    var self = this;
    if (self._socket && (self._socket.readyState === WebSocket.OPEN || self._socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    self._intentionalClose = false;
    self._setConnectionState("connecting", "Connecting…");

    var wsUrl = self.wsUrl;
    if (self.authToken) {
      wsUrl += (wsUrl.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(self.authToken);
    }

    var ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    self._socket = ws;

    ws.onopen = function () {
      self._reconnectAttempts = 0;
      self._setConnectionState("connected", "Connected");
    };

    ws.onclose = function () {
      self._socket = null;
      if (self._intentionalClose) {
        self._setConnectionState("disconnected", "Disconnected");
        return;
      }
      self._setConnectionState("reconnecting", "Reconnecting…");
      self._scheduleReconnect();
    };

    ws.onerror = function () {
      self._setConnectionState("error", "Connection error");
    };

    ws.onmessage = function (event) {
      self._handleRawMessage(event.data);
    };
  };

  ChatClient.prototype.disconnect = function () {
    this._intentionalClose = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._socket) {
      this._socket.close();
    }
  };

  ChatClient.prototype._setConnectionState = function (state, message) {
    if (typeof this.onConnectionChange === "function") {
      this.onConnectionChange(state, message);
    }
  };

  ChatClient.prototype._scheduleReconnect = function () {
    var self = this;
    if (self._reconnectAttempts >= MAX_RECONNECT) {
      self._setConnectionState("error", "Could not connect to NodeTool backend.");
      return;
    }
    self._reconnectAttempts++;
    var delay = Math.min(RECONNECT_DELAY_MS * self._reconnectAttempts, 15000);
    self._reconnectTimer = setTimeout(function () {
      self.connect();
    }, delay);
  };

  ChatClient.prototype._handleRawMessage = function (rawData) {
    var data;
    if (rawData instanceof ArrayBuffer) {
      // MessagePack binary frame
      try {
        data = root.msgpack ? root.msgpack.decode(new Uint8Array(rawData)) : null;
      } catch (e) {
        console.error("[ChatClient] Failed to decode msgpack:", e);
        return;
      }
    } else if (typeof rawData === "string") {
      try {
        data = JSON.parse(rawData);
      } catch (e) {
        console.error("[ChatClient] Failed to parse JSON message:", e);
        return;
      }
    }
    if (!data) { return; }
    if (typeof this.onMessage === "function") {
      this.onMessage(data);
    }
  };

  /**
   * Send a chat message over the WebSocket.
   * @param {string} threadId
   * @param {string} text
   * @param {Object} [opts]  Optional fields: model, tools, collections, agent_mode
   */
  ChatClient.prototype.sendChatMessage = function (threadId, text, opts) {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    opts = opts || {};
    var payload = {
      command: "chat_message",
      data: {
        type: "message",
        role: "user",
        content: [{ type: "text", text: text }],
        thread_id: threadId,
        model: opts.model || null,
        provider: opts.provider || null,
        agent_mode: opts.agentMode || false,
        tools: opts.tools || null,
        collections: opts.collections || null
      }
    };

    var self = this;
    // Try MessagePack first; fall back to JSON text frame
    if (root.msgpack) {
      try {
        var encoded = root.msgpack.encode(payload);
        // msgpack5 returns a Buffer-like; convert to ArrayBuffer
        var buf;
        if (encoded instanceof Uint8Array) {
          buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
        } else if (encoded && typeof encoded.toBuffer === "function") {
          var node = encoded.toBuffer();
          buf = node.buffer.slice(node.byteOffset, node.byteOffset + node.byteLength);
        } else {
          buf = encoded;
        }
        self._socket.send(buf);
        return;
      } catch (e) {
        console.warn("[ChatClient] msgpack encode failed, falling back to JSON:", e);
      }
    }
    self._socket.send(JSON.stringify(payload));
  };

  /**
   * Send a stop_generation command for a thread.
   * @param {string} threadId
   */
  ChatClient.prototype.stopGeneration = function (threadId) {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) { return; }
    var payload = { command: "stop_generation", data: { thread_id: threadId } };
    if (root.msgpack) {
      try {
        var encoded = root.msgpack.encode(payload);
        var buf;
        if (encoded instanceof Uint8Array) {
          buf = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
        } else if (encoded && typeof encoded.toBuffer === "function") {
          var node = encoded.toBuffer();
          buf = node.buffer.slice(node.byteOffset, node.byteOffset + node.byteLength);
        } else {
          buf = encoded;
        }
        this._socket.send(buf);
        return;
      } catch (e) { /* fall through */ }
    }
    this._socket.send(JSON.stringify(payload));
  };

  /* ─── REST helpers ──────────────────────────────────────── */

  /** List all chat threads. */
  ChatClient.prototype.listThreads = function () {
    return this._fetch("/api/threads/");
  };

  /** Fetch messages for a thread. */
  ChatClient.prototype.fetchMessages = function (threadId, limit) {
    var q = "?thread_id=" + encodeURIComponent(threadId) + "&limit=" + (limit || 100);
    return this._fetch("/api/messages/" + q);
  };

  /** Create a new thread. */
  ChatClient.prototype.createThread = function (title) {
    return this._fetch("/api/threads/", {
      method: "POST",
      body: JSON.stringify({ title: title || "New Chat" })
    });
  };

  /** Delete a thread. */
  ChatClient.prototype.deleteThread = function (threadId) {
    return this._fetch("/api/threads/" + encodeURIComponent(threadId), {
      method: "DELETE"
    });
  };

  /** List available models. */
  ChatClient.prototype.listModels = function () {
    return this._fetch("/api/models/").catch(function () { return []; });
  };

  // Expose
  root.ChatClient = ChatClient;
})(typeof window !== "undefined" ? window : this);
