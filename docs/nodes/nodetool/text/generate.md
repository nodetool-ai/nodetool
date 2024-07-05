# nodetool.nodes.nodetool.text.generate

## GPT2

GPT-2 is a transformer-based language model. This node uses the GPT-2 model to generate text based on a prompt.
# Applications
- Generating text based on a prompt.
- Generating text for chatbots.
- Generating text for creative writing.

**Tags:** 

**Inherits from:** BaseNode

- **prompt**: Prompt to send to the model. (`str`)
- **max_tokens**: Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1) (`int`)
- **temperature**: The temperature to use for the model. (`float`)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (`int`)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (`float`)

