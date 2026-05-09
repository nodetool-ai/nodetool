/**
 * NodeTool Chat — tRPC + WebSocket Client
 *
 * Targets the TypeScript NodeTool server (packages/websocket).
 *
 * Transport summary
 *   ┌──────────────────────────┬──────────────────────────────────────┐
 *   │ Resource                 │ Endpoint                             │
 *   ├──────────────────────────┼──────────────────────────────────────┤
 *   │ Threads (CRUD)           │ tRPC at /trpc/threads.{list,…}       │
 *   │ Messages (read)          │ tRPC at /trpc/messages.list          │
 *   │ Providers + LLM models   │ tRPC at /trpc/models.{providers,    │
 *   │                          │   llmByProvider}                     │
 *   │ Chat round-trip          │ WebSocket /ws (msgpack-encoded)      │
 *   └──────────────────────────┴──────────────────────────────────────┘
 *
 * The tRPC server is configured with the `superjson` transformer so every
 * payload is wrapped as `{"json": <value>}` on both the request and response.
 * `_trpc()` below hides that detail; callers see plain JS values.
 */

(function (root) {
  "use strict";

  var DEFAULT_API_URL = "http://localhost:7777";
  var DEFAULT_WS_URL = "ws://localhost:7777/ws";
  var RECONNECT_DELAY_MS = 3000;
  var MAX_RECONNECT = 10;

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
    var headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (this.authToken) {
      headers["Authorization"] = "Bearer " + this.authToken;
    }
    return headers;
  };

  ChatClient.prototype._fetch = function (path, options) {
    options = options || {};
    options.headers = Object.assign({}, this._authHeaders(), options.headers || {});
    options.credentials = options.credentials || "include";
    options.mode = options.mode || "cors";
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

  /**
   * Call a tRPC procedure.
   *   _trpc("threads.list", "query")            — GET, no input
   *   _trpc("threads.create", "mutation", body) — POST with body
   *
   * Wraps/unwraps the superjson `{"json": …}` envelope so callers can pass
   * and receive plain values. Throws on tRPC error.
   */
  ChatClient.prototype._trpc = function (procedure, kind, input) {
    var path = "/trpc/" + procedure;
    var fetchOpts;
    if (kind === "mutation") {
      fetchOpts = {
        method: "POST",
        body: JSON.stringify({ json: input === undefined ? null : input })
      };
    } else {
      // Query — encode input in the `input` query param.
      var query = "";
      if (input !== undefined) {
        query =
          "?input=" +
          encodeURIComponent(JSON.stringify({ json: input }));
      }
      path += query;
      fetchOpts = { method: "GET" };
    }
    return this._fetch(path, fetchOpts).then(function (body) {
      if (body && body.error) {
        var err = new Error(
          (body.error && body.error.message) || "tRPC error"
        );
        err.trpc = body.error;
        throw err;
      }
      // Standard non-batched shape: { result: { data: { json: <value> } } }
      var result = body && body.result;
      var data = result && result.data;
      if (data && Object.prototype.hasOwnProperty.call(data, "json")) {
        return data.json;
      }
      return data === undefined ? null : data;
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
      // MessagePack binary frame (server default for binary mode)
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

  /** Encode a payload using msgpack5 (preferred) and return an ArrayBuffer. */
  function encodeMsgpack(payload) {
    if (!root.msgpack) return null;
    var encoded = root.msgpack.encode(payload);
    if (encoded instanceof Uint8Array) {
      return encoded.buffer.slice(
        encoded.byteOffset,
        encoded.byteOffset + encoded.byteLength
      );
    }
    if (encoded && typeof encoded.toBuffer === "function") {
      var node = encoded.toBuffer();
      return node.buffer.slice(
        node.byteOffset,
        node.byteOffset + node.byteLength
      );
    }
    return encoded;
  }

  ChatClient.prototype._sendCommand = function (payload) {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    var buf = null;
    try {
      buf = encodeMsgpack(payload);
    } catch (e) {
      console.warn("[ChatClient] msgpack encode failed, falling back to JSON:", e);
    }
    if (buf) {
      this._socket.send(buf);
    } else {
      this._socket.send(JSON.stringify(payload));
    }
  };

  /**
   * Send a chat message over the WebSocket.
   * @param {string} threadId
   * @param {string} text
   * @param {Object} [opts]  Optional fields: model, provider, tools,
   *                         collections, agentMode
   */
  ChatClient.prototype.sendChatMessage = function (threadId, text, opts) {
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
    this._sendCommand(payload);
  };

  /**
   * Stop the current chat or inference for the given thread.
   * The TS server uses the unified `stop` command (the legacy Python server
   * accepted `stop_generation`).
   */
  ChatClient.prototype.stopGeneration = function (threadId) {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) { return; }
    this._sendCommand({ command: "stop", data: { thread_id: threadId } });
  };

  /* ─── Threads (tRPC) ────────────────────────────────────── */

  ChatClient.prototype.listThreads = function (limit) {
    return this._trpc("threads.list", "query", { limit: limit || 100 });
  };

  ChatClient.prototype.createThread = function (title) {
    return this._trpc("threads.create", "mutation", {
      title: title || "New Chat"
    });
  };

  ChatClient.prototype.deleteThread = function (threadId) {
    return this._trpc("threads.delete", "mutation", { id: threadId });
  };

  /* ─── Messages (tRPC) ───────────────────────────────────── */

  ChatClient.prototype.fetchMessages = function (threadId, limit) {
    return this._trpc("messages.list", "query", {
      thread_id: threadId,
      limit: limit || 100
    });
  };

  /* ─── Models (tRPC) ─────────────────────────────────────── */

  /**
   * List LLM models from every provider that advertises the
   * `generate_message` capability and is configured (env var or stored secret).
   *   1. /trpc/models.providers       — list providers + capabilities
   *   2. Filter to providers whose `capabilities` include "generate_message"
   *   3. /trpc/models.llmByProvider   — once per surviving provider, in parallel
   */
  ChatClient.prototype.listModels = function () {
    var self = this;
    return this._trpc("models.providers", "query")
      .then(function (providers) {
        var list = Array.isArray(providers) ? providers : [];
        var llmProviders = list.filter(function (p) {
          var caps = p.capabilities || [];
          return caps.indexOf("generate_message") !== -1;
        });
        if (llmProviders.length === 0) return [];

        var fetches = llmProviders.map(function (p) {
          var key = p.provider;
          if (!key) return Promise.resolve([]);
          return self
            ._trpc("models.llmByProvider", "query", { provider: key })
            .then(function (models) {
              var arr = Array.isArray(models) ? models : [];
              return arr.map(function (m) {
                return {
                  id: m.id || m.name,
                  name: m.name || m.id,
                  provider: key
                };
              });
            })
            .catch(function (err) {
              console.warn(
                "[ChatClient] Failed to load models for " + key + ":",
                err.message || err
              );
              return [];
            });
        });
        return Promise.all(fetches).then(function (results) {
          return results.flat();
        });
      })
      .catch(function (err) {
        console.warn("[ChatClient] Failed to load providers:", err.message || err);
        return [];
      });
  };

  // Expose
  root.ChatClient = ChatClient;
})(typeof window !== "undefined" ? window : this);
