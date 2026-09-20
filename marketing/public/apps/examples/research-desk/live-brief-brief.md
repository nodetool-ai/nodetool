# On-Device Language Models

## TL;DR

- **Adopt on-device models selectively, not as a universal replacement for cloud inference.** Small models are now viable for bounded tasks such as classification, extraction, rewriting, summarization, offline assistance, and structured tool calls; larger or open-ended reasoning workloads will generally still need a cloud fallback.
- **The main product benefits are availability, data locality, and predictable interaction latency.** However, “on device” does not automatically guarantee privacy: telemetry, model updates, logs, prompts, and fallback paths still require explicit controls.
- **Quantization is central to deployment.** It reduces memory and can improve throughput, but accuracy and energy effects depend on the model, precision, hardware, and workload. Benchmark the exact model and device rather than relying on parameter count alone.[3][5]
- **A practical architecture is hybrid:** run a compact model locally for routine or sensitive operations, route unsupported or high-value requests to a server, and make the routing policy observable and user-controllable.

## Research questions

1. What capabilities are realistic on current phones and edge devices?
2. What hardware, memory, runtime, and model-format constraints determine feasibility?
3. How do quantization and optimization affect quality, latency, memory, and energy?
4. What product and operational risks should determine whether to adopt?

## 1. Capability envelope

### Small models are increasingly capable, but benchmark results need qualification

Microsoft’s Phi-3 technical report describes **phi-3-mini as a 3.8-billion-parameter model** trained on **3.3 trillion tokens**. The report gives it a **69% MMLU score** and an **8.38 MT-Bench score**, and states that it is small enough to deploy on a phone.[1] These results indicate that phone-class deployment can support useful general language tasks, not merely narrow classifiers.

The same report also says that larger…[13421 chars]
