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
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class Claude_3_7_Sonnet extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Claude_3_7_Sonnet";
  static readonly title = "Claude_3_7_ Sonnet";
  static readonly description = `The most intelligent Claude model and the first hybrid reasoning model on the market (claude-3-7-sonnet-20250219)
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Optional input image. Images are priced as (width px * height px)/750 input tokens" })
  declare image: any;

  @prop({ type: "str", default: "", description: "Input prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 8192, description: "Maximum number of output tokens" })
  declare max_tokens: any;

  @prop({ type: "str", default: "", description: "System prompt" })
  declare system_prompt: any;

  @prop({ type: "float", default: 0.5, description: "Maximum image resolution in megapixels. Scales down image before sending it to Claude, to save time and money." })
  declare max_image_resolution: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 8192);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const maxImageResolution = Number(inputs.max_image_resolution ?? this.max_image_resolution ?? 0.5);

    const args: Record<string, unknown> = {
      "image": image,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "system_prompt": systemPrompt,
      "max_image_resolution": maxImageResolution,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "anthropic/claude-3.7-sonnet", args);
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_R1 extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Deepseek_R1";
  static readonly title = "Deepseek_ R1";
  static readonly description = `A reasoning model trained with reinforcement learning, on par with OpenAI o1
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 2048, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.1, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 2048);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.1);
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "deepseek-ai/deepseek-r1", args);
    return { output: outputToString(res.output) };
  }
}

