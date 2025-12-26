/**
 * Mobile WebSocket Service
 * Adapted from web/src/lib/websocket/GlobalWebSocketManager.ts
 */
import { apiService } from './api';
import { encode, decode } from "@msgpack/msgpack";

type MessageHandler = (message: any) => void;

class WebSocketService {
  private static instance: WebSocketService | null = null;
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private isConnecting = false;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  private maxReconnectAttempts = 5;
  private currentPath: string | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Ensure WebSocket connection is established to a specific path
   */
  async ensureConnection(path: string): Promise<void> {
    if (this.isConnected && this.ws && this.currentPath === path) {
      return;
    }

    if (this.isConnected && this.ws && this.currentPath !== path) {
      console.log(`WebSocketService: Switching connection from ${this.currentPath} to ${path}`);
      this.disconnect();
    }

    if (this.isConnecting) {
      if (this.currentPath === path) {
         // Wait for ongoing connection to same path
         return new Promise((resolve) => {
           const checkInterval = setInterval(() => {
             if (this.isConnected && this.ws) {
               clearInterval(checkInterval);
               resolve();
             }
           }, 100);
         });
      } else {
         // Force reconnect if path changed during connection (simplistic handling)
         this.disconnect();
      }
    }

    this.isConnecting = true;
    this.connect(path);
    
    // Return a promise that resolves when connected
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.isConnected) {
          clearInterval(checkInterval);
          resolve();
        } else if (!this.isConnecting && !this.isConnected) {
          clearInterval(checkInterval);
          reject(new Error('Failed to connect'));
        }
      }, 100);
    });
  }

  private connect(path: string) {
    try {
      this.currentPath = path;
      const url = apiService.getWebSocketUrl(path);
      console.log('WebSocketService: Connecting to', url);

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer'; 

      this.ws.onopen = () => {
        console.log('WebSocketService: Connected');
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        // Handle both text and binary data
        let data: any;
        try {
          if (typeof event.data === 'string') {
             data = JSON.parse(event.data);
          } else if (event.data instanceof ArrayBuffer) {
             data = decode(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
             // In RN getting arrayBuffer from blob might be async or require FileReader
             // But if we set binaryType='arraybuffer', we should get ArrayBuffer directly ideally?
             // Creating a reader just in case RN returns Blob despite binaryType setting
             // actually RN WebSocket might return Blob by default if not specified or even if specified?
             // Let's assume arraybuffer works first. If not, we might need a Blob handling util.
             // For now logging warning if we get Blob but expected ArrayBuffer
             console.warn('WebSocketService: Received Blob, expected ArrayBuffer. Check implementation.');
             return; 
          } else {
             console.warn('WebSocketService: Unknown message type', typeof event.data);
             return;
          }
          
          if (data) {
             this.routeMessage(data);
          }
        } catch (e) {
          console.error('WebSocketService: Failed to parse message', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocketService: Error', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocketService: Disconnected');
        this.isConnected = false;
        this.isConnecting = false;
        this.ws = null;
        this.handleReconnect();
      };

    } catch (error) {
      console.error('WebSocketService: Failed to create connection', error);
      this.isConnecting = false;
      this.handleReconnect();
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = 1000 * this.reconnectAttempts;
      console.log(`WebSocketService: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      
      this.reconnectTimer = setTimeout(() => {
        if (this.currentPath) {
          this.isConnecting = true;
          this.connect(this.currentPath);
        }
      }, delay);
    }
  }

  /**
   * Route incoming message to registered handlers
   */
  private routeMessage(message: any): void {
    // Route by workflow_id or job_id
    const routingKey = message.workflow_id || message.job_id;

    if (!routingKey) {
      console.warn('WebSocketService: Message without workflow_id or job_id', message);
      return;
    }

    const handlers = this.messageHandlers.get(routingKey);
    if (handlers && handlers.size > 0) {
      handlers.forEach((handler) => {
        try {
          handler(message);
        } catch (error) {
          console.error('WebSocketService: Handler error:', error);
        }
      });
    }
  }

  /**
   * Register a message handler for a workflow or job
   */
  subscribe(key: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(key)) {
      this.messageHandlers.set(key, new Set());
    }
    this.messageHandlers.get(key)!.add(handler);

    console.log(`WebSocketService: Subscribed handler for ${key}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.messageHandlers.get(key);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.messageHandlers.delete(key);
        }
      }
    };
  }

  /**
   * Send a message through the WebSocket
   */
  async send(message: any, path: string = '/ws/predict'): Promise<void> {
    await this.ensureConnection(path);

    if (!this.ws) {
      throw new Error('WebSocket not connected');
    }

    // console.log('WebSocketService: Sending message', message);
    // Encode with msgpack
    const encoded = encode(message);
    this.ws.send(encoded);
  }

  /**
   * Disconnect the WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    if (this.ws) {
      console.log('WebSocketService: Disconnecting');
      this.ws.close(); // close() will trigger onclose which cleans up
      this.ws = null;
      this.currentPath = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }
}

export const webSocketService = WebSocketService.getInstance();
