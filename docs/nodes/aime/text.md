# nodetool.nodes.aime.text

## AIMEChatModel

An enumeration.

## BaseChatNode

Base class for AIME chat nodes with common fields

**Fields:**
- **system_prompt**: System prompt that defines the assistant's behavior. (str)
- **messages**: History of messages in the conversation. (list)
- **prompt**: Prompt to send to the model. If provided, it will add a new message to the conversation. (str)
- **temperature**: The temperature to use for response generation. (float)
- **top_k**: The number of highest probability tokens to consider. (int)
- **top_p**: The cumulative probability threshold for token sampling. (float)
- **max_tokens**: Maximum number of tokens to generate. (int)

### predict

**Args:**
- **context (ProcessingContext)**
- **model (str)**

**Returns:** str


## Llama3Chat

Run chat models using the Aime API with Llama 3.1.

Use cases:
- Chat with an AI assistant using Llama 3.1
- Generate responses for conversational workflows
- Integrate with chat-based applications

**Tags:** llm, text generation, language model, ai assistant

**Fields:**
- **system_prompt**: System prompt that defines the assistant's behavior. (str)
- **messages**: History of messages in the conversation. (list)
- **prompt**: Prompt to send to the model. If provided, it will add a new message to the conversation. (str)
- **temperature**: The temperature to use for response generation. (float)
- **top_k**: The number of highest probability tokens to consider. (int)
- **top_p**: The cumulative probability threshold for token sampling. (float)
- **max_tokens**: Maximum number of tokens to generate. (int)


## MixtralChat

Run chat models using the Aime API with Mixtral.

Use cases:
- Chat with an AI assistant using Mixtral
- Generate responses for conversational workflows
- Integrate with chat-based applications

**Tags:** llm, text generation, language model, ai assistant

**Fields:**
- **system_prompt**: System prompt that defines the assistant's behavior. (str)
- **messages**: History of messages in the conversation. (list)
- **prompt**: Prompt to send to the model. If provided, it will add a new message to the conversation. (str)
- **temperature**: The temperature to use for response generation. (float)
- **top_k**: The number of highest probability tokens to consider. (int)
- **top_p**: The cumulative probability threshold for token sampling. (float)
- **max_tokens**: Maximum number of tokens to generate. (int)


