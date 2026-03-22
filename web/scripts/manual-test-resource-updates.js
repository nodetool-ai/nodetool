#!/usr/bin/env node
/**
 * Manual Test Script for Resource Change Updates
 * 
 * This script simulates resource change messages to verify the
 * WebSocket resource update implementation.
 * 
 * Usage:
 *   node manual-test-resource-updates.js
 */

const { encode } = require("@msgpack/msgpack");

// Sample resource change messages for different scenarios
const testMessages = [
  {
    name: "Workflow Created",
    message: {
      type: "resource_change",
      event: "created",
      resource_type: "workflow",
      resource: {
        id: "workflow-test-001",
        etag: "etag-001",
        name: "Test Workflow",
        status: "draft"
      }
    }
  },
  {
    name: "Workflow Updated",
    message: {
      type: "resource_change",
      event: "updated",
      resource_type: "workflow",
      resource: {
        id: "workflow-test-001",
        etag: "etag-002",
        name: "Test Workflow (Updated)",
        status: "active"
      }
    }
  },
  {
    name: "Job Created",
    message: {
      type: "resource_change",
      event: "created",
      resource_type: "job",
      resource: {
        id: "job-test-001",
        etag: "etag-job-001",
        status: "running",
        workflow_id: "workflow-test-001"
      }
    }
  },
  {
    name: "Asset Uploaded",
    message: {
      type: "resource_change",
      event: "created",
      resource_type: "asset",
      resource: {
        id: "asset-test-001",
        etag: "etag-asset-001",
        name: "test-image.png",
        content_type: "image/png"
      }
    }
  },
  {
    name: "Thread Created",
    message: {
      type: "resource_change",
      event: "created",
      resource_type: "thread",
      resource: {
        id: "thread-test-001",
        etag: "etag-thread-001",
        name: "Test Chat Thread"
      }
    }
  },
  {
    name: "Asset Deleted",
    message: {
      type: "resource_change",
      event: "deleted",
      resource_type: "asset",
      resource: {
        id: "asset-test-001"
      }
    }
  },
  {
    name: "Workflow Deleted",
    message: {
      type: "resource_change",
      event: "deleted",
      resource_type: "workflow",
      resource: {
        id: "workflow-test-001"
      }
    }
  }
];

console.log("=".repeat(80));
console.log("Resource Change Updates - Manual Test Messages");
console.log("=".repeat(80));
console.log();
console.log("Instructions:");
console.log("1. Open the browser console (F12)");
console.log("2. Navigate to the Network tab and filter for 'ws' (WebSocket)");
console.log("3. Open the WebSocket connection");
console.log("4. Use these messages to manually test the resource update handler");
console.log();
console.log("In the browser console, run:");
console.log("  const { globalWebSocketManager } = await import('./src/lib/websocket/GlobalWebSocketManager')");
console.log("  globalWebSocketManager.routeMessage(message)");
console.log();
console.log("-".repeat(80));

testMessages.forEach((test, index) => {
  console.log();
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log("-".repeat(80));
  console.log("Message:");
  console.log(JSON.stringify(test.message, null, 2));
  console.log();
  console.log("Expected behavior:");
  
  const resourceType = test.message.resource_type;
  const event = test.message.event;
  
  switch (resourceType) {
    case "workflow":
      console.log("- Invalidates 'workflows' query");
      console.log("- Invalidates 'templates' query");
      if (test.message.resource.id) {
        console.log(`- Invalidates 'workflow-${test.message.resource.id}' query`);
        console.log(`- Invalidates 'workflow_versions-${test.message.resource.id}' query`);
      }
      break;
    case "job":
      console.log("- Invalidates 'jobs' query");
      if (test.message.resource.id) {
        console.log(`- Invalidates 'job-${test.message.resource.id}' query`);
      }
      break;
    case "asset":
      console.log("- Invalidates 'assets' query");
      break;
    case "thread":
      console.log("- Invalidates 'threads' query");
      if (test.message.resource.id) {
        console.log(`- Invalidates 'thread-${test.message.resource.id}' query`);
        console.log(`- Invalidates 'messages-${test.message.resource.id}' query`);
      }
      break;
  }
  
  console.log("- Console log: 'Resource change: " + event + " " + resourceType + "'");
  console.log();
  
  // Output msgpack-encoded version
  const encoded = encode(test.message);
  console.log("MsgPack (hex):", Buffer.from(encoded).toString("hex"));
  console.log();
});

console.log("=".repeat(80));
console.log("Automated Tests");
console.log("=".repeat(80));
console.log();
console.log("Run automated tests:");
console.log("  cd web");
console.log("  npm test -- resourceChangeHandler.test.ts");
console.log("  npm test -- GlobalWebSocketManager.test.ts");
console.log();
console.log("All tests should pass (10 total tests for resource changes)");
console.log();

console.log("=".repeat(80));
console.log("Integration Test with Backend");
console.log("=".repeat(80));
console.log();
console.log("Prerequisites:");
console.log("1. Backend must be running: nodetool serve --port 7777");
console.log("2. Frontend must be running: npm start (in web directory)");
console.log();
console.log("Test scenarios:");
console.log("1. Create a new workflow");
console.log("   - Check Network tab for resource_change message");
console.log("   - Verify workflow list updates without refresh");
console.log();
console.log("2. Update a workflow");
console.log("   - Modify workflow properties");
console.log("   - Check for resource_change with event='updated'");
console.log("   - Verify changes appear immediately");
console.log();
console.log("3. Delete a workflow");
console.log("   - Delete a workflow");
console.log("   - Check for resource_change with event='deleted'");
console.log("   - Verify workflow disappears from list");
console.log();
console.log("4. Create/delete assets");
console.log("   - Upload an asset");
console.log("   - Check for resource_change message");
console.log("   - Verify asset appears in list");
console.log();
console.log("5. Multi-client test");
console.log("   - Open app in two browser windows");
console.log("   - Create/update/delete resources in one window");
console.log("   - Verify other window updates automatically");
console.log();