export class Deepseek_V3_1 extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Deepseek_V3_1";
  static readonly title = "Deepseek_ V3_1";
  static readonly description = `Latest hybrid thinking model from Deepseek
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "Top-p (nucleus) sampling" })
  declare top_p: any;

  @prop({ type: "str", default: "Why are you better than Deepseek v3?", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "enum", default: "None", values: ["medium", "None"], description: "Reasoning effort level for DeepSeek models. Use 'medium' for enhanced reasoning or leave as None for default behavior." })
  declare thinking: any;

  @prop({ type: "int", default: 1024, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "float", default: 0.1, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "Why are you better than Deepseek v3?");
    const thinking = String(inputs.thinking ?? this.thinking ?? "None");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 1024);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.1);
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "thinking": thinking,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "deepseek-ai/deepseek-v3.1", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1 extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_4_1";
  static readonly title = "G P T_4_1";
  static readonly description = `OpenAI's Flagship GPT model for complex tasks.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)" })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "float", default: 1, description: "Sampling temperature between 0 and 2" })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "float", default: 0, description: "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics." })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty parameter - positive values penalize the repetition of tokens." })
  declare frequency_penalty: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of completion tokens to generate" })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 1);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? 4096);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "messages": messages,
      "image_input": imageInput,
      "temperature": temperature,
      "system_prompt": systemPrompt,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-4.1", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_4_1_Mini";
  static readonly title = "G P T_4_1_ Mini";
  static readonly description = `Fast, affordable version of GPT-4.1
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)" })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "float", default: 1, description: "Sampling temperature between 0 and 2" })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "float", default: 0, description: "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics." })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty parameter - positive values penalize the repetition of tokens." })
  declare frequency_penalty: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of completion tokens to generate" })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 1);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? 4096);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "messages": messages,
      "image_input": imageInput,
      "temperature": temperature,
      "system_prompt": systemPrompt,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-4.1-mini", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_4_1_Nano extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_4_1_Nano";
  static readonly title = "G P T_4_1_ Nano";
  static readonly description = `Fastest, most cost-effective GPT-4.1 model from OpenAI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "float", default: 1, description: "Nucleus sampling parameter - the model considers the results of the tokens with top_p probability mass. (0.1 means only the tokens comprising the top 10% probability mass are considered.)" })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "float", default: 1, description: "Sampling temperature between 0 and 2" })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "float", default: 0, description: "Presence penalty parameter - positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics." })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty parameter - positive values penalize the repetition of tokens." })
  declare frequency_penalty: any;

  @prop({ type: "int", default: 4096, description: "Maximum number of completion tokens to generate" })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topP = Number(inputs.top_p ?? this.top_p ?? 1);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 1);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? 4096);

    const args: Record<string, unknown> = {
      "top_p": topP,
      "prompt": prompt,
      "messages": messages,
      "image_input": imageInput,
      "temperature": temperature,
      "system_prompt": systemPrompt,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-4.1-nano", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_5 extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_5";
  static readonly title = "G P T_5";
  static readonly description = `OpenAI's new model excelling at coding, writing, and reasoning.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "enum", default: "medium", values: ["low", "medium", "high"], description: "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive." })
  declare verbosity: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "enum", default: "minimal", values: ["minimal", "low", "medium", "high"], description: "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare reasoning_effort: any;

  @prop({ type: "int", default: "", description: "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const verbosity = String(inputs.verbosity ?? this.verbosity ?? "medium");
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const reasoningEffort = String(inputs.reasoning_effort ?? this.reasoning_effort ?? "minimal");
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "messages": messages,
      "verbosity": verbosity,
      "image_input": imageInput,
      "system_prompt": systemPrompt,
      "reasoning_effort": reasoningEffort,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-5", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Mini extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_5_Mini";
  static readonly title = "G P T_5_ Mini";
  static readonly description = `Faster version of OpenAI's flagship GPT-5 model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "enum", default: "medium", values: ["low", "medium", "high"], description: "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive." })
  declare verbosity: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "enum", default: "minimal", values: ["minimal", "low", "medium", "high"], description: "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare reasoning_effort: any;

  @prop({ type: "int", default: "", description: "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const verbosity = String(inputs.verbosity ?? this.verbosity ?? "medium");
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const reasoningEffort = String(inputs.reasoning_effort ?? this.reasoning_effort ?? "minimal");
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "messages": messages,
      "verbosity": verbosity,
      "image_input": imageInput,
      "system_prompt": systemPrompt,
      "reasoning_effort": reasoningEffort,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-5-mini", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Nano extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_5_Nano";
  static readonly title = "G P T_5_ Nano";
  static readonly description = `Fastest, most cost-effective GPT-5 model from OpenAI
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "The prompt to send to the model. Do not use if using messages." })
  declare prompt: any;

  @prop({ type: "any", default: [], description: "A JSON string representing a list of messages. For example: [{\"role\": \"user\", \"content\": \"Hello, how are you?\"}]. If provided, prompt and system_prompt are ignored." })
  declare messages: any;

  @prop({ type: "enum", default: "medium", values: ["low", "medium", "high"], description: "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive." })
  declare verbosity: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "str", default: "", description: "System prompt to set the assistant's behavior" })
  declare system_prompt: any;

  @prop({ type: "enum", default: "minimal", values: ["minimal", "low", "medium", "high"], description: "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare reasoning_effort: any;

  @prop({ type: "int", default: "", description: "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare max_completion_tokens: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const messages = String(inputs.messages ?? this.messages ?? []);
    const verbosity = String(inputs.verbosity ?? this.verbosity ?? "medium");
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "");
    const reasoningEffort = String(inputs.reasoning_effort ?? this.reasoning_effort ?? "minimal");
    const maxCompletionTokens = Number(inputs.max_completion_tokens ?? this.max_completion_tokens ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "messages": messages,
      "verbosity": verbosity,
      "image_input": imageInput,
      "system_prompt": systemPrompt,
      "reasoning_effort": reasoningEffort,
      "max_completion_tokens": maxCompletionTokens,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-5-nano", args);
    return { output: outputToString(res.output) };
  }
}

export class GPT_5_Structured extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.GPT_5_Structured";
  static readonly title = "G P T_5_ Structured";
  static readonly description = `GPT-5 with support for structured outputs, web search and custom tools
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "enum", default: "gpt-5", values: ["gpt-5", "gpt-5-mini", "gpt-5-nano"], description: "GPT-5 model to use." })
  declare model: any;

  @prop({ type: "any", default: [], description: "Tools to make available to the model. Should be a JSON object containing a list of tool definitions." })
  declare tools: any;

  @prop({ type: "str", default: "", description: "A simple text input to the model, equivalent to a text input with the user role. Ignored if input_item_list is provided." })
  declare prompt: any;

  @prop({ type: "enum", default: "medium", values: ["low", "medium", "high"], description: "Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses. Currently supported values are low, medium, and high. GPT-5 supports this parameter to help control whether answers are short and to the point or long and comprehensive." })
  declare verbosity: any;

  @prop({ type: "any", default: [], description: "List of images to send to the model" })
  declare image_input: any;

  @prop({ type: "any", default: "", description: "A JSON schema that the response must conform to. For simple data structures we recommend using 'simple_text_format_schema' which will be converted to a JSON schema for you." })
  declare json_schema: any;

  @prop({ type: "str", default: "", description: "A system (or developer) message inserted into the model's context. When using along with previous_response_id, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses." })
  declare instructions: any;

  @prop({ type: "any", default: [], description: "Create a JSON schema for the output to conform to. The schema will be created from a simple list of field specifications. Strings: 'thing' (defaults to string), 'thing:str', 'thing:string'. Booleans: 'is_a_thing:bool' or 'is_a_thing:boolean'. Numbers: 'count:number', 'count:int'. Lists: 'things:list' (defaults to list of strings), 'things:list:str', 'number_things:list:number', etc. Nested objects are not supported, use 'json_schema' instead." })
  declare simple_schema: any;

  @prop({ type: "any", default: [], description: "A list of one or many input items to the model, containing different content types. This parameter corresponds with the 'input' OpenAI API parameter. For more details see: https://platform.openai.com/docs/api-reference/responses/create#responses_create-input. Similar to the 'messages' parameter, but with more flexibility in the content types." })
  declare input_item_list: any;

  @prop({ type: "enum", default: "minimal", values: ["minimal", "low", "medium", "high"], description: "Constrains effort on reasoning for GPT-5 models. Currently supported values are minimal, low, medium, and high. The minimal value gets answers back faster without extensive reasoning first. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare reasoning_effort: any;

  @prop({ type: "bool", default: false, description: "Allow GPT-5 to use web search for the response." })
  declare enable_web_search: any;

  @prop({ type: "int", default: "", description: "Maximum number of completion tokens to generate. For higher reasoning efforts you may need to increase your max_completion_tokens to avoid empty responses (where all the tokens are used on reasoning)." })
  declare max_output_tokens: any;

  @prop({ type: "str", default: "", description: "The ID of a previous response to continue from." })
  declare previous_response_id: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const model = String(inputs.model ?? this.model ?? "gpt-5");
    const tools = String(inputs.tools ?? this.tools ?? []);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const verbosity = String(inputs.verbosity ?? this.verbosity ?? "medium");
    const imageInput = String(inputs.image_input ?? this.image_input ?? []);
    const jsonSchema = String(inputs.json_schema ?? this.json_schema ?? "");
    const instructions = String(inputs.instructions ?? this.instructions ?? "");
    const simpleSchema = String(inputs.simple_schema ?? this.simple_schema ?? []);
    const inputItemList = String(inputs.input_item_list ?? this.input_item_list ?? []);
    const reasoningEffort = String(inputs.reasoning_effort ?? this.reasoning_effort ?? "minimal");
    const enableWebSearch = Boolean(inputs.enable_web_search ?? this.enable_web_search ?? false);
    const maxOutputTokens = Number(inputs.max_output_tokens ?? this.max_output_tokens ?? "");
    const previousResponseId = String(inputs.previous_response_id ?? this.previous_response_id ?? "");

    const args: Record<string, unknown> = {
      "model": model,
      "tools": tools,
      "prompt": prompt,
      "verbosity": verbosity,
      "image_input": imageInput,
      "json_schema": jsonSchema,
      "instructions": instructions,
      "simple_schema": simpleSchema,
      "input_item_list": inputItemList,
      "reasoning_effort": reasoningEffort,
      "enable_web_search": enableWebSearch,
      "max_output_tokens": maxOutputTokens,
      "previous_response_id": previousResponseId,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "openai/gpt-5-structured", args);
    return { output: outputToString(res.output) };
  }
}

export class Llama3_1_405B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Llama3_1_405B_Instruct";
  static readonly title = "Llama3_1_405 B_ Instruct";
  static readonly description = `Meta's flagship 405 billion parameter language model, fine-tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 50, description: "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)." })
  declare top_k: any;

  @prop({ type: "float", default: 0.9, description: "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 512, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "int", default: 0, description: "The minimum number of tokens the model should generate as output." })
  declare min_tokens: any;

  @prop({ type: "float", default: 0.6, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "str", default: "You are a helpful assistant.", description: "System prompt to send to the model. This is prepended to the prompt and helps guide system behavior. Ignored for non-chat models." })
  declare system_prompt: any;

  @prop({ type: "str", default: "", description: "A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'." })
  declare stop_sequences: any;

  @prop({ type: "str", default: "", description: "A template to format the prompt with. If not provided, the default prompt template will be used." })
  declare prompt_template: any;

  @prop({ type: "float", default: 0, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topK = Number(inputs.top_k ?? this.top_k ?? 50);
    const topP = Number(inputs.top_p ?? this.top_p ?? 0.9);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 512);
    const minTokens = Number(inputs.min_tokens ?? this.min_tokens ?? 0);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.6);
    const systemPrompt = String(inputs.system_prompt ?? this.system_prompt ?? "You are a helpful assistant.");
    const stopSequences = String(inputs.stop_sequences ?? this.stop_sequences ?? "");
    const promptTemplate = String(inputs.prompt_template ?? this.prompt_template ?? "");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 0);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0);

    const args: Record<string, unknown> = {
      "top_k": topK,
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "min_tokens": minTokens,
      "temperature": temperature,
      "system_prompt": systemPrompt,
      "stop_sequences": stopSequences,
      "prompt_template": promptTemplate,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/meta-llama-3.1-405b-instruct", args);
    return { output: outputToString(res.output) };
  }
}

export class Llama3_70B extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Llama3_70B";
  static readonly title = "Llama3_70 B";
  static readonly description = `Base version of Llama 3, a 70 billion parameter language model from Meta.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 50, description: "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)." })
  declare top_k: any;

  @prop({ type: "float", default: 0.9, description: "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 512, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "int", default: 0, description: "The minimum number of tokens the model should generate as output." })
  declare min_tokens: any;

  @prop({ type: "float", default: 0.6, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "str", default: "{prompt}", description: "Prompt template. The string '{prompt}' will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving 'prompt_template={prompt}'." })
  declare prompt_template: any;

  @prop({ type: "float", default: 1.15, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0.2, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topK = Number(inputs.top_k ?? this.top_k ?? 50);
    const topP = Number(inputs.top_p ?? this.top_p ?? 0.9);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 512);
    const minTokens = Number(inputs.min_tokens ?? this.min_tokens ?? 0);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.6);
    const promptTemplate = String(inputs.prompt_template ?? this.prompt_template ?? "{prompt}");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 1.15);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0.2);

    const args: Record<string, unknown> = {
      "top_k": topK,
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "min_tokens": minTokens,
      "temperature": temperature,
      "prompt_template": promptTemplate,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/meta-llama-3-70b", args);
    return { output: outputToString(res.output) };
  }
}

