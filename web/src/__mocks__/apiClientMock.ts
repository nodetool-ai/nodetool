// Mock API Client for Jest
export const BASE_URL = "http://localhost:8000";

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
