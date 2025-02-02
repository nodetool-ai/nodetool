# nodetool.nodes.google.gemini

## Gemini

Generate text using Gemini.

**Tags:** google, llm, chat, vision, multimodal

**Fields:**
- **model** (GeminiModel)
- **prompt** (str)
- **messages**: History of messages to send to the model. (list[nodetool.metadata.types.Message])
- **image**: Image to use for generation (ImageRef)
- **audio**: Audio to use for generation (AudioRef)
- **system_instruction**: Instructions for the model to steer it toward better performance.
        For example, "Answer as concisely as possible" or "Don't use technical
        terms in your response".
         (str)
- **code_execution**: Whether to enable code execution tool. 
        You can use this code execution capability to build applications that 
        benefit from code-based reasoning and that produce text output.
         (bool)
- **temperature**: Value that controls the degree of randomness in token selection.
        Lower temperatures are good for prompts that require a less open-ended or
        creative response, while higher temperatures can lead to more diverse or
        creative results.
         (float)
- **top_p**: Tokens are selected from the most to least probable until the sum
        of their probabilities equals this value. Use a lower value for less
        random responses and a higher value for more random responses.
         (float)
- **top_k**: For each token selection step, the ``top_k`` tokens with the
        highest probabilities are sampled. Then tokens are further filtered based
        on ``top_p`` with the final token selected using temperature sampling. Use
        a lower number for less random responses and a higher number for more
        random responses.
         (float)
- **max_output_tokens**: Maximum number of tokens that can be generated in the response.
       (int)
- **presence_penalty**: Positive values penalize tokens that already appear in the
        generated text, increasing the probability of generating more diverse
        content.
         (float)
- **frequency_penalty**: Positive values penalize tokens that repeatedly appear in the
        generated text, increasing the probability of generating more diverse
        content.
         (float)


## GeminiModel

