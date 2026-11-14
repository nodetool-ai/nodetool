---
layout: page
title: "Why NodeTool"
description: "How NodeTool differs from hosted AI platforms, and how it compares to ComfyUI, Dify, Flowise, Langflow, n8n, and Figma Weave (formerly Weavy)."
---

<p class="why-lead">
  An agent builds a project from one brief with image, video, audio, and text
  models. The result is an editable storyboard, timeline, or graph, not a flat
  video file.
</p>

<div class="why-versus">
  <div class="why-path why-path-old">
    <p class="why-path-label">The usual way</p>
    <ol class="why-chain">
      <li>Write the idea in a chat app</li>
      <li>Generate stills in an image app</li>
      <li>Animate them in a video app</li>
      <li>Cut them with music in an editor</li>
    </ol>
    <p class="why-path-foot">One change means doing it all again.</p>
  </div>
  <div class="why-path why-path-new">
    <p class="why-path-label">With NodeTool</p>
    <ol class="why-chain">
      <li>Write one brief</li>
      <li>The agent drafts, boards, renders, and cuts</li>
      <li>Open the project and change any part</li>
    </ol>
    <p class="why-path-foot">One project on your own keys. Every step is editable and re-runnable.</p>
  </div>
</div>

## What the agent builds

<div class="why-agent">
  <div class="why-agent-media">
    <video muted loop playsinline autoplay preload="metadata"
      poster="https://nodetool.ai/agent-redo-poster-960.webp"
      aria-label="The agent renders a six-shot storyboard. A one-line note sends shot 3 back for night, and only that shot renders again.">
      <source src="https://nodetool.ai/agent-redo.webm" type="video/webm">
      <source src="https://nodetool.ai/agent-redo.mp4" type="video/mp4">
    </video>
  </div>
  <ul class="why-points">
    <li><strong>No programming.</strong> The agent picks the models, connects them, runs them, and fixes errors it finds.</li>
    <li><strong>Editable output.</strong> It builds an ordinary storyboard, timeline, or graph. Open it, swap a model, rewire a step, and run again.</li>
    <li><strong>Per-shot changes.</strong> Ask for a change to one shot and only that shot renders again.</li>
    <li><strong>Agents inside workflows.</strong> Put an agent node in your own graph to plan, decide, and call tools.</li>
  </ul>
</div>

## What you keep

<div class="why-own-grid">
  <article class="why-own">
    <span class="why-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg></span>
    <h3>Bring your own keys</h3>
    <p>Connect OpenAI, Anthropic, Gemini, FAL, KIE, Replicate, and the video specialists. Keys are stored encrypted, with the encryption key in your operating system's keychain in Studio.</p>
  </article>
  <article class="why-own">
    <span class="why-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg></span>
    <h3>The provider's own price</h3>
    <p>A Seedream 5 Lite still that costs $0.03 on Kie.ai costs $0.03 here, billed by Kie.ai to your account. On your own keys NodeTool takes no cut. You can also run the agent on a ChatGPT, Claude, or Gemini plan you already pay for.</p>
  </article>
  <article class="why-own">
    <span class="why-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg></span>
    <h3>Editable project files</h3>
    <p>The board, the script with its takes, and the multi-track cut are documents you can open and edit again. Workflows and mini apps export as a <code>.nodetool</code> bundle you can import anywhere.</p>
  </article>
  <article class="why-own">
    <span class="why-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg></span>
    <h3>Open source</h3>
    <p>Studio and Cloud are built from the same AGPL-3.0 source, with no paywalled features. You can fork it or host it yourself.</p>
  </article>
</div>

<aside class="why-callout">
  <p class="why-callout-kicker">Where NodeTool fits</p>
  <h3>Pick the model and the price</h3>
  <p>
    FAL, Replicate, and KIE each sell Seedance at a different price. You pick
    the provider per node. Switching to Veo or Kling is a model change on the node.
  </p>
</aside>

## An open studio and a hosted platform

<div class="why-table" role="region" aria-label="NodeTool compared with a hosted AI platform" tabindex="0">
  <table>
    <thead>
      <tr><th scope="col"><span class="visually-hidden">Topic</span></th><th scope="col">NodeTool</th><th scope="col">Hosted platforms</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Models</th><td>Many providers, switched per node</td><td>The list they picked</td></tr>
      <tr><th scope="row">When a better model ships</th><td>Select it once its provider lists it</td><td>Wait for them to add it</td></tr>
      <tr><th scope="row">What you pay</th><td>Provider list prices, on your own keys</td><td>Their credits</td></tr>
      <tr><th scope="row">What you keep</th><td>The board, the takes, and the multi-track cut as an editable project</td><td>An exported video. The project stays in their app.</td></tr>
      <tr><th scope="row">Source</th><td>Open, AGPL-3.0</td><td>Closed</td></tr>
      <tr><th scope="row">Where it runs</th><td>Desktop app and browser, self-host any time</td><td>Their servers only</td></tr>
      <tr><th scope="row">Local models</th><td>Run on your own GPU in Studio, offline</td><td>Not available</td></tr>
    </tbody>
  </table>
</div>

## Head-to-head

<div class="why-vs-grid">
  <a class="why-vs" href="https://nodetool.ai/alternatives/comfyui">
    <h3>ComfyUI</h3>
    <p>Local image graphs. NodeTool adds video, audio, and text, and runs an exported ComfyUI graph as a node.</p>
  </a>
  <a class="why-vs" href="https://nodetool.ai/alternatives/figma-weave">
    <h3>Figma Weave (Weavy)</h3>
    <p>A hosted canvas on credits. NodeTool is open source and runs on your own keys.</p>
  </a>
  <a class="why-vs" href="https://nodetool.ai/alternatives/n8n">
    <h3>n8n</h3>
    <p>Connects business apps. NodeTool is built for creative AI and media generation.</p>
  </a>
  <a class="why-vs" href="https://nodetool.ai/alternatives/dify">
    <h3>Dify</h3>
    <p>Mostly text apps. NodeTool adds native image, video, and music generation.</p>
  </a>
  <a class="why-vs" href="https://nodetool.ai/alternatives/flowise">
    <h3>Flowise</h3>
    <p>Chatbots on a canvas. NodeTool builds those too, next to media generation.</p>
  </a>
  <a class="why-vs" href="https://nodetool.ai/alternatives/langflow">
    <h3>Langflow</h3>
    <p>Text pipelines. NodeTool adds image, video, and music on the same canvas.</p>
  </a>
</div>

Already have a tuned ComfyUI graph? It keeps working inside NodeTool. See [ComfyUI](comfyui.md).

## Next steps

<div class="why-next">
  <a class="why-next-card" href="{{ '/getting-started' | relative_url }}">
    <strong>Quick Start →</strong>
    <span>Install NodeTool and run a first project.</span>
  </a>
  <a class="why-next-card" href="{{ '/models-and-providers' | relative_url }}">
    <strong>Models &amp; Providers →</strong>
    <span>Every model NodeTool supports, and how to connect a key.</span>
  </a>
</div>
