// Mock API Client for Jest
export const BASE_URL = "http://localhost:8000";

// Provide a minimal client stub with jest.fn methods used in the codebase
export const client = {
  GET: jest.fn(),
  POST: jest.fn(),
  PUT: jest.fn(),
  DELETE: jest.fn()
};

// Additional constants expected by imports
export const CHAT_URL = "ws://test/chat";
export const isLocalhost = true;

// Default export to maintain compatibility with any default imports
export default { client, CHAT_URL, isLocalhost };
