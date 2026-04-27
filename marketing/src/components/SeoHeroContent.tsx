import React from "react";

/**
 * Server-rendered SEO content that appears above the fold.
 * This component is rendered on the server for search engine visibility.
 * It provides keyword-rich, semantic content optimized for LLM extraction and citations.
 */
export default function SeoHeroContent() {
  return (
    <div className="sr-only-seo mx-auto max-w-4xl px-6">
      {/* Canonical Definition */}
      <section aria-labelledby="definition">
        <h1 id="definition" className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-6">
          NodeTool: Visual AI Workflow Builder for Local and Cloud AI Development
        </h1>
        <p className="text-lg text-slate-300 mb-8 leading-relaxed">
          NodeTool is a node-based visual programming tool for building AI workflows and applications. 
          It runs locally on macOS, Windows, and Linux, allowing developers to create LLM agents, RAG systems, 
          and multimodal content pipelines by connecting nodes in a drag-and-drop interface.
        </p>
      </section>

      {/* What Problem It Solves */}
      <section aria-labelledby="problem" className="text-left max-w-2xl mx-auto mb-8">
        <h2 id="problem" className="text-xl font-semibold text-white mb-3">
          What Problem Does NodeTool Solve?
        </h2>
        <p className="text-slate-300 leading-relaxed">
          Building AI workflows typically requires writing code to orchestrate multiple models, APIs, and data sources. 
          NodeTool eliminates this friction by providing a visual canvas where developers can connect AI components 
          without managing boilerplate code. It solves the data privacy concern of cloud-only solutions by running 
          entirely on your local machine while still supporting cloud APIs when needed.
        </p>
      </section>

      {/* Who It's For */}
      <section aria-labelledby="audience" className="text-left max-w-2xl mx-auto mb-8">
        <h2 id="audience" className="text-xl font-semibold text-white mb-3">
          Who Is NodeTool For?
        </h2>
        <ul className="space-y-2 text-slate-300">
          <li>• AI developers building LLM applications and agents</li>
          <li>• Creative professionals working with generative AI (images, video, audio)</li>
          <li>• Data engineers creating RAG pipelines and vector database workflows</li>
          <li>• Researchers prototyping multimodal AI systems</li>
          <li>• Teams requiring local-first AI for privacy or compliance</li>
        </ul>
      </section>

      {/* How It Works */}
      <section aria-labelledby="how-it-works" className="text-left max-w-2xl mx-auto mb-8">
        <h2 id="how-it-works" className="text-xl font-semibold text-white mb-3">
          How NodeTool Works
        </h2>
        <p className="text-slate-300 leading-relaxed mb-3">
          NodeTool uses a node-based visual interface where each node represents an AI operation (LLM call, image generation, 
          data transformation, etc.). Users connect nodes by dragging edges between them. The tool handles:
        </p>
        <ul className="space-y-2 text-slate-300">
          <li>• Type-safe connections between nodes (preventing incompatible data flows)</li>
          <li>• Local execution engine (async Node.js runner; custom nodes in TypeScript or Python)</li>
          <li>• Real-time workflow execution with live preview of outputs</li>
          <li>• Model management for local LLMs (MLX, GGML/GGUF formats)</li>
          <li>• Integration with cloud APIs (OpenAI, Anthropic, Replicate, etc.)</li>
        </ul>
      </section>

      {/* Key Differences */}
      <section aria-labelledby="differences" className="text-left max-w-2xl mx-auto mb-8">
        <h2 id="differences" className="text-xl font-semibold text-white mb-3">
          How NodeTool Differs From Alternatives
        </h2>
        <div className="space-y-3 text-slate-300">
          <div>
            <strong className="text-white">vs ComfyUI:</strong> ComfyUI focuses on image generation workflows (Stable Diffusion). 
            NodeTool extends this concept to general AI workflows including LLM agents, text processing, RAG, audio, and video.
          </div>
          <div>
            <strong className="text-white">vs n8n:</strong> n8n is a general workflow automation tool. NodeTool is specialized 
            for AI workloads with native support for model management, local LLMs, and multimodal AI operations.
          </div>
          <div>
            <strong className="text-white">vs LangChain:</strong> LangChain is a code-first Python framework. NodeTool provides
            a visual interface and runs workflows locally in an async Node.js runner. No coding required to build workflows,
            and you can extend it with custom nodes in TypeScript or Python.
          </div>
        </div>
      </section>

      {/* Key Capabilities */}
      <section aria-labelledby="capabilities" className="text-left max-w-2xl mx-auto mb-8">
        <h2 id="capabilities" className="text-xl font-semibold text-white mb-3">
          Core Capabilities
        </h2>
        <ul className="space-y-2 text-slate-300">
          <li>• <strong>Local-First Architecture:</strong> Runs on macOS, Windows, Linux without internet dependency</li>
          <li>• <strong>Multi-Provider Support:</strong> OpenAI, Anthropic, Ollama, Replicate, Hugging Face, and custom models</li>
          <li>• <strong>Multimodal Processing:</strong> Text, images, video, and audio in unified workflows</li>
          <li>• <strong>RAG & Vector Databases:</strong> Built-in support for document indexing and semantic search</li>
          <li>• <strong>AI Agent Framework:</strong> Build autonomous agents with tool use and web browsing</li>
          <li>• <strong>Open Source:</strong> TypeScript end-to-end with an async Node.js runner; custom nodes in TypeScript or Python</li>
        </ul>
      </section>

      {/* Quick Facts */}
      <section aria-labelledby="facts" className="mt-10 text-slate-400 border-t border-slate-800/50 pt-6">
        <h2 id="facts" className="sr-only">Quick Facts</h2>
        <dl className="space-y-2 text-sm">
          <div><dt className="inline font-semibold">License:</dt> <dd className="inline">Open Source</dd></div>
          <div><dt className="inline font-semibold">Platforms:</dt> <dd className="inline">macOS, Windows, Linux</dd></div>
          <div><dt className="inline font-semibold">Architecture:</dt> <dd className="inline">Local-first with optional cloud APIs</dd></div>
          <div><dt className="inline font-semibold">Category:</dt> <dd className="inline">AI Development Tool, Visual Programming</dd></div>
        </dl>
      </section>
    </div>
  );
}
