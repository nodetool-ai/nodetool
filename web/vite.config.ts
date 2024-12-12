import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import viteTsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";

async function createViteConfig() {
  const browserslistToEsbuild = (await import("browserslist-to-esbuild"))
    .default;

  return defineConfig({
    server: {
      port: 3000
    },
    plugins: [
      react({
        jsxImportSource: "@emotion/react",
        babel: {
          plugins: ["@emotion/babel-plugin"]
        }
      }),
      viteTsconfigPaths(),
      svgr()
    ],
    build: {
      target: browserslistToEsbuild([">0.2%", "not dead", "not op_mini all"]),
      minify: false,
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  });
}

export default createViteConfig();

// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";
// import viteTsconfigPaths from "vite-tsconfig-paths";
// import svgr from "vite-plugin-svgr";
// import browserslistToEsbuild from "browserslist-to-esbuild";

// export default defineConfig({
//   // ...
//   plugins: [
//     // here is the main update
//     react({
//       jsxImportSource: "@emotion/react",
//       babel: {
//         plugins: ["@emotion/babel-plugin"]
//       }
//     })
//   ],
//   build: {
//     // you can also pass your usual browserslist config here
//     target: browserslistToEsbuild([">0.2%", "not dead", "not op_mini all"])
//   }
// });
