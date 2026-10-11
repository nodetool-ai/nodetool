import React from "react";
import MarketingFacts, {
  type MarketingFact,
} from "../../../components/MarketingFacts";
import MarketingPageShell from "../../../components/MarketingPageShell";
import CodeBlock from "../../../components/developers/CodeBlock";
import {
  LibraryFooterNote,
  LibraryHero,
  LibraryQuestions,
  LibrarySection,
  MonoFigure,
  inlineCode,
  type LibraryQuestion,
} from "../../../components/libraries/LibraryParts";

const PACKAGE = "@nodetool-ai/browser";
const SOURCE =
  "https://github.com/nodetool-ai/nodetool/tree/main/packages/browser";

const heroCode = `import {
  browserNavigate,
  browserView,
  browserInput,
} from "@nodetool-ai/browser";

await browserNavigate({ url: "https://news.ycombinator.com" });

// Every interactive element comes back numbered,
// with its tag, role, text, attributes and bounding box.
const { elements, screenshot_png_b64 } = await browserView({
  include_screenshot: true,
});

const search = elements.find((el) => el.attributes.name === "q");
await browserInput({ index: search!.index, text: "quickjs", press_enter: true });`;

const switchCode = `import { browserRestart, browserStatus } from "@nodetool-ai/browser";

// Same calls as above, now against the tab you attached in your own Chrome.
await browserRestart({ transport: "extension" });
console.log(await browserStatus());`;

const transportDiagram = `transport: "local"

  your Node process ──CDP over WebSocket──▶ headless Chrome it launched


transport: "extension"

  your Node process
        │  CDP commands and events, NDJSON
        │  unix socket, mode 0600 in a 0700 directory
        ▼
  native host            started by Chrome when the extension connects
        │  Chrome native messaging, length-prefixed JSON
        ▼
  extension service worker
        │  chrome.debugger.sendCommand / onEvent
        ▼
  the tab you attached   your cookies, sessions and 2FA`;

const actions: { name: string; does: string }[] = [
  { name: "browserView", does: "Index interactive elements, optionally with a PNG screenshot." },
  { name: "browserNavigate", does: "Go to a URL and wait for load, DOMContentLoaded or network idle." },
  { name: "browserClick", does: "Click an element by index or by viewport coordinates." },
  { name: "browserInput", does: "Type into an element, optionally pressing Enter." },
  { name: "browserPressKey", does: "Press a key, such as Enter or Escape." },
  { name: "browserSelectOption", does: "Pick an option in a select element." },
  { name: "browserScroll", does: "Scroll by pixels, or to the top or bottom." },
  { name: "browserMoveMouse", does: "Move the pointer to viewport coordinates." },
  { name: "browserConsoleExec", does: "Evaluate JavaScript in the page." },
  { name: "browserConsoleView", does: "Read the page's console output." },
  { name: "browserCaptureMedia", does: "Pull an image, video or audio file out of the page." },
  { name: "browserUploadAsset", does: "Put bytes into a file input." },
  { name: "browserStatus", does: "Report which transport is live." },
  { name: "browserRestart", does: "Tear the session down, optionally switching transport." },
];

const extensionFacts: MarketingFact[] = [
  {
    term: "No debug flags on your browser",
    description:
      "You do not relaunch Chrome with --remote-debugging-port. Since Chrome 136 that flag is ignored for the default profile, so it cannot reach the profile you are signed in to anyway.",
  },
  {
    term: "Attach is a click",
    description:
      "The extension never attaches on page load. You press Attach to this tab in its popup, and Chrome shows its \"is debugging this browser\" banner until you detach or close the tab.",
  },
  {
    term: "One host, several clients",
    description:
      "The native host rewrites command ids per client and fans events out to all of them. The debugger stays attached until the last client disconnects.",
  },
  {
    term: "Chromium browsers",
    description:
      "installNativeHost() writes the host manifest for Chrome, Chromium, Brave, Edge and Arc on macOS and Linux.",
  },
];

const designFacts: MarketingFact[] = [
  {
    term: "Plain data in and out",
    description:
      "Inputs are plain values. A screenshot comes back as base64, not a file on disk. Your code decides what to keep.",
  },
  {
    term: "Zod schemas for every action",
    description:
      "Each action's input and output is a Zod schema exported from the package. That is the shape an LLM tool definition needs.",
  },
  {
    term: "Nothing loads on import",
    description:
      "Chrome and the CDP client are dynamic imports. Importing the package starts no process until the first action runs.",
  },
  {
    term: "Media capture with a fallback",
    description:
      "browserCaptureMedia reads the response body over CDP first, then retries with an in-page fetch when the body is gone.",
  },
];

