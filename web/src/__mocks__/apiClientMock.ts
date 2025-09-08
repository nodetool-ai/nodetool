// Mock API Client for Jest
export const BASE_URL = "http://localhost:8000";
export const CHAT_URL = "ws://localhost:1234";

// OpenAPI client shape used throughout stores
export const client = {
  GET: jest.fn(async () => ({ data: {}, error: null })),
  POST: jest.fn(async () => ({ data: {}, error: null })),
  PUT: jest.fn(async () => ({ data: {}, error: null })),
  DELETE: jest.fn(async () => ({ data: {}, error: null }))
};

export const authHeader = jest.fn(async () => ({
  Authorization: "Bearer test"
}));
export const isLocalhost = true;

export default class ApiClient {
  static async get() {
    return { data: [] };
  }

  static async post() {
    return { data: {} };
  }

  static async put() {
    return { data: {} };
  }

  static async delete() {
    return { data: {} };
  }
}
