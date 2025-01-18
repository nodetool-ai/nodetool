# nodetool.nodes.replicate.text.generate

## Llama3_1_405B_Instruct

Meta's flagship 405 billion parameter language model, fine-tuned for chat completions

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). (float)
- **prompt**: Prompt (str)
- **max_tokens**: The maximum number of tokens the model should generate as output. (int)
- **min_tokens**: The minimum number of tokens the model should generate as output. (int)
- **temperature**: The value used to modulate the next token probabilities. (float)
- **system_prompt**: System prompt to send to the model. This is prepended to the prompt and helps guide system behavior. Ignored for non-chat models. (str)
- **stop_sequences**: A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'. (str | None)
- **presence_penalty**: Presence penalty (float)
- **frequency_penalty**: Frequency penalty (float)


## Llama3_70B

Base version of Llama 3, a 70 billion parameter language model from Meta.

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). (float)
- **prompt**: Prompt (str)
- **max_tokens**: The maximum number of tokens the model should generate as output. (int)
- **min_tokens**: The minimum number of tokens the model should generate as output. (int)
- **temperature**: The value used to modulate the next token probabilities. (float)
- **prompt_template**: Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`. (str)
- **presence_penalty**: Presence penalty (float)
- **frequency_penalty**: Frequency penalty (float)


## Llama3_70B_Instruct

A 70 billion parameter language model from Meta, fine tuned for chat completions

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). (float)
- **prompt**: Prompt (str)
- **max_tokens**: The maximum number of tokens the model should generate as output. (int)
- **min_tokens**: The minimum number of tokens the model should generate as output. (int)
- **temperature**: The value used to modulate the next token probabilities. (float)
- **prompt_template**: Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`. (str)
- **presence_penalty**: Presence penalty (float)
- **frequency_penalty**: Frequency penalty (float)


## Llama3_8B

Base version of Llama 3, an 8 billion parameter language model from Meta.

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). (float)
- **prompt**: Prompt (str)
- **max_tokens**: The maximum number of tokens the model should generate as output. (int)
- **min_tokens**: The minimum number of tokens the model should generate as output. (int)
- **temperature**: The value used to modulate the next token probabilities. (float)
- **prompt_template**: Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`. (str)
- **presence_penalty**: Presence penalty (float)
- **frequency_penalty**: Frequency penalty (float)


## Llama3_8B_Instruct

An 8 billion parameter language model from Meta, fine tuned for chat completions

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). (float)
- **prompt**: Prompt (str)
- **max_tokens**: The maximum number of tokens the model should generate as output. (int)
- **min_tokens**: The minimum number of tokens the model should generate as output. (int)
- **temperature**: The value used to modulate the next token probabilities. (float)
- **prompt_template**: Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`. (str)
- **presence_penalty**: Presence penalty (float)
- **frequency_penalty**: Frequency penalty (float)


## LlamaGuard_3_11B_Vision

A Llama-3.2-11B pretrained model, fine-tuned for content safety classification

**Fields:**
- **image**: Image to moderate (str | None)
- **prompt**: User message to moderate (str)


## LlamaGuard_3_8B

A Llama-3.1-8B pretrained model, fine-tuned for content safety classification

**Fields:**
- **prompt**: User message to moderate (str)
- **assistant**: Assistant response to classify (str | None)


## Snowflake_Arctic_Instruct

An efficient, intelligent, and truly open-source language model

**Fields:**
- **name** (str | None)
- **name_file** (str | None)


