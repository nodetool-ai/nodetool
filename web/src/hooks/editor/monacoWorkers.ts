/**
 * Web workers for Monaco's language services.
 *
 * Without `MonacoEnvironment.getWorker` Monaco cannot start its workers, warns
 * on every editor mount, and runs tokenizing and validation on the main thread.
 * Vite's `?worker` suffix bundles each worker as its own chunk, fetched only
 * when an editor for that language first needs it.
 */
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker.js?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker.js?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

const createWorker = (label: string): Worker => {
  switch (label) {
    case "json":
      return new JsonWorker();
    case "css":
    case "scss":
    case "less":
      return new CssWorker();
    case "html":
    case "handlebars":
    case "razor":
      return new HtmlWorker();
    case "typescript":
    case "javascript":
      return new TsWorker();
    default:
      return new EditorWorker();
  }
};

export function installMonacoWorkers(): void {
  self.MonacoEnvironment = {
    getWorker: (_workerId: string, label: string) => createWorker(label)
  };
}
