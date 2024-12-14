# nodetool.nodes.replicate.text.generate

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


## Snowflake_Arctic_Instruct

An efficient, intelligent, and truly open-source language model

**Fields:**
- **top_k**: The number of highest probability tokens to consider for generating the output. If > 0, only keep the top k tokens with highest probability (top-k filtering). Lower to ignore less likely tokens (int)
- **top_p**: A probability threshold for generating the output. If < 1.0, only keep the top tokens with cumulative probability >= top_p (nucleus filtering). Nucleus filtering is described in Holtzman et al. (http://arxiv.org/abs/1904.09751). Lower to ignore less likely tokens. (float)
- **prompt**: Prompt to send to the model. (str)
- **temperature**: The value used to modulate the next token probabilities. Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value. (float)
- **max_new_tokens**: The maximum number of tokens the model should generate as output. A word is generally 2-3 tokens. (int)
- **min_new_tokens**: The minimum number of tokens the model should generate as output. A word is generally 2-3 tokens. (int)
- **stop_sequences**: A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'. (str)
- **prompt_template**: Prompt template. The string `{prompt}` will be substituted for the input prompt. If you want to generate dialog output, use this template as a starting point and construct the prompt string manually, leaving `prompt_template={prompt}`. (str)
- **presence_penalty**: A parameter that penalizes repeated tokens regardless of the number of appearances. As the value increases, the model will be less likely to repeat tokens in the output. (float)
- **frequency_penalty**: Frequency penalty is similar to presence penalty, but while presence penalty applies to all tokens that have been sampled at least once, the frequency penalty proportional to how often a particular token has already been sampled. (float)