const questions: LibraryQuestion[] = [
  {
    question: "Why not Playwright or Puppeteer?",
    answer: (
      <>
        Use them for test suites and scripted scraping. They are far more
        complete. This package covers a narrower case: an agent or a script
        acting inside the browser profile you already use, through one small
        action loop that works the same headless or attached. Element indexing
        returns numbered elements so a model can say {" "}
        <code className={inlineCode}>click 14</code> instead of writing a
        selector.
      </>
    ),
  },
  {
    question: "Who can drive my browser once the host is installed?",
    answer: (
      <>
        Any process running as your OS user can connect to the host socket.
        The socket&apos;s file permissions are the only access control. If a
        client sends an attach frame while no tab is attached, the extension
        attaches the active tab. Detach when you are done, and do not install
        the host on a shared account.
      </>
    ),
  },
  {
    question: "Can two callers use it at once?",
    answer:
      "They share one page. The session is a process-wide singleton, so concurrent callers drive the same tab. Run separate processes if you need separate pages.",
  },
  {
    question: "Does the extension come from the Chrome Web Store?",
    answer: (
      <>
        No. Build it from <code className={inlineCode}>chrome-extension/</code>{" "}
        in the repository and load it unpacked. Its ID is pinned by the key in
        its manifest, so the host manifest matches it.
      </>
    ),
  },
  {
    question: "Windows?",
    answer:
      "The headless transport works. The extension transport does not yet: installing the native host on Windows needs a registry entry, and installNativeHost() throws there.",
  },
  {
    question: "How is it tested?",
    answer: (
      <>
        <code className={inlineCode}>npm test</code> covers the wire protocol,
        the RPC client and transport resolution without a browser.{" "}
        <code className={inlineCode}>npm run test:integration</code> builds the
        extension, loads it in a real headless Chrome and drives the extension
        transport against local fixtures. It needs Chrome, so it runs by hand,
        not in CI.
      </>
    ),
  },
];

export default function BrowserLibraryPage() {
  return (
    <MarketingPageShell>
      <LibraryHero
        id="browser-library-title"
        packageName={PACKAGE}
        title="Drive the Chrome you are already signed in to."
        lead={
          <p>
            A small TypeScript library for driving one Chrome page over the
            DevTools Protocol. Point it at a headless Chrome it launches, or at
            a tab in your everyday browser through a Chrome extension. In that
            tab your cookies, sessions and 2FA are already in place, so sites
            that block headless browsers still load.
          </p>
        }
        links={[
          { label: "Source", href: SOURCE, event: "Star GitHub" },
          {
            label: "npm",
            href: "https://www.npmjs.com/package/@nodetool-ai/browser",
            event: "Open Docs",
          },
          {
            label: "Extension docs",
            href: "https://docs.nodetool.ai/chrome-extension",
            event: "Open Docs",
          },
        ]}
        facts={["TypeScript", "Node 22+", "chrome-remote-interface", "zod"]}
      >
        <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
          <CodeBlock code={heroCode} language="typescript" />
        </div>
      </LibraryHero>

      <LibrarySection
        id="transports"
        eyebrow="Two transports"
        title="One action loop, headless or in your own tab."
        lead={
          <p>
            Only <code className={inlineCode}>browserStatus</code> and{" "}
            <code className={inlineCode}>browserRestart</code> know which
            transport is live. Element indexing, clicks, typing and screenshots
            run the same code against both, so a script written headless runs
            unchanged in your signed-in tab.
          </p>
        }
      >
        <div className="grid items-start gap-8 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <MonoFigure
              label="Diagram of the local and extension transports"
              caption="The extension relays CDP. It originates no commands, and no server sits in the path."
            >
              {transportDiagram}
            </MonoFigure>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
              <CodeBlock code={switchCode} language="typescript" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Setting{" "}
              <code className={inlineCode}>
                NODETOOL_BROWSER_TRANSPORT=extension
              </code>{" "}
              before the process starts has the same effect.
            </p>
          </div>
        </div>
      </LibrarySection>

      <LibrarySection
        id="extension"
        eyebrow="Why an extension"
        title="Your real profile, without restarting Chrome."
      >
        <MarketingFacts items={extensionFacts} />
      </LibrarySection>

      <LibrarySection
        id="actions"
        eyebrow="API"
        title="Fourteen actions."
        lead={
          <p>
            Each takes one plain object and returns one. Address elements by
            the index from the last{" "}
            <code className={inlineCode}>browserView</code> or by viewport
            coordinates. Lower-level access is exported as{" "}
            <code className={inlineCode}>CdpPage</code>,{" "}
            <code className={inlineCode}>launchBrowser</code> and{" "}
            <code className={inlineCode}>withPage</code>.
          </p>
        }
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Function
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  What it does
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {actions.map((action) => (
                <tr key={action.name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-jetbrains text-slate-100">
                    {action.name}
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">{action.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LibrarySection>

      <LibrarySection
        id="design"
        eyebrow="Design"
        title="It knows nothing about the app that calls it."
      >
        <MarketingFacts items={designFacts} />
      </LibrarySection>

      <LibrarySection
        id="questions"
        eyebrow="Questions"
        title="Limits and trade-offs."
      >
        <LibraryQuestions items={questions} />
      </LibrarySection>

      <LibraryFooterNote sourceHref={SOURCE} packageName={PACKAGE}>
        <p>
          This package came out of NodeTool, an open-source workspace for AI
          workflows. NodeTool&apos;s agent browser tools and its Screenshot
          node both call it. The library itself has no NodeTool runtime in it
          beyond a logger, and it is MIT licensed.
        </p>
      </LibraryFooterNote>
    </MarketingPageShell>
  );
}
