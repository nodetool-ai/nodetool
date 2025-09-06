export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "\\.(css|less|scss|sass)$": "<rootDir>/src/__mocks__/styleMock.ts",
    "\\.(jpg|jpeg|png|gif|webp|svg)$": "<rootDir>/src/__mocks__/fileMock.ts",
    "\\.svg\\?react$": "<rootDir>/src/__mocks__/svgReactMock.ts",
    "^.*components/themes/ThemeNodetool$":
      "<rootDir>/src/__mocks__/themeMock.ts",
    // Map any ApiClient import (relative or absolute within src) to mock
    ApiClient$: "<rootDir>/src/__mocks__/apiClientMock.ts",
    "ApiClient\\.js$": "<rootDir>/src/__mocks__/apiClientMock.ts",
    "^.*stores/ApiClient$": "<rootDir>/src/__mocks__/apiClientMock.ts",
    // Map any BASE_URL import (relative or absolute within src) to mock
    BASE_URL$: "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "BASE_URL\\.js$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*stores/BASE_URL$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*stores/BASE_URL.js$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*lib/supabaseClient$": "<rootDir>/src/__mocks__/supabaseClientMock.ts"
  },
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: true
      }
    ]
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/index.tsx"
  ],
  coveragePathIgnorePatterns: ["/node_modules/", "/coverage/", "/dist/"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"]
};
