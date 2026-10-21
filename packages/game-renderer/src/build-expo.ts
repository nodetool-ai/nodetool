import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { StandaloneAsset } from "./build.js";
import { gameBuildFingerprint } from "./build-fingerprint.js";
import { renderIcons } from "./build-tauri.js";

/**
 * Package versions the generated project pins. They are the versions Expo SDK 56 lists in its
 * `bundledNativeModules.json`, which Expo Go and `npx expo install --check` expect. Bump them together.
 */
export const EXPO_VERSIONS = {
  expo: "~56.0.23",
  expoAsset: "~56.0.25",
  expoFileSystem: "~56.0.11",
  expoKeepAwake: "~56.0.3",
  expoStatusBar: "~56.0.4",
  react: "19.2.3",
  reactNative: "0.85.3",
  webView: "13.16.1"
} as const;

/** The page's origin inside the app. `.invalid` never resolves, and the page answers its own file requests. */
export const EXPO_GAME_BASE_URL = "https://game.invalid/";

/** Path of the single-page game inside the generated project. */
export const EXPO_GAME_HTML = "assets/game/game.html";

/** Bytes of game files one page may carry. Phones hold the whole page, base64 encoded, in memory. */
export const MAX_EXPO_GAME_BYTES = 128 * 1024 * 1024;

const DEFAULT_NAME = "NodeTool Game";
const DEFAULT_VERSION = "1.0.0";
const ICON_SIZE = 1024;
// Android masks an adaptive icon's foreground to the middle two thirds of the layer.
const ADAPTIVE_ICON_SCALE = 0.66;

// Android package segments must not be Java keywords or literals.
const JAVA_RESERVED = new Set(["abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "false", "final", "finally", "float", "for", "goto", "if",
  "implements", "import", "instanceof", "int", "interface", "long", "native", "new", "null", "package", "private", "protected",
  "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient",
  "true", "try", "void", "volatile", "while"]);

export type ExpoOrientation = "default" | "portrait" | "landscape";

export interface ExpoAppOptions {
  /** Home screen name. Defaults to "NodeTool Game". */
  readonly name?: string;
  /** iOS bundle identifier and Android package. Defaults to `ai.nodetool.game.<name>`. */
  readonly identifier?: string;
  /** Semantic version `MAJOR.MINOR.PATCH`. */
  readonly version?: string;
  /** Screen orientation lock. A 3D game defaults to its presentation shape, a 2D game to `default` (follows the device). */
  readonly orientation?: ExpoOrientation;
  /** PNG, JPEG or WebP bytes for the app icon. A generated icon is used when absent. */
  readonly icon?: Uint8Array;
}

export interface BuildExpoGameOptions {
  readonly document: AnyGameDocument;
  readonly outputDir: string;
  readonly resolveAsset: (sourceAssetId: string, signal?: AbortSignal) => Promise<StandaloneAsset | null>;
  readonly app?: ExpoAppOptions;
  readonly signal?: AbortSignal;
}

export interface ExpoAppMetadata {
  readonly name: string;
  /** Expo project slug and npm package name. */
  readonly slug: string;
  readonly identifier: string;
  readonly version: string;
  readonly orientation: ExpoOrientation;
  readonly sourceRevision: string;
  readonly dimension: "2d" | "3d";
}

export interface ExpoGameProject {
  readonly outputDir: string;
  /** The game as one self-contained HTML page. */
  readonly htmlPath: string;
  readonly metadata: ExpoAppMetadata;
}

function slug(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/, "");
}

function appName(value: string | undefined): string {
  const cleaned = Array.from(value ?? "", (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  }).join("").replace(/\s+/g, " ").trim().slice(0, 64).trim();
  return cleaned || DEFAULT_NAME;
}

function validIdentifier(identifier: string): boolean {
  // iOS bundle identifiers allow hyphens but not underscores, Android packages the reverse; both accept this subset.
  const segments = identifier.split(".");
  return identifier.length <= 128 && segments.length >= 2 &&
    segments.every((segment) => /^[A-Za-z][A-Za-z0-9]*$/.test(segment) && !JAVA_RESERVED.has(segment));
}

