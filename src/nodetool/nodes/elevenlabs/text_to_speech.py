import aiohttp
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class VoiceIDEnum(str, Enum):
    """Available ElevenLabs voices"""
    ARIA = "Aria (American female, expressive)"
    ROGER = "Roger (American male, confident)"
    SARAH = "Sarah (American female, soft)"
    LAURA = "Laura (American female, upbeat)"
    CHARLIE = "Charlie (Australian male, natural)"
    GEORGE = "George (British male, warm)"
    CALLUM = "Callum (Transatlantic male, intense)"
    RIVER = "River (American non-binary, confident)"
    LIAM = "Liam (American male, articulate)"
    CHARLOTTE = "Charlotte (Swedish female, seductive)"
    ALICE = "Alice (British female, confident)"
    WILL = "Will (American male, friendly)"
    JESSICA = "Jessica (American female, expressive)"
    ERIC = "Eric (American male, friendly)"
    CHRIS = "Chris (American male, casual)"
    BRIAN = "Brian (American male, deep)"
    DANIEL = "Daniel (British male, authoritative)"
    LILY = "Lily (British female, warm)"
    BILL = "Bill (American male, trustworthy)"

VOICE_ID_MAPPING = {
    VoiceIDEnum.ARIA: "9BWtsMINqrJLrRacOk9x",
    VoiceIDEnum.ROGER: "CwhRBWXzGAHq8TQ4Fs17",
    VoiceIDEnum.SARAH: "EXAVITQu4vr4xnSDxMaL",
    VoiceIDEnum.LAURA: "FGY2WhTYpPnrIDTdsKH5",
    VoiceIDEnum.CHARLIE: "IKne3meq5aSn9XLyUdCD",
    VoiceIDEnum.GEORGE: "JBFqnCBsd6RMkjVDRZzb",
    VoiceIDEnum.CALLUM: "N2lVS1w4EtoT3dr4eOWO",
    VoiceIDEnum.RIVER: "SAz9YHcvj6GT2YYXdXww",
    VoiceIDEnum.LIAM: "TX3LPaxmHKxFdv7VOQHJ",
    VoiceIDEnum.CHARLOTTE: "XB0fDUnXU5powFXDhCwa",
    VoiceIDEnum.ALICE: "Xb7hH8MSUJpSbSDYk0k2",
    VoiceIDEnum.WILL: "bIHbv24MWmeRgasZH58o",
    VoiceIDEnum.JESSICA: "cgSgspJ2msm6clMCkdW9",
    VoiceIDEnum.ERIC: "cjVigY5qzO86Huf0OWal",
    VoiceIDEnum.CHRIS: "iP95p4xoKVk53GoZ742B",
    VoiceIDEnum.BRIAN: "nPczCjzI2devNBz1zQrb",
    VoiceIDEnum.DANIEL: "onwK4e9ZLuTAKqWW03F9",
    VoiceIDEnum.LILY: "pFZP5JQG7iQjIQuC4Bku",
    VoiceIDEnum.BILL: "pqHfZKP75CvOlQylNhV4",
}


class TextToSpeech(BaseNode):
    """
    Generates speech using ElevenLabs' text-to-speech API.
    audio, generation, AI, text-to-speech, TTS, elevenlabs

    Use cases:
    - Generate natural-sounding speech from text
    - Create voiceovers for videos or presentations
    - Produce audio content with different voices and styles
    - Create realistic AI-generated speech for various applications
    """

    voice: VoiceIDEnum = Field(
        default=VoiceIDEnum.ARIA, 
        description="Voice ID to be used for generation",
    )
    text: str = Field(
        default="Hello, how are you?",
        description="The text to convert to speech",
    )
    model_id: str | None = Field(
        default=None,
        description="Optional model ID (e.g., eleven_monolingual_v1)",
    )
    voice_settings: dict | None = Field(
        default=None,
        description="Optional voice settings to override defaults",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        api_key = context.environment.get("ELEVENLABS_API_KEY")
        if not api_key:
            raise ValueError("ELEVENLABS_API_KEYis required")

        voice_id = VOICE_ID_MAPPING[self.voice]
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
        }

        payload = {
            "text": self.text,
        }

        if self.model_id:
            payload["model_id"] = self.model_id

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise ValueError(f"ElevenLabs API error: {error_text}")
                
                audio_data = await response.read()
                return await context.audio_from_bytes(audio_data)

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["voice", "text"]