export class Llama3_70B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Llama3_70B_Instruct";
  static readonly title = "Llama3_70 B_ Instruct";
  static readonly description = `A 70 billion parameter language model from Meta, fine tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 50, description: "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)." })
  declare top_k: any;

  @prop({ type: "float", default: 0.9, description: "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 512, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "int", default: 0, description: "The minimum number of tokens the model should generate as output." })
  declare min_tokens: any;

  @prop({ type: "float", default: 0.6, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "str", default: "{prompt}", description: "Prompt template. The string '{prompt}' will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving 'prompt_template={prompt}'." })
  declare prompt_template: any;

  @prop({ type: "float", default: 1.15, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0.2, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topK = Number(inputs.top_k ?? this.top_k ?? 50);
    const topP = Number(inputs.top_p ?? this.top_p ?? 0.9);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 512);
    const minTokens = Number(inputs.min_tokens ?? this.min_tokens ?? 0);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.6);
    const promptTemplate = String(inputs.prompt_template ?? this.prompt_template ?? "{prompt}");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 1.15);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0.2);

    const args: Record<string, unknown> = {
      "top_k": topK,
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "min_tokens": minTokens,
      "temperature": temperature,
      "prompt_template": promptTemplate,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/meta-llama-3-70b-instruct", args);
    return { output: outputToString(res.output) };
  }
}

export class Llama3_8B extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Llama3_8B";
  static readonly title = "Llama3_8 B";
  static readonly description = `Base version of Llama 3, an 8 billion parameter language model from Meta.
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 50, description: "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)." })
  declare top_k: any;

  @prop({ type: "float", default: 0.9, description: "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 512, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "int", default: 0, description: "The minimum number of tokens the model should generate as output." })
  declare min_tokens: any;

  @prop({ type: "float", default: 0.6, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "str", default: "{prompt}", description: "Prompt template. The string '{prompt}' will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving 'prompt_template={prompt}'." })
  declare prompt_template: any;

  @prop({ type: "float", default: 1.15, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0.2, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topK = Number(inputs.top_k ?? this.top_k ?? 50);
    const topP = Number(inputs.top_p ?? this.top_p ?? 0.9);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 512);
    const minTokens = Number(inputs.min_tokens ?? this.min_tokens ?? 0);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.6);
    const promptTemplate = String(inputs.prompt_template ?? this.prompt_template ?? "{prompt}");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 1.15);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0.2);

    const args: Record<string, unknown> = {
      "top_k": topK,
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "min_tokens": minTokens,
      "temperature": temperature,
      "prompt_template": promptTemplate,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/meta-llama-3-8b", args);
    return { output: outputToString(res.output) };
  }
}

