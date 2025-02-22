from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ChainOfThought(GraphNode):
    """
    Agent node that implements chain-of-thought reasoning to break down complex problems
    into step-by-step solutions.

    Use cases:
    - Complex problem solving requiring multiple steps
    - Mathematical calculations with intermediate steps
    - Logical reasoning and deduction tasks
    - Step-by-step analysis of scenarios
    """

    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The messages to use in the prompt.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The maximum number of tokens to generate.')
    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='gpt-4o', object='', created=0, owned_by=''), description='The GPT model to use for chain of thought reasoning.')

    @classmethod
    def get_node_type(cls): return "openai.agents.ChainOfThought"



class ChainOfThoughtSummarizer(GraphNode):
    """
    Agent node that synthesizes the results from a chain of thought reasoning process
    into a final, coherent conclusion.

    Use cases:
    - Summarizing multi-step reasoning processes
    - Drawing final conclusions from step-by-step analysis
    - Validating logical consistency across steps
    - Generating executive summaries of complex reasoning
    """

    steps: list[ThoughtStep] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The completed chain of thought steps with their results')
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The messages used to generate the chain of thought steps')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate')
    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for summarizing chain of thought results.')

    @classmethod
    def get_node_type(cls): return "openai.agents.ChainOfThoughtSummarizer"



class ChartGenerator(GraphNode):
    """
    LLM Agent to create chart configurations based on natural language descriptions.
    llm, data visualization, charts

    Use cases:
    - Generating chart configurations from natural language descriptions
    - Creating data visualizations programmatically
    - Converting data analysis requirements into visual representations
    """

    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for chart generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Natural language description of the desired chart')
    data: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The data to visualize')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The maximum number of tokens to generate.')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns available in the data.')

    @classmethod
    def get_node_type(cls): return "openai.agents.ChartGenerator"



class DataGenerator(GraphNode):
    """
    LLM Agent to create a dataframe based on a user prompt.
    llm, dataframe creation, data structuring

    Use cases:
    - Generating structured data from natural language descriptions
    - Creating sample datasets for testing or demonstration
    - Converting unstructured text into tabular format
    """

    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for data generation.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    input_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to be analyzed by the agent.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to use in the prompt.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The maximum number of tokens to generate.')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns to use in the dataframe.')

    @classmethod
    def get_node_type(cls): return "openai.agents.DataGenerator"



class Envelope(GraphNode):
    """
    Applies an ADR (Attack-Decay-Release) envelope to an audio signal.
    audio, synthesis, envelope

    Use cases:
    - Shape the amplitude of synthesized sounds
    - Create percussion-like instruments
    - Control sound dynamics
    """

    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='The audio to apply the envelope to.')
    attack: float | GraphNode | tuple[GraphNode, str] = Field(default=0.1, description='Attack time in seconds.')
    decay: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Decay time in seconds.')
    release: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Release time in seconds.')
    peak_amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Peak amplitude after attack phase (0-1).')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.Envelope"



class FM_Synthesis(GraphNode):
    """
    Performs FM (Frequency Modulation) synthesis.
    audio, synthesis, modulation

    Use cases:
    - Create complex timbres
    - Generate bell-like sounds
    - Synthesize metallic tones
    """

    carrier_freq: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Carrier frequency in Hz.')
    modulator_freq: float | GraphNode | tuple[GraphNode, str] = Field(default=110.0, description='Modulator frequency in Hz.')
    modulation_index: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='Modulation index (affects richness of sound).')
    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the output.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.FM_Synthesis"


import nodetool.nodes.lib.audio.synthesis
import nodetool.nodes.lib.audio.synthesis

class Oscillator(GraphNode):
    """
    Generates basic waveforms (sine, square, sawtooth, triangle).
    audio, synthesis, waveform

    Use cases:
    - Create fundamental waveforms for synthesis
    - Generate test signals
    - Build complex sounds from basic waves
    """

    OscillatorWaveform: typing.ClassVar[type] = nodetool.nodes.lib.audio.synthesis.Oscillator.OscillatorWaveform
    PitchEnvelopeCurve: typing.ClassVar[type] = nodetool.nodes.lib.audio.synthesis.Oscillator.PitchEnvelopeCurve
    waveform: nodetool.nodes.lib.audio.synthesis.Oscillator.OscillatorWaveform = Field(default=OscillatorWaveform.SINE, description='Type of waveform to generate (sine, square, sawtooth, triangle).')
    frequency: float | GraphNode | tuple[GraphNode, str] = Field(default=440.0, description='Frequency of the waveform in Hz.')
    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the waveform.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')
    pitch_envelope_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Amount of pitch envelope in semitones')
    pitch_envelope_time: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Duration of pitch envelope in seconds')
    pitch_envelope_curve: nodetool.nodes.lib.audio.synthesis.Oscillator.PitchEnvelopeCurve = Field(default=PitchEnvelopeCurve.LINEAR, description='Shape of pitch envelope (linear, exponential)')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.Oscillator"



class PinkNoise(GraphNode):
    """
    Generates pink noise (1/f noise).
    audio, synthesis, noise

    Use cases:
    - Create natural-sounding background noise
    - Test speaker response
    - Sound masking
    """

    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the noise.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.PinkNoise"



class ProcessThought(GraphNode):
    """
    Agent node that implements iterative chain-of-thought reasoning, building upon previous steps
    to solve complex problems incrementally.

    Use cases:
    - Complex problem solving requiring multiple iterations
    - Mathematical proofs with multiple steps
    - Logical deductions that build upon previous conclusions
    - Iterative refinement of solutions
    """

    current_step: ThoughtStep | GraphNode | tuple[GraphNode, str] = Field(default=ThoughtStep(type='thought_step', step_number=0, instructions='', reasoning='', result=''), description='The current step or question to analyze')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The maximum number of tokens to generate')
    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for processing chain of thought steps.')

    @classmethod
    def get_node_type(cls): return "openai.agents.ProcessThought"



class RegressionAnalyst(GraphNode):
    """
    Agent that performs regression analysis on a given dataframe and provides insights.

    Use cases:
    - Performing linear regression on datasets
    - Interpreting regression results like a data scientist
    - Providing statistical summaries and insights
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt or question regarding the data analysis.')
    data: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The dataframe to perform regression on.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate.')
    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for regression analysis.')

    @classmethod
    def get_node_type(cls): return "openai.agents.RegressionAnalyst"



class SynthesizerAgent(GraphNode):
    """
    Agent that interprets natural language descriptions to create sounds using basic synthesis algorithms.
    llm, audio synthesis, sound design

    Use cases:
    - Creating sounds from text descriptions
    - Automated sound design
    - Converting musical ideas into synthesized audio
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Natural language description of the desired sound')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration of the sound in seconds.')
    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description='The GPT model to use for sound synthesis.')

    @classmethod
    def get_node_type(cls): return "openai.agents.SynthesizerAgent"



class WhiteNoise(GraphNode):
    """
    Generates white noise.
    audio, synthesis, noise

    Use cases:
    - Create background ambience
    - Generate percussion sounds
    - Test audio equipment
    """

    amplitude: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Amplitude of the noise.')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Duration in seconds.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='Sampling rate in Hz.')

    @classmethod
    def get_node_type(cls): return "lib.audio.synthesis.WhiteNoise"