/** Resolves and validates the name, identifiers, version and orientation of an exported mobile app. */
export function expoAppMetadata(document: AnyGameDocument, app: ExpoAppOptions = {}): ExpoAppMetadata {
  const name = appName(app.name);
  const nameSlug = slug(name) || "game";
  const projectSlug = /^[a-z]/.test(nameSlug) ? nameSlug : `game-${nameSlug}`;
  const segment = projectSlug.replace(/-/g, "");
  const identifier = app.identifier ?? `ai.nodetool.game.${JAVA_RESERVED.has(segment) ? `game${segment}` : segment}`;
  if (!validIdentifier(identifier)) {
    throw new Error("App identifier must be reverse-DNS with segments of letters and digits that start with a letter, such as com.example.mygame");
  }
  const version = app.version ?? DEFAULT_VERSION;
  if (!/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/.test(version)) {
    throw new Error("App version must be MAJOR.MINOR.PATCH with each part from 0 to 9999");
  }
  const orientation = app.orientation ?? (document.schemaVersion === 3
    ? document.presentation.aspectRatio >= 1 ? "landscape" : "portrait"
    : "default");
  if (orientation !== "default" && orientation !== "portrait" && orientation !== "landscape") {
    throw new Error("App orientation must be default, portrait or landscape");
  }
  return { name, slug: projectSlug, identifier, version, orientation, sourceRevision: document.revision,
    dimension: document.schemaVersion === 3 ? "3d" : "2d" };
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  json: "application/json", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  wav: "audio/wav", ogg: "audio/ogg", mp3: "audio/mpeg", ttf: "font/ttf", otf: "font/otf", glb: "model/gltf-binary",
  js: "text/javascript", css: "text/css"
};

/**
 * Answers the player's `fetch` of its own files from the bytes embedded in the page, so the page needs no server
 * and no file access. Any other request goes to the browser's `fetch`, which the page's policy limits to `blob:`.
 */
const FILE_SHIM = `(() => {
  const element = document.getElementById("nodetool-game-files");
  const files = JSON.parse(element.textContent);
  element.remove();
  const types = ${JSON.stringify(CONTENT_TYPES)};
  const base = new URL(".", document.baseURI).href;
  const browserFetch = window.fetch.bind(window);
  const decode = (text) => {
    if (typeof Uint8Array.fromBase64 === "function") { return Uint8Array.fromBase64(text); }
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) { bytes[index] = binary.charCodeAt(index); }
    return bytes;
  };
  window.fetch = function (input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : String(input), document.baseURI); }
    catch { return browserFetch(input, init); }
    url.search = "";
    url.hash = "";
    if (!url.href.startsWith(base)) { return browserFetch(input, init); }
    const signal = init && init.signal;
    if (signal && signal.aborted) { return Promise.reject(signal.reason); }
    const path = decodeURIComponent(url.href.slice(base.length));
    if (!Object.prototype.hasOwnProperty.call(files, path)) {
      return Promise.resolve(new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } }));
    }
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return Promise.resolve(new Response(decode(files[path]), {
      status: 200, headers: { "content-type": types[extension] || "application/octet-stream" }
    }));
  };
})();`;

