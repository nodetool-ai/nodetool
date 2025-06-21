// Simple test script to verify reconnection logic
// This can be run in the browser console to test WebSocket reconnection

import { WebSocketManager } from './WebSocketManager';

export async function testReconnection() {
  console.log('Testing WebSocket reconnection...');
  
  // Create a WebSocket manager with short timeouts for testing
  const wsManager = new WebSocketManager({
    url: 'wss://echo.websocket.org', // Public echo server for testing
    reconnect: true,
    reconnectInterval: 2000, // 2 seconds
    reconnectDecay: 1.5,
    reconnectAttempts: 3,
    timeoutInterval: 5000 // 5 seconds
  });

  // Set up event listeners
  wsManager.on('stateChange', (state) => {
    console.log(`State changed to: ${state}`);
  });

  wsManager.on('open', () => {
    console.log('WebSocket opened');
  });

  wsManager.on('close', (code, reason) => {
    console.log(`WebSocket closed: code=${code}, reason=${reason}`);
  });

  wsManager.on('reconnecting', (attempt, maxAttempts) => {
    console.log(`Reconnecting... attempt ${attempt}/${maxAttempts}`);
  });

  wsManager.on('error', (error) => {
    console.log('WebSocket error:', error.message);
  });

  wsManager.on('message', (data) => {
    console.log('Message received:', data);
  });

  try {
    // Connect initially
    console.log('Connecting...');
    await wsManager.connect();
    console.log('Connected successfully');

    // Send a test message
    wsManager.send({ type: 'test', content: 'Hello WebSocket!' });

    // Simulate a network disconnection after 5 seconds
    setTimeout(() => {
      console.log('Simulating disconnect...');
      // Force close the underlying WebSocket (simulating network issue)
      if ((wsManager as any).ws) {
        (wsManager as any).ws.close(1006, 'Simulated network error');
      }
    }, 5000);

    // Clean up after 30 seconds
    setTimeout(() => {
      console.log('Cleaning up...');
      wsManager.destroy();
    }, 30000);

  } catch (error) {
    console.error('Connection failed:', error);
  }
}

// Export for manual testing
(window as any).testReconnection = testReconnection;