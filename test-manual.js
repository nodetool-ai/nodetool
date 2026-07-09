require('ts-node').register({
  compilerOptions: {
    module: "commonjs",
    esModuleInterop: true
  }
});
const collections = require("./packages/websocket/tests/trpc-collections.test.ts");
console.log(collections);
