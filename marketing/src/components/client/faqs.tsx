"use client";

import { Disclosure } from "@headlessui/react";
import { MinusSmallIcon, PlusSmallIcon } from "@heroicons/react/24/outline";

const faqs = [
  {
    question: "What is NodeTool?",
    answer:
      "NodeTool is the open creative AI workspace. Every major model from every major provider — FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, and more — wired into one node-based canvas you run on your machine or in the browser.",
  },
  {
    question: "What does BYOK mean for me?",
    answer:
      "Bring your own keys. You connect your own provider accounts and pay providers directly at provider prices. NodeTool never marks up model calls and never issues proprietary credits.",
  },
  {
    question: "Is NodeTool open source?",
    answer:
      "Yes. The full codebase is AGPL-3.0 on GitHub. Studio and Cloud share the same source — no closed-source layer, no \"pro\" tier hiding the good features. Self-host any time.",
  },
  {
    question: "How is this different from ComfyUI?",
    answer:
      "ComfyUI is a node editor for diffusion models. NodeTool is the studio around it: image, video, music, and words on one canvas, every major model a click away.",
  },
  {
    question: "How is this different from Weavy and other closed canvases?",
    answer:
      "Closed canvases lock you into a credit system and a curated model roster. NodeTool is open source and BYOK. Your workflows, files, and keys belong to you. Switch providers the moment a better model ships.",
  },
  {
    question: "Studio or Cloud — which should I use?",
    answer:
      "Studio is the desktop app: free, open source, runs on your machine, supports local models via MLX, Ollama, and GGUF. Cloud is the same workspace in the browser — zero setup, no GPU required, your keys still go to providers directly. Same workflows either way.",
  },
  {
    question: "Which models are supported?",
    answer:
      "Frontier models including Flux, Seedance, Wan, Veo, Kling, Hailuo, Qwen Image, Whisper, ElevenLabs, and Suno — called through providers like FAL, KIE, OpenAI, Anthropic, Gemini, Replicate, Together, Groq, Mistral, OpenRouter, and HuggingFace. Local inference via MLX, Ollama, llama.cpp, vLLM, and LM Studio.",
  },
];

export default function Faqs() {
  return (
    <div className="mx-auto mt-32 max-w-7xl px-6 sm:mt-56 lg:px-8">
      <div className="mx-auto max-w-4xl divide-y divide-gray-900/10">
        <h2 className="text-2xl font-bold leading-10 tracking-tight text-gray-900">
          Frequently asked questions
        </h2>
        <dl className="mt-10 space-y-6 divide-y divide-gray-900/10">
          {faqs.map((faq) => (
            <Disclosure as="div" key={faq.question} className="pt-6">
              {({ open }) => (
                <>
                  <dt>
                    <Disclosure.Button className="flex w-full items-start justify-between text-left text-gray-900">
                      <span className="text-base font-semibold leading-7">
                        {faq.question}
                      </span>
                      <span className="ml-6 flex h-7 items-center">
                        {open ? (
                          <MinusSmallIcon
                            className="h-6 w-6"
                            aria-hidden="true"
                          />
                        ) : (
                          <PlusSmallIcon
                            className="h-6 w-6"
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    </Disclosure.Button>
                  </dt>
                  <Disclosure.Panel as="dd" className="mt-2 pr-12">
                    <p className="text-base leading-7 text-gray-600">
                      {faq.answer}
                    </p>
                  </Disclosure.Panel>
                </>
              )}
            </Disclosure>
          ))}
        </dl>
      </div>
    </div>
  );
}
