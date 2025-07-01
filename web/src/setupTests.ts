// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";

// Mock import.meta for Vite environment variables
Object.defineProperty(globalThis, "import", {
  value: {
    meta: {
      env: {
        VITE_API_URL: "http://localhost:8000"
      }
    }
  }
});