export class Llama3_8B_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Llama3_8B_Instruct";
  static readonly title = "Llama3_8 B_ Instruct";
  static readonly description = `An 8 billion parameter language model from Meta, fine tuned for chat completions
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "int", default: 50, description: "The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering)." })
  declare top_k: any;

  @prop({ type: "float", default: 0.9, description: "A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751)." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Prompt" })
  declare prompt: any;

  @prop({ type: "int", default: 512, description: "The maximum number of tokens the model should generate as output." })
  declare max_tokens: any;

  @prop({ type: "int", default: 0, description: "The minimum number of tokens the model should generate as output." })
  declare min_tokens: any;

  @prop({ type: "float", default: 0.6, description: "The value used to modulate the next token probabilities." })
  declare temperature: any;

  @prop({ type: "str", default: "{prompt}", description: "Prompt template. The string '{prompt}' will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving 'prompt_template={prompt}'." })
  declare prompt_template: any;

  @prop({ type: "float", default: 1.15, description: "Presence penalty" })
  declare presence_penalty: any;

  @prop({ type: "float", default: 0.2, description: "Frequency penalty" })
  declare frequency_penalty: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const topK = Number(inputs.top_k ?? this.top_k ?? 50);
    const topP = Number(inputs.top_p ?? this.top_p ?? 0.9);
    const prompt = String(inputs.prompt ?? this.prompt ?? "");
    const maxTokens = Number(inputs.max_tokens ?? this.max_tokens ?? 512);
    const minTokens = Number(inputs.min_tokens ?? this.min_tokens ?? 0);
    const temperature = Number(inputs.temperature ?? this.temperature ?? 0.6);
    const promptTemplate = String(inputs.prompt_template ?? this.prompt_template ?? "{prompt}");
    const presencePenalty = Number(inputs.presence_penalty ?? this.presence_penalty ?? 1.15);
    const frequencyPenalty = Number(inputs.frequency_penalty ?? this.frequency_penalty ?? 0.2);

    const args: Record<string, unknown> = {
      "top_k": topK,
      "top_p": topP,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "min_tokens": minTokens,
      "temperature": temperature,
      "prompt_template": promptTemplate,
      "presence_penalty": presencePenalty,
      "frequency_penalty": frequencyPenalty,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/meta-llama-3-8b-instruct", args);
    return { output: outputToString(res.output) };
  }
}

export class LlamaGuard_3_11B_Vision extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.LlamaGuard_3_11B_Vision";
  static readonly title = "Llama Guard_3_11 B_ Vision";
  static readonly description = `A Llama-3.2-11B pretrained model, fine-tuned for content safety classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "", description: "Image to moderate" })
  declare image: any;

  @prop({ type: "str", default: "Which one should I buy?", description: "User message to moderate" })
  declare prompt: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const image = String(inputs.image ?? this.image ?? "");
    const prompt = String(inputs.prompt ?? this.prompt ?? "Which one should I buy?");

    const args: Record<string, unknown> = {
      "image": image,
      "prompt": prompt,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/llama-guard-3-11b-vision", args);
    return { output: outputToString(res.output) };
  }
}

