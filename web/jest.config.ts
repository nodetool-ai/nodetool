export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
    pretendToBeVisual: true,
    resources: "usable"
  },
  testTimeout: 10000,
  maxWorkers: "50%",
  moduleNameMapper: {
    "^@nodetool/protocol$": "<rootDir>/../packages/protocol/src/index.ts",
    "^@nodetool/protocol/(.*)$": "<rootDir>/../packages/protocol/src/$1",
    // Strip .js extensions from TypeScript ESM imports (packages use .js in source imports per ESM convention)
    "^(\\.{1,2}/.+)\\.js$": "$1",
    canvas: "<rootDir>/src/__mocks__/canvas.ts",
    "^canvas$": "<rootDir>/src/__mocks__/canvas.ts",
    "^canvas/.*$": "<rootDir>/src/__mocks__/canvas.ts",
    "^chroma-js$": "<rootDir>/src/__mocks__/chroma-js.ts",
    "^fuse\\.js$": "<rootDir>/src/__mocks__/fuse.js.ts",
    "\\.(css|less|scss|sass)$": "<rootDir>/src/__mocks__/styleMock.ts",
    "\\.(jpg|jpeg|png|gif|webp|svg)$": "<rootDir>/src/__mocks__/fileMock.ts",
    "\\.svg\\?react$": "<rootDir>/src/__mocks__/svgReactMock.ts",
    "^.*components/themes/ThemeNodetool$":
      "<rootDir>/src/__mocks__/themeMock.ts",
    BASE_URL$: "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "BASE_URL\\.js$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*stores/BASE_URL$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*stores/BASE_URL.js$": "<rootDir>/src/__mocks__/baseUrlMock.ts",
    "^.*/trpc/client$": "<rootDir>/src/__mocks__/trpcClientMock.ts",
    "^.*/trpc/client.js$": "<rootDir>/src/__mocks__/trpcClientMock.ts",
    "^\\./supabaseClient$": "<rootDir>/src/__mocks__/supabaseClientMock.ts",
    "^\\./env$": "<rootDir>/src/__mocks__/envMock.ts",
    "^\\.\\./env$": "<rootDir>/src/__mocks__/envMock.ts",
    "^.*lib/env$": "<rootDir>/src/__mocks__/envMock.ts",
    "^.*lib/supabaseClient$": "<rootDir>/src/__mocks__/supabaseClientMock.ts",
    "^@google/model-viewer$": "<rootDir>/src/__mocks__/modelViewerMock.ts",
    "^react-markdown$": "<rootDir>/src/__mocks__/reactMarkdownMock.tsx",
    "^remark-gfm$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^rehype-raw$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^react-syntax-highlighter$": "<rootDir>/src/__mocks__/reactSyntaxHighlighterMock.tsx",
    "^react-syntax-highlighter/dist/esm/styles/prism$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^react-syntax-highlighter/dist/esm/styles/hljs$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^react-syntax-highlighter/dist/esm/prism$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^react-syntax-highlighter/dist/esm/hljs$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^@xyflow/react$": "<rootDir>/src/__mocks__/xyflowReact.tsx",
    "^.*contexts/WorkflowManagerContext$": "<rootDir>/src/__mocks__/WorkflowManagerContext.tsx",
    "^react-pdf$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^react-pdf/.*$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^.*components/asset_viewer/PDFViewer$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^wavesurfer\\.js$": "<rootDir>/src/__mocks__/wavesurfer.ts",
    "^monaco-editor$": "<rootDir>/src/__mocks__/emptyModule.ts",
    "^@monaco-editor/react$": "<rootDir>/src/__mocks__/emptyModule.ts"
  },
  setupFiles: ["<rootDir>/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json"
      }
    ]
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-markdown|remark-gfm|rehype-raw|react-syntax-highlighter|@nodetool)/)"
  ],
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|tsx?)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.{js,jsx,ts,tsx}",
    "!src/**/*.d.ts",
    "!src/index.tsx"
  ],
  coveragePathIgnorePatterns: ["/node_modules/", "/coverage/", "/dist/"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "tests/e2e/", "tests/benchmarks/"]
};