function cspHash(text: string): string {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** Keeps inline script text from ending its element or starting an HTML comment. `\x3C` is "<" in strings and patterns. */
function escapeScript(text: string): string {
  return text.replace(/<(?=\/script|!--)/gi, "\\x3C");
}

function replaceOnce(html: string, pattern: RegExp, replacement: string, label: string): string {
  const matches = html.match(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`));
  if (matches?.length !== 1) { throw new Error(`Web build has no single ${label} to inline`); }
  return html.replace(pattern, () => replacement);
}

async function listFiles(root: string, directory = ""): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { paths.push(...await listFiles(root, path)); }
    else if (entry.isFile()) { paths.push(path); }
  }
  return paths.sort();
}

/**
 * Turns a standalone web build into one HTML page: the stylesheet and player module inline, every other file
 * base64 encoded in a data block, and a script that serves the player's `fetch` of those files from the block.
 * The page then runs from any origin, including a WebView's `loadHTMLString`/`loadDataWithBaseURL`, with no
 * network or file access. Inline code is allowed by hash, so the policy stays as strict as the web build's.
 */
export async function inlineStandaloneGame(webDir: string, signal?: AbortSignal): Promise<string> {
  let html = await readFile(join(webDir, "index.html"), "utf8");
  const stylesheet = /<link rel="stylesheet" href="\.\/([A-Za-z0-9._-]+)">/.exec(html)?.[1];
  const module = /<script type="module" src="\.\/([A-Za-z0-9._-]+)"><\/script>/.exec(html)?.[1];
  if (!stylesheet || !module) { throw new Error("Web build has no stylesheet or player module to inline"); }
  const css = await readFile(join(webDir, stylesheet), "utf8");
  if (/<\/style/i.test(css)) { throw new Error("Web build stylesheet cannot be inlined"); }
  const player = escapeScript(await readFile(join(webDir, module), "utf8"));
  const files: Record<string, string> = {};
  let totalBytes = 0;
  for (const path of await listFiles(webDir)) {
    signal?.throwIfAborted();
    if (path === "index.html" || path === stylesheet || path === module) { continue; }
    const bytes = await readFile(join(webDir, path));
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_EXPO_GAME_BYTES) {
      throw new Error(`A mobile app build supports at most ${MAX_EXPO_GAME_BYTES} bytes of game files`);
    }
    files[path] = bytes.toString("base64");
  }
  const policy = ["default-src 'none'", `script-src ${cspHash(FILE_SHIM)} ${cspHash(player)} 'wasm-unsafe-eval'`, `style-src ${cspHash(css)}`,
    "img-src blob: data:", "media-src blob:", "font-src blob: data:", "connect-src blob:", "base-uri 'none'", "form-action 'none'",
    "object-src 'none'"].join("; ");
  html = replaceOnce(html, /<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${policy}">`, "security policy");
  html = replaceOnce(html, /<link rel="stylesheet" href="[^"]*">/, `<style>${css}</style>`, "stylesheet");
  html = replaceOnce(html, /<script type="module" src="[^"]*"><\/script>/, `<script type="module">${player}</script>`, "player module");
  // JSON of base64 strings and plain paths holds no "<", so the data block cannot close early.
  const data = JSON.stringify(files);
  if (data.includes("<")) { throw new Error("Web build file names must not contain <"); }
  html = replaceOnce(html, /<meta charset="utf-8">/, `<meta charset="utf-8">\n<script type="application/json" id="nodetool-game-files">${data}</script>\n<script>${FILE_SHIM}</script>`, "charset");
  return html;
}

/** `assets/icon.png` and the Android adaptive icon foreground, keyed by path in the project. */
export async function expoIconFiles(source?: Uint8Array): Promise<Record<string, Uint8Array>> {
  const icon = (await renderIcons([ICON_SIZE], source)).get(ICON_SIZE);
  if (!icon) { throw new Error(`Icon size ${ICON_SIZE} was not rendered`); }
  const canvas = createCanvas(ICON_SIZE, ICON_SIZE);
  const inset = Math.round(ICON_SIZE * ADAPTIVE_ICON_SCALE);
  const offset = Math.round((ICON_SIZE - inset) / 2);
  canvas.getContext("2d").drawImage(await loadImage(Buffer.from(icon.png)), offset, offset, inset, inset);
  return { "assets/icon.png": icon.png, "assets/adaptive-icon.png": new Uint8Array(await canvas.encode("png")) };
}

const APP_SOURCE = `import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { useKeepAwake } from "expo-keep-awake";
import { WebView } from "react-native-webview";

// The page carries every game file and answers its own requests, so nothing is fetched from this origin.
// It gives the page a secure https origin for crypto, WebAssembly and saved games.
const BASE_URL = "${EXPO_GAME_BASE_URL}";
const GAME_PAGE = require("./${EXPO_GAME_HTML}");

const PAUSE_SCRIPT = \`(function () {
  try { if (window.nativeGamePlayer) { window.nativeGamePlayer.pause(); } } catch (error) { /* not started */ }
  window.dispatchEvent(new Event("blur"));
})();
true;\`;

function allowedUrl(url) {
  return url === BASE_URL || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:");
}

export default function App() {
  useKeepAwake();
  const webView = useRef(null);
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(0);

  useEffect(() => {
    let active = true;
    Asset.fromModule(GAME_PAGE).downloadAsync()
      .then((asset) => new File(asset.localUri).text())
      .then((text) => { if (active) { setHtml(text); } })
      .catch((cause) => { if (active) { setError(String(cause && cause.message ? cause.message : cause)); } });
    return () => { active = false; };
  }, []);

  // Leaving the app pauses the game and its audio. The player stays paused until the player taps Resume.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") { webView.current?.injectJavaScript(PAUSE_SCRIPT); }
    });
    return () => subscription.remove();
  }, []);

  // The operating system can end the page's process to reclaim memory. Start the game again.
  const restart = useCallback(() => setSession((value) => value + 1), []);

  if (error) {
    return <View style={styles.center}><Text style={styles.text}>The game could not load: {error}</Text></View>;
  }
  if (html === null) {
    return <View style={styles.center}><StatusBar hidden /><ActivityIndicator color="#ffffff" /></View>;
  }
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <WebView
        key={session}
        ref={webView}
        style={styles.root}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={["*"]}
        onShouldStartLoadWithRequest={(request) => allowedUrl(request.url)}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        textInteractionEnabled={false}
        webviewDebuggingEnabled={__DEV__}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#000000" },
  text: { color: "#ffffff", textAlign: "center" }
});
`;

/** The text files of the Expo project, keyed by path relative to the project root. */
export function expoProjectFiles(metadata: ExpoAppMetadata): Record<string, string> {
  const appJson = {
    expo: {
      name: metadata.name,
      slug: metadata.slug,
      version: metadata.version,
      orientation: metadata.orientation,
      icon: "./assets/icon.png",
      userInterfaceStyle: "dark",
      backgroundColor: "#000000",
      platforms: ["ios", "android"],
      ios: { bundleIdentifier: metadata.identifier, supportsTablet: true, requireFullScreen: true },
      android: {
        package: metadata.identifier,
        adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#000000" }
      }
    }
  };
  const packageJson = {
    name: metadata.slug,
    version: metadata.version,
    private: true,
    main: "index.js",
    scripts: { start: "expo start", android: "expo start --android", ios: "expo start --ios" },
    dependencies: {
      expo: EXPO_VERSIONS.expo,
      "expo-asset": EXPO_VERSIONS.expoAsset,
      "expo-file-system": EXPO_VERSIONS.expoFileSystem,
      "expo-keep-awake": EXPO_VERSIONS.expoKeepAwake,
      "expo-status-bar": EXPO_VERSIONS.expoStatusBar,
      react: EXPO_VERSIONS.react,
      "react-native": EXPO_VERSIONS.reactNative,
      "react-native-webview": EXPO_VERSIONS.webView
    }
  };
  const eas = {
    build: {
      preview: { distribution: "internal", android: { buildType: "apk" } },
      production: {}
    }
  };
  const metro = `const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The game ships as one HTML page that the app reads from its bundled assets.
config.resolver.assetExts.push("html");

module.exports = config;
`;
  const index = `import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
`;
  const readme = `# ${metadata.name}

A mobile build of a NodeTool ${metadata.dimension.toUpperCase()} game (revision \`${metadata.sourceRevision}\`) for iOS and Android, made with [Expo](https://expo.dev) SDK 56.

\`${EXPO_GAME_HTML}\` is the whole game as one page: the web player, the game document, the script runtime and every asset. \`App.js\` shows that page full screen in a [WebView](https://github.com/react-native-webview/react-native-webview). The game runs offline. It needs no NodeTool server.

## Try it on a phone

\`\`\`sh
npm install
npx expo start
\`\`\`

Scan the QR code with the Expo Go app (Android) or the Camera app (iOS).

## Build installable apps

Builds run on Expo's EAS service. Create a free Expo account first, then:

\`\`\`sh
npm install -g eas-cli
eas build --platform android --profile preview   # an .apk you can install directly
eas build --platform ios                          # needs an Apple Developer account
\`\`\`

To build on your own computer instead, run \`npx expo run:android\` (Android Studio) or \`npx expo run:ios\` (Xcode on macOS).

## Change the app

The name, version, orientation (\`${metadata.orientation}\`) and app identifier (\`${metadata.identifier}\`) are in \`app.json\`. Replace \`assets/icon.png\` and \`assets/adaptive-icon.png\` to change the icon, or export again from NodeTool with a new icon. Export again from NodeTool to update the game itself.
`;
  return {
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "app.json": `${JSON.stringify(appJson, null, 2)}\n`,
    "eas.json": `${JSON.stringify(eas, null, 2)}\n`,
    "metro.config.js": metro,
    "index.js": index,
    "App.js": APP_SOURCE,
    "README.md": readme,
    ".gitignore": "node_modules/\n.expo/\nios/\nandroid/\n"
  };
}

/** Includes the web runtime, page template, project templates and generated icons in cache identity. */
export async function expoGameRuntimeFingerprint(document: AnyGameDocument, app: ExpoAppOptions = {}): Promise<string> {
  const metadata = expoAppMetadata(document, app);
  const web = document.schemaVersion === 3
    ? await (await import("./build3d.js")).standaloneGame3DRuntimeFingerprint()
    : await (await import("./build.js")).standaloneGameRuntimeFingerprint();
  return gameBuildFingerprint({ format: "nodetool-expo-v1", web, shim: FILE_SHIM, ...expoProjectFiles(metadata), ...await expoIconFiles(app.icon) });
}

/** Exports a game as an Expo project: the standalone web player as one offline page, shown full screen in a WebView. */
export async function buildExpoGameProject(options: BuildExpoGameOptions): Promise<ExpoGameProject> {
  options.signal?.throwIfAborted();
  const metadata = expoAppMetadata(options.document, options.app);
  const icons = await expoIconFiles(options.app?.icon);
  const outputDir = resolve(options.outputDir);
  await mkdir(dirname(outputDir), { recursive: true });
  const staging = await mkdtemp(join(dirname(outputDir), ".nodetool-game-expo-"));
  try {
    const webDir = join(staging, ".web");
    if (options.document.schemaVersion === 3) {
      const { buildStandaloneGame3D } = await import("./build3d.js");
      await buildStandaloneGame3D({ document: options.document, outputDir: webDir, resolveAsset: options.resolveAsset, signal: options.signal });
    } else {
      const { buildStandaloneGame } = await import("./build.js");
      await buildStandaloneGame({ document: options.document, outputDir: webDir, signal: options.signal, resolveAsset: (assetId) => options.resolveAsset(assetId, options.signal) });
    }
    const page = await inlineStandaloneGame(webDir, options.signal);
    await rm(webDir, { recursive: true, force: true });
    options.signal?.throwIfAborted();
    const files: Record<string, string | Uint8Array> = { ...expoProjectFiles(metadata), ...icons, [EXPO_GAME_HTML]: page };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(staging, path)), { recursive: true });
      await writeFile(join(staging, path), content);
    }
    options.signal?.throwIfAborted();
    let existing: string[] | undefined;
    try { existing = await readdir(outputDir); }
    catch (error) { if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") { throw error; } }
    if (existing && existing.length > 0) { throw new Error(`Output directory is not empty: ${outputDir}`); }
    if (existing) { await rmdir(outputDir); }
    await rename(staging, outputDir);
    return { outputDir, htmlPath: join(outputDir, EXPO_GAME_HTML), metadata };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}
