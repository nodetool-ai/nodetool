import base from "../../../web/jest.config";

export default {
  ...base,
  rootDir: "../../../web",
  roots: ["<rootDir>/src", "<rootDir>/../native/chat/tests"],
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }] },
  testRegex: "native/chat/tests/.*\\.test\\.ts$"
};
