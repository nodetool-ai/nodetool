from genflow.nodes.replicate import ReplicateNode


from pydantic import Field


from enum import Enum
from typing import ClassVar


class LlamaNode(ReplicateNode):
    """
    Llama 2 is a tool for generating text based on a given prompt.

    This model, developed by Meta, creates vivid and context-specific textual outputs.
    With Llama 2, users can generate stories, text-based games, chat messages and many more.

    #### Applications
    - Story writing: Create high-quality stories, articles or scripts.
    - Dialogue system: Develop advanced customer service chatbots or characters for video games.
    - Education: Craft personalized learning resources or assist with homework.
    - Business: Generate market analysis reports or help with technical writing.
    """

    class ModelVersion(str, Enum):
        llama_2_7b = "llama_2_7b"
        llama_2_13b = "llama_2_13b"
        llama_2_34b = "llama_2_34b"
        llama_2_70b = "llama_2_70b"
        mistral_7b = "mistral_7b"
        mistral_7b_instruct = "mistral_7b_instruct"

    MODEL_IDS: ClassVar[dict[(ModelVersion, str)]] = {
        ModelVersion.llama_2_7b: "meta/llama-2-7b:73001d654114dad81ec65da3b834e2f691af1e1526453189b7bf36fb3f32d0f9",
        ModelVersion.llama_2_13b: "replicate/llama-2-13b:dc4f980befd2103b0fb17d5854634c0f56d6f80a1a02be1b6f8859ac8ba02896",
        ModelVersion.llama_2_34b: "meta/codellama-34b:efbd2ef6feefb242f359030fa6fe08ce32bfced18f3868b2915db41d41251b46",
        ModelVersion.llama_2_70b: "meta/llama-2-70b:a52e56fee2269a78c9279800ec88898cecb6c8f1df22a6483132bea266648f00",
        ModelVersion.mistral_7b_instruct: "mistralai/mistral-7b-v0.1:3e8a0fb6d7812ce30701ba597e5080689bef8a013e5c6a724fafb108cc2426a0",
        ModelVersion.mistral_7b_instruct: "mistralai/mistral-7b-instruct-v0.1:83b6a56e7c828e667f21fd596c338fd4f0039b46bcfa18d973e8e70e455fda70",
    }

    version: ModelVersion = Field(
        default=ModelVersion.llama_2_7b,
        description="The version of the model to use.",
    )

    prompt: str = Field(default="", description="Prompt to send to the model.")
    max_new_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    min_new_tokens: int = Field(
        default=(-1),
        ge=(-1),
        le=10,
        description="Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens. (minimum: -1)",
    )
    temperature: float = Field(
        default=0.75,
        ge=0.01,
        le=5,
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value. (minimum: 0.01; maximum: 5)",
    )
    top_p: float = Field(
        default=0.9,
        ge=0,
        le=1,
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (maximum: 1)",
    )
    stop_sequences: str = Field(
        default="<end>,<stop>",
        description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.",
    )

    @classmethod
    def return_type(cls):
        return list[str]

    def replicate_model_id(self) -> str:
        return self.MODEL_IDS[self.version]


