import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class Llama3_8B extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Llama3_8B";
  static readonly title = "Llama3_8 B";
  static readonly description = `Base version of Llama 3, an 8 billion parameter language model from Meta.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "A parameter that controls how long the outputs are. If < 1, the model will tend to generate shorter outputs, and > 1 will tend to generate longer outputs."
  })
  declare length_penalty: any;

  @prop({ type: "bool", default: false })
  declare log_performance_metrics: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to max_tokens. max_new_tokens only exists for backwards compatibility purposes. We recommend you use max_tokens instead. Both may not be specified."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens."
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to min_tokens. min_new_tokens only exists for backwards compatibility purposes. We recommend you use min_tokens instead. Both may not be specified."
  })
  declare min_new_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens."
  })
  declare min_tokens: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to send to the model."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "{prompt}",
    description:
      "Template for formatting the prompt. Can be an arbitrary string, but must contain the substring '{prompt}'."
  })
  declare prompt_template: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'."
  })
  declare stop_sequences: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "When decoding text, samples from the top k most likely tokens; lower to ignore less likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const lengthPenalty = Number(this.length_penalty ?? 1);
    const logPerformanceMetrics = Boolean(
      this.log_performance_metrics ?? false
    );
    const maxNewTokens = Number(this.max_new_tokens ?? 0);
    const maxTokens = Number(this.max_tokens ?? 512);
    const minNewTokens = Number(this.min_new_tokens ?? 0);
    const minTokens = Number(this.min_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const stopSequences = String(this.stop_sequences ?? "");
    const temperature = Number(this.temperature ?? 0.7);
    const topK = Number(this.top_k ?? 0);
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      length_penalty: lengthPenalty,
      log_performance_metrics: logPerformanceMetrics,
      max_new_tokens: maxNewTokens,
      max_tokens: maxTokens,
      min_new_tokens: minNewTokens,
      min_tokens: minTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      seed: seed,
      stop_sequences: stopSequences,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/meta-llama-3-8b:9a9e68fc8695f5847ce944a5cecf9967fd7c64d0fb8c8af1d5bdcc71f03c5e47",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llama3_8B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Llama3_8B_Instruct";
  static readonly title = "Llama3_8 B_ Instruct";
  static readonly description = `An 8 billion parameter language model from Meta, fine tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "A parameter that controls how long the outputs are. If < 1, the model will tend to generate shorter outputs, and > 1 will tend to generate longer outputs."
  })
  declare length_penalty: any;

  @prop({ type: "bool", default: false })
  declare log_performance_metrics: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to max_tokens. max_new_tokens only exists for backwards compatibility purposes. We recommend you use max_tokens instead. Both may not be specified."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens."
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to min_tokens. min_new_tokens only exists for backwards compatibility purposes. We recommend you use min_tokens instead. Both may not be specified."
  })
  declare min_new_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens."
  })
  declare min_tokens: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to send to the model."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default:
      "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>",
    description:
      "Template for formatting the prompt. Can be an arbitrary string, but must contain the substring '{prompt}'."
  })
  declare prompt_template: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "<|end_of_text|>,<|eot_id|>",
    description:
      "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'."
  })
  declare stop_sequences: any;

  @prop({
    type: "str",
    default: "You are a helpful assistant",
    description:
      "System prompt to send to the model. This is prepended to the prompt and helps guide system behavior."
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "When decoding text, samples from the top k most likely tokens; lower to ignore less likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const lengthPenalty = Number(this.length_penalty ?? 1);
    const logPerformanceMetrics = Boolean(
      this.log_performance_metrics ?? false
    );
    const maxNewTokens = Number(this.max_new_tokens ?? 0);
    const maxTokens = Number(this.max_tokens ?? 512);
    const minNewTokens = Number(this.min_new_tokens ?? 0);
    const minTokens = Number(this.min_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const stopSequences = String(
      this.stop_sequences ?? "<|end_of_text|>,<|eot_id|>"
    );
    const systemPrompt = String(
      this.system_prompt ?? "You are a helpful assistant"
    );
    const temperature = Number(this.temperature ?? 0.7);
    const topK = Number(this.top_k ?? 0);
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      length_penalty: lengthPenalty,
      log_performance_metrics: logPerformanceMetrics,
      max_new_tokens: maxNewTokens,
      max_tokens: maxTokens,
      min_new_tokens: minNewTokens,
      min_tokens: minTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      seed: seed,
      stop_sequences: stopSequences,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/meta-llama-3-8b-instruct:5a6809ca6288247d06daf6365557e5e429063f32a21146b2a807c682652136b8",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llama3_70B extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Llama3_70B";
  static readonly title = "Llama3_70 B";
  static readonly description = `Base version of Llama 3, a 70 billion parameter language model from Meta.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "A parameter that controls how long the outputs are. If < 1, the model will tend to generate shorter outputs, and > 1 will tend to generate longer outputs."
  })
  declare length_penalty: any;

  @prop({ type: "bool", default: false })
  declare log_performance_metrics: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to max_tokens. max_new_tokens only exists for backwards compatibility purposes. We recommend you use max_tokens instead. Both may not be specified."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens."
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to min_tokens. min_new_tokens only exists for backwards compatibility purposes. We recommend you use min_tokens instead. Both may not be specified."
  })
  declare min_new_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens."
  })
  declare min_tokens: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to send to the model."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "{prompt}",
    description:
      "Template for formatting the prompt. Can be an arbitrary string, but must contain the substring '{prompt}'."
  })
  declare prompt_template: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "<|end_of_text|>",
    description:
      "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'."
  })
  declare stop_sequences: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "When decoding text, samples from the top k most likely tokens; lower to ignore less likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const lengthPenalty = Number(this.length_penalty ?? 1);
    const logPerformanceMetrics = Boolean(
      this.log_performance_metrics ?? false
    );
    const maxNewTokens = Number(this.max_new_tokens ?? 0);
    const maxTokens = Number(this.max_tokens ?? 512);
    const minNewTokens = Number(this.min_new_tokens ?? 0);
    const minTokens = Number(this.min_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const stopSequences = String(this.stop_sequences ?? "<|end_of_text|>");
    const temperature = Number(this.temperature ?? 0.7);
    const topK = Number(this.top_k ?? 0);
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      length_penalty: lengthPenalty,
      log_performance_metrics: logPerformanceMetrics,
      max_new_tokens: maxNewTokens,
      max_tokens: maxTokens,
      min_new_tokens: minNewTokens,
      min_tokens: minTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      seed: seed,
      stop_sequences: stopSequences,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/meta-llama-3-70b:83c5bdea9941e83be68480bd06ad792f3f295612a24e4678baed34083083a87f",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llama3_70B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Llama3_70B_Instruct";
  static readonly title = "Llama3_70 B_ Instruct";
  static readonly description = `A 70 billion parameter language model from Meta, fine tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 1,
    description:
      "A parameter that controls how long the outputs are. If < 1, the model will tend to generate shorter outputs, and > 1 will tend to generate longer outputs."
  })
  declare length_penalty: any;

  @prop({ type: "bool", default: false })
  declare log_performance_metrics: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to max_tokens. max_new_tokens only exists for backwards compatibility purposes. We recommend you use max_tokens instead. Both may not be specified."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "Maximum number of tokens to generate. A word is generally 2-3 tokens."
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "This parameter has been renamed to min_tokens. min_new_tokens only exists for backwards compatibility purposes. We recommend you use min_tokens instead. Both may not be specified."
  })
  declare min_new_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens."
  })
  declare min_tokens: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to send to the model."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default:
      "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>",
    description:
      "Template for formatting the prompt. Can be an arbitrary string, but must contain the substring '{prompt}'."
  })
  declare prompt_template: any;

  @prop({
    type: "int",
    default: -1,
    description: "Random seed. Leave blank to randomize the seed."
  })
  declare seed: any;

  @prop({
    type: "str",
    default: "<|end_of_text|>,<|eot_id|>",
    description:
      "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'."
  })
  declare stop_sequences: any;

  @prop({
    type: "str",
    default: "You are a helpful assistant",
    description:
      "System prompt to send to the model. This is prepended to the prompt and helps guide system behavior."
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 0.7,
    description:
      "Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "When decoding text, samples from the top k most likely tokens; lower to ignore less likely tokens."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const lengthPenalty = Number(this.length_penalty ?? 1);
    const logPerformanceMetrics = Boolean(
      this.log_performance_metrics ?? false
    );
    const maxNewTokens = Number(this.max_new_tokens ?? 0);
    const maxTokens = Number(this.max_tokens ?? 512);
    const minNewTokens = Number(this.min_new_tokens ?? 0);
    const minTokens = Number(this.min_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const seed = Number(this.seed ?? -1);
    const stopSequences = String(
      this.stop_sequences ?? "<|end_of_text|>,<|eot_id|>"
    );
    const systemPrompt = String(
      this.system_prompt ?? "You are a helpful assistant"
    );
    const temperature = Number(this.temperature ?? 0.7);
    const topK = Number(this.top_k ?? 0);
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      length_penalty: lengthPenalty,
      log_performance_metrics: logPerformanceMetrics,
      max_new_tokens: maxNewTokens,
      max_tokens: maxTokens,
      min_new_tokens: minNewTokens,
      min_tokens: minTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      seed: seed,
      stop_sequences: stopSequences,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/meta-llama-3-70b-instruct:fbfb20b472b2f3bdd101412a9f70a0ed4fc0ced78a77ff00970ee7a2383c575d",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Llama3_1_405B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Llama3_1_405B_Instruct";
  static readonly title = "Llama3_1_405 B_ Instruct";
  static readonly description = `Meta's flagship 405 billion parameter language model, fine-tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "The minimum number of tokens the model should generate as output."
  })
  declare min_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A template to format the prompt with. If not provided, the default prompt template will be used."
  })
  declare prompt_template: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'."
  })
  declare stop_sequences: any;

  @prop({
    type: "str",
    default: "You are a helpful assistant.",
    description:
      "System prompt to send to the model. This is prepended to the prompt and helps guide system behavior. Ignored for non-chat models."
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 0.6,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 50,
    description:
      "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 512);
    const minTokens = Number(this.min_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const stopSequences = String(this.stop_sequences ?? "");
    const systemPrompt = String(
      this.system_prompt ?? "You are a helpful assistant."
    );
    const temperature = Number(this.temperature ?? 0.6);
    const topK = Number(this.top_k ?? 50);
    const topP = Number(this.top_p ?? 0.9);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      min_tokens: minTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      stop_sequences: stopSequences,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/meta-llama-3.1-405b-instruct:6afbd4d46138efe696222131e0bf3481f21bb8956d71b81b37f866beb2fa53b7",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class LlamaGuard_3_11B_Vision extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.LlamaGuard_3_11B_Vision";
  static readonly title = "Llama Guard_3_11 B_ Vision";
  static readonly description = `A Llama-3.2-11B pretrained model, fine-tuned for content safety classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "image", default: "", description: "Image to moderate" })
  declare image: any;

  @prop({
    type: "str",
    default: "Which one should I buy?",
    description: "User message to moderate"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const prompt = String(this.prompt ?? "Which one should I buy?");

    const args: Record<string, unknown> = {
      prompt: prompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/llama-guard-3-11b-vision:21d9a2579c40ab00a401cd487c6fab3b3053ef582eb5c9ca06920c1c76bdebf1",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class LlamaGuard_3_8B extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.LlamaGuard_3_8B";
  static readonly title = "Llama Guard_3_8 B";
  static readonly description = `A Llama-3.1-8B pretrained model, fine-tuned for content safety classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Assistant response to classify"
  })
  declare assistant: any;

  @prop({
    type: "str",
    default: "I forgot how to kill a process in Linux, can you help?",
    description: "User message to moderate"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const assistant = String(this.assistant ?? "");
    const prompt = String(
      this.prompt ?? "I forgot how to kill a process in Linux, can you help?"
    );

    const args: Record<string, unknown> = {
      assistant: assistant,
      prompt: prompt
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Snowflake_Arctic_Instruct extends ReplicateNode {
  static readonly nodeType =
    "replicate.text.generate.Snowflake_Arctic_Instruct";
  static readonly title = "Snowflake_ Arctic_ Instruct";
  static readonly description = `An efficient, intelligent, and truly open-source language model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0.2,
    description: "Deprecated. This input no longer has any effect."
  })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 512,
    description:
      "The maximum number of tokens the model should generate as output. A word is generally 2-3 tokens."
  })
  declare max_new_tokens: any;

  @prop({
    type: "int",
    default: 0,
    description: "Deprecated. This input no longer has any effect."
  })
  declare min_new_tokens: any;

  @prop({
    type: "float",
    default: 1.15,
    description: "Deprecated. This input no longer has any effect."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description: "Prompt to send to the model."
  })
  declare prompt: any;

  @prop({ type: "str", default: "<|im_end|>" })
  declare stop_sequences: any;

  @prop({
    type: "str",
    default: "You are a helpful assistant.",
    description:
      "System prompt to send to the model. This is prepended to the prompt and helps guide system behavior."
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 0.6,
    description:
      "The value used to modulate the next token probabilities. Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value."
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 50,
    description: "Deprecated. This input no longer has any effect."
  })
  declare top_k: any;

  @prop({
    type: "float",
    default: 0.9,
    description:
      "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). Lower to ignore less likely tokens."
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0.2);
    const maxNewTokens = Number(this.max_new_tokens ?? 512);
    const minNewTokens = Number(this.min_new_tokens ?? 0);
    const presencePenalty = Number(this.presence_penalty ?? 1.15);
    const prompt = String(this.prompt ?? "");
    const stopSequences = String(this.stop_sequences ?? "<|im_end|>");
    const systemPrompt = String(
      this.system_prompt ?? "You are a helpful assistant."
    );
    const temperature = Number(this.temperature ?? 0.6);
    const topK = Number(this.top_k ?? 50);
    const topP = Number(this.top_p ?? 0.9);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_new_tokens: maxNewTokens,
      min_new_tokens: minNewTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      stop_sequences: stopSequences,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_k: topK,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "snowflake/snowflake-arctic-instruct:081f548e9a59c93b8355abe28ca52680c8305bc8f4a186a3de62ea41b25db8dd",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Claude_3_7_Sonnet extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Claude_3_7_Sonnet";
  static readonly title = "Claude_3_7_ Sonnet";
  static readonly description = `The most intelligent Claude model and the first hybrid reasoning model on the market (claude-3-7-sonnet-20250219)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable extended thinking mode (only supported for Sonnet 3.7 and Sonnet 4)"
  })
  declare extended_thinking: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional input image. Images are priced as (width px * height px)/750 input tokens"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money."
  })
  declare max_image_resolution: any;

  @prop({
    type: "int",
    default: 8192,
    description: "Maximum number of output tokens"
  })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "Maximum number of tokens to use for extended thinking when enabled (only supported for Sonnet 3.7 and Sonnet 4)"
  })
  declare thinking_budget_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const extendedThinking = Boolean(this.extended_thinking ?? false);
    const maxImageResolution = Number(this.max_image_resolution ?? 0.5);
    const maxTokens = Number(this.max_tokens ?? 8192);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const thinkingBudgetTokens = Number(this.thinking_budget_tokens ?? 1024);

    const args: Record<string, unknown> = {
      extended_thinking: extendedThinking,
      max_image_resolution: maxImageResolution,
      max_tokens: maxTokens,
      prompt: prompt,
      system_prompt: systemPrompt,
      thinking_budget_tokens: thinkingBudgetTokens
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anthropic/claude-3.7-sonnet:81a891bd00c339f3565bda15b255b372eb8bf6c669fe996b66eea5d677454a46",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_R1 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Deepseek_R1";
  static readonly title = "Deepseek_ R1";
  static readonly description = `A reasoning model trained with reinforcement learning, on par with OpenAI o1
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 2048);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "deepseek-ai/deepseek-r1:f5c66b7abc414e3ade1096d6b49670870a832a23c136bc8b77ca29438fe28eb7",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Structured extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_5_Structured";
  static readonly title = "G P T_5_ Structured";
  static readonly description = `GPT-5 with support for structured outputs, web search and custom tools
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description: "Allow GPT-5 to use web search for the response."
  })
  declare enable_web_search: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      "A list of one or many input items to the model, containing different content types. This parameter corresponds with the 'input' OpenAI API parameter. For more details see: https://platform.openai.com/docs/api-reference/responses/create#responses_create-input. Similar to the 'messages' parameter, but with more flexibility in the content types."
  })
  declare input_item_list: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A system (or developer) message inserted into the model's context. When using along with previous_response_id, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses."
  })
  declare instructions: any;

  @prop({
    type: "dict[str, any]",
    default: "",
    description:
      "A JSON schema that the response must conform to. For simple data structures we recommend using 'simple_text_format_schema' which will be converted to a JSON schema for you."
  })
  declare json_schema: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare max_output_tokens: any;

  @prop({
    type: "enum",
    default: "gpt-5",
    values: ["gpt-5", "gpt-5-mini", "gpt-5-nano"],
    description: "GPT-5 model to use."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description: "The ID of a previous response to continue from."
  })
  declare previous_response_id: any;

  @prop({
    type: "str",
    default: "",
    description:
      "A simple text input to the model, equivalent to a text input with the user role. Ignored if input_item_list is provided."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "minimal",
    values: ["minimal", "low", "medium", "high"],
    description:
      "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare reasoning_effort: any;

  @prop({
    type: "list[str]",
    default: [],
    description:
      "Create a JSON schema for the output to conform to. The schema will be created from a simple list of field specifications. Strings: 'thing' (defaults to string), 'thing:str', 'thing:string'. Booleans: 'is_a_thing:bool' or 'is_a_thing:boolean'. Numbers: 'count:number', 'count:int'. Lists: 'things:list' (defaults to list of strings), 'things:list:str', 'number_things:list:number', etc. Nested objects are not supported, use 'json_schema' instead."
  })
  declare simple_schema: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      "Tools to make available to the model. Should be a JSON object containing a list of tool definitions."
  })
  declare tools: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive."
  })
  declare verbosity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const enableWebSearch = Boolean(this.enable_web_search ?? false);
    const inputItemList = String(this.input_item_list ?? []);
    const instructions = String(this.instructions ?? "");
    const jsonSchema = String(this.json_schema ?? "");
    const maxOutputTokens = Number(this.max_output_tokens ?? 0);
    const model = String(this.model ?? "gpt-5");
    const previousResponseId = String(this.previous_response_id ?? "");
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "minimal");
    const simpleSchema = String(this.simple_schema ?? []);
    const tools = String(this.tools ?? []);
    const verbosity = String(this.verbosity ?? "medium");

    const args: Record<string, unknown> = {
      enable_web_search: enableWebSearch,
      input_item_list: inputItemList,
      instructions: instructions,
      json_schema: jsonSchema,
      max_output_tokens: maxOutputTokens,
      model: model,
      previous_response_id: previousResponseId,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      simple_schema: simpleSchema,
      tools: tools,
      verbosity: verbosity
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-5-structured:9f4cd9ec1133f55d442aeb426e42df5180a56e79a33183623611d62d4c3b44ae",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_5 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_5";
  static readonly title = "G P T_5";
  static readonly description = `OpenAI's new model excelling at coding, writing, and reasoning.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "minimal",
    values: ["minimal", "low", "medium", "high"],
    description:
      "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive."
  })
  declare verbosity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 0);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "minimal");
    const systemPrompt = String(this.system_prompt ?? "");
    const verbosity = String(this.verbosity ?? "medium");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt,
      verbosity: verbosity
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-5:feacd077889bbeea463bb0314810093c23b2e1b49af8ca6f82975f8c36a2ebd0",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_5_Mini";
  static readonly title = "G P T_5_ Mini";
  static readonly description = `Faster version of OpenAI's flagship GPT-5 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "minimal",
    values: ["minimal", "low", "medium", "high"],
    description:
      "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive."
  })
  declare verbosity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 0);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "minimal");
    const systemPrompt = String(this.system_prompt ?? "");
    const verbosity = String(this.verbosity ?? "medium");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt,
      verbosity: verbosity
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-5-mini:8fd5dbfbc0f88570a4ba7f9d529aa02b10ca1f92d77c4ada0a56e549ffda0bae",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Nano extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_5_Nano";
  static readonly title = "G P T_5_ Nano";
  static readonly description = `Fastest, most cost-effective GPT-5 model from OpenAI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "minimal",
    values: ["minimal", "low", "medium", "high"],
    description:
      "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive."
  })
  declare verbosity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 0);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "minimal");
    const systemPrompt = String(this.system_prompt ?? "");
    const verbosity = String(this.verbosity ?? "medium");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt,
      verbosity: verbosity
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-5-nano:034fc01c1d162ba028187fc496eb079e6c1329c1c8f686d971eba9d01e7ffb96",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_4_1";
  static readonly title = "G P T_4_1";
  static readonly description = `OpenAI's Flagship GPT model for complex tasks.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "Frequency penalty parameter - positive values penalize the repetition of tokens."
  })
  declare frequency_penalty: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      presence_penalty: presencePenalty,
      prompt: prompt,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_p: topP
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4.1:f7e65222875892b7893e5c7581bdde9056c78cd77171a315c369b63b8907a619",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_4_1_Mini";
  static readonly title = "G P T_4_1_ Mini";
  static readonly description = `Fast, affordable version of GPT-4.1
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "Frequency penalty parameter - positive values penalize the repetition of tokens."
  })
  declare frequency_penalty: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      presence_penalty: presencePenalty,
      prompt: prompt,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_p: topP
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4.1-mini:aca77ca43d7155cf9480ea2f697adf1c9c008ab5a471050cedb90dadfb5dc4cc",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1_Nano extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_4_1_Nano";
  static readonly title = "G P T_4_1_ Nano";
  static readonly description = `Fastest, most cost-effective GPT-4.1 model from OpenAI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "Frequency penalty parameter - positive values penalize the repetition of tokens."
  })
  declare frequency_penalty: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      presence_penalty: presencePenalty,
      prompt: prompt,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_p: topP
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4.1-nano:756e9851b24d755bc245572b53d1f40121719eed75663c38ea6628202720a54b",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_V3_1 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Deepseek_V3_1";
  static readonly title = "Deepseek_ V3_1";
  static readonly description = `Latest hybrid thinking model from Deepseek
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "Why are you better than Deepseek v3?",
    description: "Prompt"
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "None",
    values: ["medium", "None"],
    description:
      "Reasoning effort level for DeepSeek models. Use 'medium' for enhanced reasoning or leave as None for default behavior."
  })
  declare thinking: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(
      this.prompt ?? "Why are you better than Deepseek v3?"
    );
    const temperature = Number(this.temperature ?? 0.1);
    const thinking = String(this.thinking ?? "None");
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      thinking: thinking,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "deepseek-ai/deepseek-v3.1:f257f380598d0760ba84e7d4b02532d3a45b03ede80096f516e81d68b375aff3",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Gemini_3_1_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Gemini_3_1_Pro";
  static readonly title = "Gemini_3_1_ Pro";
  static readonly description = `Google's most intelligent model, with improved reasoning and a new medium thinking level
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Input audio to send with the prompt (max 1 audio file, up to 8.4 hours)"
  })
  declare audio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input images to send with the prompt (max 10 images, each up to 7MB)"
  })
  declare images: any;

  @prop({
    type: "int",
    default: 65535,
    description: "Maximum number of tokens to generate"
  })
  declare max_output_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to send to the model"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System instruction to guide the model's behavior"
  })
  declare system_instruction: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "high",
    values: ["low", "medium", "high"],
    description:
      "Thinking level for reasoning. Controls the maximum depth of the model's internal reasoning process."
  })
  declare thinking_level: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass"
  })
  declare top_p: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "Input videos to send with the prompt (max 10 videos, each up to 45 minutes)"
  })
  declare videos: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxOutputTokens = Number(this.max_output_tokens ?? 65535);
    const prompt = String(this.prompt ?? "");
    const systemInstruction = String(this.system_instruction ?? "");
    const temperature = Number(this.temperature ?? 1);
    const thinkingLevel = String(this.thinking_level ?? "high");
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      max_output_tokens: maxOutputTokens,
      prompt: prompt,
      system_instruction: systemInstruction,
      temperature: temperature,
      thinking_level: thinkingLevel,
      top_p: topP
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }

    const videosRef = this.videos as Record<string, unknown> | undefined;
    if (isRefSet(videosRef)) {
      const videosUrl = await assetToUrl(videosRef!, apiKey);
      if (videosUrl) args["videos"] = videosUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/gemini-3.1-pro:68423ca56f33c1a05b4e763003d73aee779cb07f0e20903bcc956c1bacc655b6",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Gemini_2_5_Flash extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Gemini_2_5_Flash";
  static readonly title = "Gemini_2_5_ Flash";
  static readonly description = `Google’s hybrid “thinking” AI model optimized for speed and cost-efficiency
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Enable dynamic thinking - the model will adjust the thinking budget based on the complexity of the request (overrides thinking_budget parameter)"
  })
  declare dynamic_thinking: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input images to send with the prompt (max 10 images, each up to 7MB)"
  })
  declare images: any;

  @prop({
    type: "int",
    default: 65535,
    description: "Maximum number of tokens to generate"
  })
  declare max_output_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to send to the model"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System instruction to guide the model's behavior"
  })
  declare system_instruction: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Thinking budget for reasoning (0 to disable thinking, higher values allow more reasoning)"
  })
  declare thinking_budget: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass"
  })
  declare top_p: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "Input videos to send with the prompt (max 10 videos, each up to 45 minutes)"
  })
  declare videos: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const dynamicThinking = Boolean(this.dynamic_thinking ?? false);
    const maxOutputTokens = Number(this.max_output_tokens ?? 65535);
    const prompt = String(this.prompt ?? "");
    const systemInstruction = String(this.system_instruction ?? "");
    const temperature = Number(this.temperature ?? 1);
    const thinkingBudget = Number(this.thinking_budget ?? 0);
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      dynamic_thinking: dynamicThinking,
      max_output_tokens: maxOutputTokens,
      prompt: prompt,
      system_instruction: systemInstruction,
      temperature: temperature,
      thinking_budget: thinkingBudget,
      top_p: topP
    };

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }

    const videosRef = this.videos as Record<string, unknown> | undefined;
    if (isRefSet(videosRef)) {
      const videosUrl = await assetToUrl(videosRef!, apiKey);
      if (videosUrl) args["videos"] = videosUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/gemini-2.5-flash:6585308f2652e91c80134f0e070d01bd66107b68590f50ff601860ea6902e813",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Gemini_3_Pro extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Gemini_3_Pro";
  static readonly title = "Gemini_3_ Pro";
  static readonly description = `Google's most advanced reasoning Gemini model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "audio",
    default: "",
    description:
      "Input audio to send with the prompt (max 1 audio file, up to 8.4 hours)"
  })
  declare audio: any;

  @prop({
    type: "list[image]",
    default: [],
    description:
      "Input images to send with the prompt (max 10 images, each up to 7MB)"
  })
  declare images: any;

  @prop({
    type: "int",
    default: 65535,
    description: "Maximum number of tokens to generate"
  })
  declare max_output_tokens: any;

  @prop({
    type: "str",
    default: "",
    description: "The text prompt to send to the model"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System instruction to guide the model's behavior"
  })
  declare system_instruction: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "enum",
    default: "",
    values: ["low", "high"],
    description:
      "Thinking level for reasoning (low or high). Replaces thinking_budget for Gemini 3 models."
  })
  declare thinking_level: any;

  @prop({
    type: "float",
    default: 0.95,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass"
  })
  declare top_p: any;

  @prop({
    type: "list[video]",
    default: [],
    description:
      "Input videos to send with the prompt (max 10 videos, each up to 45 minutes)"
  })
  declare videos: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxOutputTokens = Number(this.max_output_tokens ?? 65535);
    const prompt = String(this.prompt ?? "");
    const systemInstruction = String(this.system_instruction ?? "");
    const temperature = Number(this.temperature ?? 1);
    const thinkingLevel = String(this.thinking_level ?? "");
    const topP = Number(this.top_p ?? 0.95);

    const args: Record<string, unknown> = {
      max_output_tokens: maxOutputTokens,
      prompt: prompt,
      system_instruction: systemInstruction,
      temperature: temperature,
      thinking_level: thinkingLevel,
      top_p: topP
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToUrl(audioRef!, apiKey);
      if (audioUrl) args["audio"] = audioUrl;
    }

    const imagesRef = this.images as Record<string, unknown> | undefined;
    if (isRefSet(imagesRef)) {
      const imagesUrl = await assetToUrl(imagesRef!, apiKey);
      if (imagesUrl) args["images"] = imagesUrl;
    }

    const videosRef = this.videos as Record<string, unknown> | undefined;
    if (isRefSet(videosRef)) {
      const videosUrl = await assetToUrl(videosRef!, apiKey);
      if (videosUrl) args["videos"] = videosUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "google/gemini-3-pro:6c727b6aa9d5663b515ff4d6d36520213d9991d5078adeafce44e6e49ed6f6ac",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Claude_Opus_4_6 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Claude_Opus_4_6";
  static readonly title = "Claude_ Opus_4_6";
  static readonly description = `Anthropic's most intelligent model with state-of-the-art coding, reasoning, and agentic capabilities
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Optional input image. Images are priced as (width px * height px)/750 input tokens"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money."
  })
  declare max_image_resolution: any;

  @prop({
    type: "int",
    default: 8192,
    description: "Maximum number of output tokens"
  })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxImageResolution = Number(this.max_image_resolution ?? 0.5);
    const maxTokens = Number(this.max_tokens ?? 8192);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      max_image_resolution: maxImageResolution,
      max_tokens: maxTokens,
      prompt: prompt,
      system_prompt: systemPrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anthropic/claude-opus-4.6:5a2f72c8a00f561d217e4b5d1f1f96727d6a86a73b6caf444545d67b26bdca46",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Claude_4_5_Sonnet extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Claude_4_5_Sonnet";
  static readonly title = "Claude_4_5_ Sonnet";
  static readonly description = `Claude Sonnet 4.5 is the best coding model to date, with significant improvements across the entire development lifecycle
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Optional input image. Images are priced as (width px * height px)/750 input tokens"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money."
  })
  declare max_image_resolution: any;

  @prop({
    type: "int",
    default: 8192,
    description: "Maximum number of output tokens"
  })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxImageResolution = Number(this.max_image_resolution ?? 0.5);
    const maxTokens = Number(this.max_tokens ?? 8192);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      max_image_resolution: maxImageResolution,
      max_tokens: maxTokens,
      prompt: prompt,
      system_prompt: systemPrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anthropic/claude-4.5-sonnet:459655107e29a683cb6deb73a9640cf9aeae39ea7c87803a2ae81c311f6ef44f",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Claude_4_5_Haiku extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Claude_4_5_Haiku";
  static readonly title = "Claude_4_5_ Haiku";
  static readonly description = `Claude Haiku 4.5 gives you similar levels of coding performance but at one-third the cost and more than twice the speed
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "image",
    default: "",
    description:
      "Optional input image. Images are priced as (width px * height px)/750 input tokens"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money."
  })
  declare max_image_resolution: any;

  @prop({
    type: "int",
    default: 8192,
    description: "Maximum number of output tokens"
  })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxImageResolution = Number(this.max_image_resolution ?? 0.5);
    const maxTokens = Number(this.max_tokens ?? 8192);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      max_image_resolution: maxImageResolution,
      max_tokens: maxTokens,
      prompt: prompt,
      system_prompt: systemPrompt
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anthropic/claude-4.5-haiku:1ad171f62532e2099a3ed7d8d80327911f5f8d332e83cf4c8959da0be9a8bf3e",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Claude_4_Sonnet extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Claude_4_Sonnet";
  static readonly title = "Claude_4_ Sonnet";
  static readonly description = `Claude Sonnet 4 is a significant upgrade to 3.7, delivering superior coding and reasoning while responding more precisely to your instructions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "bool",
    default: false,
    description:
      "Whether to enable extended thinking mode (only supported for Sonnet 3.7 and Sonnet 4)"
  })
  declare extended_thinking: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Optional input image. Images are priced as (width px * height px)/750 input tokens"
  })
  declare image: any;

  @prop({
    type: "float",
    default: 0.5,
    description:
      "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money."
  })
  declare max_image_resolution: any;

  @prop({
    type: "int",
    default: 8192,
    description: "Maximum number of output tokens"
  })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "Maximum number of tokens to use for extended thinking when enabled (only supported for Sonnet 3.7 and Sonnet 4)"
  })
  declare thinking_budget_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const extendedThinking = Boolean(this.extended_thinking ?? false);
    const maxImageResolution = Number(this.max_image_resolution ?? 0.5);
    const maxTokens = Number(this.max_tokens ?? 8192);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const thinkingBudgetTokens = Number(this.thinking_budget_tokens ?? 1024);

    const args: Record<string, unknown> = {
      extended_thinking: extendedThinking,
      max_image_resolution: maxImageResolution,
      max_tokens: maxTokens,
      prompt: prompt,
      system_prompt: systemPrompt,
      thinking_budget_tokens: thinkingBudgetTokens
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "anthropic/claude-4-sonnet:3380fe4ca9cac053c89d1df86a5ba850e61cbef1d474a24abded9516e5a73a04",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_2 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_5_2";
  static readonly title = "G P T_5_2";
  static readonly description = `The best model for coding and agentic tasks across industries
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 0,
    description:
      "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)."
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "low",
    values: ["none", "low", "medium", "high", "xhigh"],
    description:
      "Constrains effort on reasoning for GPT-5.2 models. Supported values are none, low, medium, high, and xhigh."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive."
  })
  declare verbosity: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 0);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "low");
    const systemPrompt = String(this.system_prompt ?? "");
    const verbosity = String(this.verbosity ?? "medium");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt,
      verbosity: verbosity
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-5.2:e805d0794e42cc941a20b67ef7e57e432a7e4abdd36d61dbc6c842e911a75ec4",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class O4_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.O4_Mini";
  static readonly title = "O4_ Mini";
  static readonly description = `OpenAI's fast, lightweight reasoning model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains effort on reasoning for reasoning models. Currently supported values are low, medium, and high. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "medium");
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/o4-mini:04ce1dc5eea6a7dd3ef53f69c65f7933bd70ce76dedda7e9fbb8cdf316214cf7",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class O1 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.O1";
  static readonly title = "O1";
  static readonly description = `OpenAI's first o-series reasoning model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "medium",
    values: ["low", "medium", "high"],
    description:
      "Constrains effort on reasoning for reasoning models. Currently supported values are low, medium, and high. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response."
  })
  declare reasoning_effort: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const prompt = String(this.prompt ?? "");
    const reasoningEffort = String(this.reasoning_effort ?? "medium");
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      prompt: prompt,
      reasoning_effort: reasoningEffort,
      system_prompt: systemPrompt
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/o1:729043ff117dccc608d5b114e55ffed41bc849f4d85f9e61cc164d8ddde781df",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_4o extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_4o";
  static readonly title = "G P T_4o";
  static readonly description = `OpenAI's high-intelligence chat model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "Frequency penalty parameter - positive values penalize the repetition of tokens."
  })
  declare frequency_penalty: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      presence_penalty: presencePenalty,
      prompt: prompt,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_p: topP
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4o:42f4eb858641c70ce390c381605f5aed04eeb37554d299459429e14a33f88933",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class GPT_4o_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.GPT_4o_Mini";
  static readonly title = "G P T_4o_ Mini";
  static readonly description = `Low latency, low cost version of OpenAI's GPT-4o model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "float",
    default: 0,
    description:
      "Frequency penalty parameter - positive values penalize the repetition of tokens."
  })
  declare frequency_penalty: any;

  @prop({
    type: "list[image]",
    default: [],
    description: "List of images to send to the model"
  })
  declare image_input: any;

  @prop({
    type: "int",
    default: 4096,
    description: "Maximum number of completion tokens to generate"
  })
  declare max_completion_tokens: any;

  @prop({
    type: "list[dict[str, any]]",
    default: [],
    description:
      'A JSON string representing a list of messages. For example: [{"role": "user", "content": "Hello, how are you?"}]. If provided, prompt and system_prompt are ignored.'
  })
  declare messages: any;

  @prop({
    type: "float",
    default: 0,
    description:
      "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics."
  })
  declare presence_penalty: any;

  @prop({
    type: "str",
    default: "",
    description:
      "The prompt to send to the model. Do not use if using messages."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to set the assistant's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 1,
    description: "Sampling temperature between 0 and 2"
  })
  declare temperature: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)"
  })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);
    const messages = String(this.messages ?? []);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_completion_tokens: maxCompletionTokens,
      messages: messages,
      presence_penalty: presencePenalty,
      prompt: prompt,
      system_prompt: systemPrompt,
      temperature: temperature,
      top_p: topP
    };

    const imageInputRef = this.image_input as
      | Record<string, unknown>
      | undefined;
    if (isRefSet(imageInputRef)) {
      const imageInputUrl = await assetToUrl(imageInputRef!, apiKey);
      if (imageInputUrl) args["image_input"] = imageInputUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "openai/gpt-4o-mini:86d7f12d34e3f9b6e149231f42154d0f41081d91484932e3f1ee608fc207f7d9",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Grok_4 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Grok_4";
  static readonly title = "Grok_4";
  static readonly description = `Grok 4 is xAI’s most advanced reasoning model. Excels at logical thinking and in-depth analysis. Ideal for insightful discussions and complex problem-solving.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 2048);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "xai/grok-4:56f17471947d6bed7b61ef0e0c4e796db2aa8276a6f534a06a1a0c1955fb0f01",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_V3 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Deepseek_V3";
  static readonly title = "Deepseek_ V3";
  static readonly description = `DeepSeek-V3-0324 is the leading non-reasoning model, a milestone for open source
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 2048,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 2048);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "deepseek-ai/deepseek-v3:b65d70e71acdaa2c26b32eb763b0b691eae862f3f9c34a5e5c2167565b2caff1",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Qwen3_235B extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Qwen3_235B";
  static readonly title = "Qwen3_235 B";
  static readonly description = `Updated Qwen3 model for instruction following
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "int",
    default: 1024,
    description:
      "The maximum number of tokens the model should generate as output."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0.1,
    description: "The value used to modulate the next token probabilities."
  })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "qwen/qwen3-235b-a22b-instruct-2507:a96f2c4d13a1fa8462bf365d1778e0e1d77ef99fbddad0f90ff5b9b90691b66c",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export class Kimi_K2_5 extends ReplicateNode {
  static readonly nodeType = "replicate.text.generate.Kimi_K2_5";
  static readonly title = "Kimi_ K2_5";
  static readonly description = `Moonshot AI's latest open model. It unifies vision and text, thinking and non-thinking modes, and single-agent and multi-agent execution into one model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  @prop({
    type: "image",
    default: "",
    description:
      "Image file to analyze (optional). Will be resized if larger than 1024px."
  })
  declare image: any;

  @prop({
    type: "int",
    default: 1024,
    description: "Maximum number of tokens to generate."
  })
  declare max_tokens: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "str", default: "", description: "Text prompt" })
  declare prompt: any;

  @prop({ type: "float", default: 0.1, description: "Sampling temperature." })
  declare temperature: any;

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const frequencyPenalty = Number(this.frequency_penalty ?? 0);
    const maxTokens = Number(this.max_tokens ?? 1024);
    const presencePenalty = Number(this.presence_penalty ?? 0);
    const prompt = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0.1);
    const topP = Number(this.top_p ?? 1);

    const args: Record<string, unknown> = {
      frequency_penalty: frequencyPenalty,
      max_tokens: maxTokens,
      presence_penalty: presencePenalty,
      prompt: prompt,
      temperature: temperature,
      top_p: topP
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl = await assetToUrl(imageRef!, apiKey);
      if (imageUrl) args["image"] = imageUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "moonshotai/kimi-k2.5:b4d8427a98a2de294f719d281c5218daebd44895b308ace34792d0746f6670ba",
      args
    );
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_TEXT_GENERATE_NODES: readonly NodeClass[] = [
  Llama3_8B,
  Llama3_8B_Instruct,
  Llama3_70B,
  Llama3_70B_Instruct,
  Llama3_1_405B_Instruct,
  LlamaGuard_3_11B_Vision,
  LlamaGuard_3_8B,
  Snowflake_Arctic_Instruct,
  Claude_3_7_Sonnet,
  Deepseek_R1,
  GPT_5_Structured,
  GPT_5,
  GPT_5_Mini,
  GPT_5_Nano,
  GPT_4_1,
  GPT_4_1_Mini,
  GPT_4_1_Nano,
  Deepseek_V3_1,
  Gemini_3_1_Pro,
  Gemini_2_5_Flash,
  Gemini_3_Pro,
  Claude_Opus_4_6,
  Claude_4_5_Sonnet,
  Claude_4_5_Haiku,
  Claude_4_Sonnet,
  GPT_5_2,
  O4_Mini,
  O1,
  GPT_4o,
  GPT_4o_Mini,
  Grok_4,
  Deepseek_V3,
  Qwen3_235B,
  Kimi_K2_5
] as const;