export class LlamaGuard_3_8B extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.LlamaGuard_3_8B";
  static readonly title = "Llama Guard_3_8 B";
  static readonly description = `A Llama-3.1-8B pretrained model, fine-tuned for content safety classification
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "I forgot how to kill a process in Linux, can you help?", description: "User message to moderate" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "Assistant response to classify" })
  declare assistant: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const prompt = String(inputs.prompt ?? this.prompt ?? "I forgot how to kill a process in Linux, can you help?");
    const assistant = String(inputs.assistant ?? this.assistant ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "assistant": assistant,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "meta/llama-guard-3-8b", args);
    return { output: outputToString(res.output) };
  }
}

export class Snowflake_Arctic_Instruct extends ReplicateNode {
  static readonly nodeType = "replicate.text_generate.Snowflake_Arctic_Instruct";
  static readonly title = "Snowflake_ Arctic_ Instruct";
  static readonly description = `An efficient, intelligent, and truly open-source language model
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "str", default: "" })
  declare name: any;

  @prop({ type: "str", default: "" })
  declare name_file: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const name = String(inputs.name ?? this.name ?? "");
    const nameFile = String(inputs.name_file ?? this.name_file ?? "");

    const args: Record<string, unknown> = {
      "name": name,
      "name_file": nameFile,
    };
    removeNulls(args);

    const res = await replicateSubmit(apiKey, "snowflake/snowflake-arctic-instruct", args);
    return { output: outputToString(res.output) };
  }
}

export const REPLICATE_TEXT_GENERATE_NODES: readonly NodeClass[] = [
  Claude_3_7_Sonnet,
  Deepseek_R1,
  Deepseek_V3_1,
  GPT_4_1,
  GPT_4_1_Mini,
  GPT_4_1_Nano,
  GPT_5,
  GPT_5_Mini,
  GPT_5_Nano,
  GPT_5_Structured,
  Llama3_1_405B_Instruct,
  Llama3_70B,
  Llama3_70B_Instruct,
  Llama3_8B,
  Llama3_8B_Instruct,
  LlamaGuard_3_11B_Vision,
  LlamaGuard_3_8B,
  Snowflake_Arctic_Instruct,
] as const;