class CodeLlamaNode(ReplicateNode):
    """
    The Code Llama Node uses a generative text model for generating and understanding code.
    The model leverages Hugging Face Transformers, which are designed specifically for code-related tasks.

    Code Llama Node is part of Code Llama's suite of models and it is suitable for several coding applications. Other models in the Code Llama collection can be accessed through links provided in the model's repository.

    #### Applications
    - Code Generation: Producing code snippets based on given textual prompts.
    - Code Understanding: Learning about code structures, syntax, and semantics.
    - Code Review Assistance: Offering helpful insights and suggestions for improving code.
    - Code Documentation: Aiding in the creation of code documentation.
    - Programming Learning Aid: Assisting learners in understanding and writing code.

    #### Example
    For code generation, you can provide a descriptive prompt like "write a Python function to calculate Fibonacci series".
    The model will then generate a corresponding code snippet. If you want to understand a piece of code, you can
    input that as the prompt. The model will then provide an understanding of the given code.
    """

    class ModelVersion(str, Enum):
        codellama_7b = "codellama_7b"
        codellama_13b = "codellama_13b"
        codellama_34b = "codellama_34b"
        codellama_7b_instruct = "codellama_7b_instruct"
        codellama_13b_instruct = "codellama_13b_instruct"
        code_llama_34b_instruct = "code_llama_34b_instruct"
        code_llama_34b_python = "code_llama_34b_python"

    MODEL_IDS: ClassVar[dict[(ModelVersion, str)]] = {
        ModelVersion.codellama_7b: "meta/codellama-7b:6c70f963b00e2186fa3048b9b6dba7c8f01ced30da78bd1853ae1b567282ebfb",
        ModelVersion.codellama_13b: "meta/codellama-13b:cc618fca92404570b9c10d1a4fb5321f4faff54a514189751ee8d6543db64c8f",
        ModelVersion.codellama_34b: "meta/codellama-34b:efbd2ef6feefb242f359030fa6fe08ce32bfced18f3868b2915db41d41251b46",
        ModelVersion.codellama_7b_instruct: "meta/codellama-7b-instruct:7bf2629623162c0cf22ace9ec7a94b34045c1cfa2ed82586f05f3a60b1ca2da5",
        ModelVersion.codellama_13b_instruct: "meta/codellama-13b-instruct:ca8c51bf3c1aaf181f9df6f10f31768f065c9dddce4407438adc5975a59ce530",
        ModelVersion.code_llama_34b_instruct: "meta/codellama-34b-instruct:b17fdb44c843000741367ae3d73e2bb710d7428a662238ddebbf4302db2b5422",
        ModelVersion.code_llama_34b_python: "meta/codellama-34b-python:482ba325daab209d121f45a0030f2f3ed942df98b185d41635ab3f19165a3547",
    }

    version: ModelVersion = Field(
        default=ModelVersion.codellama_7b,
        description="The version of the model to use.",
    )
    prompt: str = Field(default="", description="Prompt to be used for the model.")
    max_tokens: int = Field(default=500, description="Max number of tokens to return.")
    temperature: float = Field(
        default=0.8,
        ge=0.1,
        le=1.0,
        description="The temperature to use for generation.",
    )
    top_p: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="The cumulative probability cutoff for nucleus/top-p sampling.",
    )
    # top_k: int = Field(
    #     default=10,
    #     description="The number of highest probability tokens to keep for top-k sampling.",
    # )
    frequency_penalty: float = Field(
        default=0.0, description="The frequency penalty to apply."
    )
    presence_penalty: float = Field(
        default=0.0, description="The presence penalty to apply."
    )
    repeat_penalty: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Penalty for repeating the same token. Values greater than 1.0 discourage repetition, values less than 1.0 encourage it.",
    )

    def replicate_model_id(self) -> str:
        return self.MODEL_IDS[self.version]

    @classmethod
    def return_type(cls):
        return str


class LlamaChatNode(ReplicateNode):
    """
    This node enables engaging in a conversation with Llama Chat.

    #### Applications
    - Can be used to build conversation flows for virtual assistants or chatbots.
    - Helpful in onboarding users by providing interactive help and guidance.
    - Enables user testing scenarios in development stages, where user interaction and the system's responses need to be documented.
    """

    class Version(str, Enum):
        llama_2_7b_chat = "llama_2_7b_chat"
        llama_2_13b_chat = "llama_2_13b_chat"
        llama_2_70b_chat = "llama_2_70b_chat"

    MODEL_IDS: ClassVar[dict[(Version, str)]] = {
        Version.llama_2_7b_chat: "meta/llama-2-7b-chat:13c3cdee13ee059ab779f0291d29054dab00a47dad8261375654de5540165fb0",
        Version.llama_2_13b_chat: "meta/llama-2-13b-chat:f4e2de70d66816a838a89eeeb621910adffb0dd0baba3976c96980970978018d",
        Version.llama_2_70b_chat: "meta/llama-2-70b-chat:02e509c789964a7ea8736978a43525956ef40397be9033abf9fd2badfe68c9e3",
    }

    version: Version = Field(
        default=Version.llama_2_7b_chat,
    )
    prompt: str = Field(default="", description="Prompt to send to the model.")
    system_prompt: str = Field(
        default="", description="System Prompt to send to the model."
    )
    use_history: bool = Field(
        default=False,
        description="Whether to use the history of the conversation as the prompt.",
    )
    history_limit: int = Field(title="History Limit", default=20, ge=1, le=100)
    max_new_tokens: int = Field(
        default=128,
        ge=1,
        le=1024,
        description="Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)",
    )
    min_new_tokens: int = Field(
        default=(-1),
        ge=(-1),
        le=10,
        description="Minimum number of tokens to generate. To disable, set to -1. A word is generally 2-3 tokens. (minimum: -1)",
    )
    temperature: float = Field(
        default=0.75,
        ge=0.01,
        le=5,
        description="Adjusts randomness of outputs, greater than 1 is random and 0 is deterministic, 0.75 is a good starting value. (minimum: 0.01; maximum: 5)",
    )
    top_p: float = Field(
        default=0.9,
        ge=0,
        le=1,
        description="When decoding text, samples from the top p percentage of most likely tokens; lower to ignore less likely tokens (maximum: 1)",
    )
    # top_k: int = Field(
    #     default=100,
    #     ge=1,
    #     le=100,
    #     description="When decoding text, samples from the top k most likely tokens; lower to ignore less likely tokens",
    # )
    stop_sequences: str = Field(
        default="",
        description="A comma-separated list of sequences to stop generation at. For example, '<end>,<stop>' will stop generation at the first instance of 'end' or '<stop>'.",
    )

    def replicate_model_id(self):
        return self.MODEL_IDS[self.version]

    @classmethod
    def return_type(cls):
        return str
