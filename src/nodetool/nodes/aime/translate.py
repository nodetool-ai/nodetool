from enum import Enum
from nodetool.common.environment import Environment
from nodetool.providers.aime.types import JobResult, Progress
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from nodetool.metadata.types import Provider, AudioRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress


class Language(str, Enum):
    ARABIC = "arb"
    BENGALI = "ben"
    CATALAN = "cat"
    CZECH = "ces"
    MANDARIN = "cmn"
    WELSH = "cym"
    DANISH = "dan"
    GERMAN = "deu"
    ENGLISH = "eng"
    ESTONIAN = "est"
    FINNISH = "fin"
    FRENCH = "fra"
    HINDI = "hin"
    INDONESIAN = "ind"
    ITALIAN = "ita"
    JAPANESE = "jpn"
    KOREAN = "kor"
    MALTESE = "mlt"
    DUTCH = "nld"
    PERSIAN = "pes"
    POLISH = "pol"
    PORTUGUESE = "por"
    ROMANIAN = "ron"
    RUSSIAN = "rus"
    SLOVAK = "slk"
    SPANISH = "spa"
    SWEDISH = "swe"
    SWAHILI = "swh"
    TAMIL = "tam"
    TELUGU = "tel"
    TAGALOG = "tgl"
    THAI = "tha"
    TURKISH = "tur"
    UKRAINIAN = "ukr"
    URDU = "urd"
    UZBEK = "uzn"
    VIETNAMESE = "vie"


class SeamlessCommunication(BaseNode):
    """
    Translates text from one language to another using the AIME API.
    """

    src_lang: Language = Field(title="Source Language", default=Language.GERMAN)
    tgt_lang: Language = Field(title="Target Language", default=Language.ENGLISH)
    generate_audio: bool = Field(title="Generate Audio", default=True)
    text_input: str = Field(title="Text to Translate", default="")

    @classmethod
    def return_type(cls):
        return {
            "text": str,
            "audio": AudioRef,
        }

    async def process(self, context: ProcessingContext):
        payload = {
            "src_lang": self.src_lang.value,
            "tgt_lang": self.tgt_lang.value,
            "generate_audio": self.generate_audio,
            "text_input": self.text_input,
        }

        def progress_callback(progress: Progress):
            context.post_message(
                NodeProgress(
                    node_id=self._id,
                    progress=progress.progress,
                    total=100,
                )
            )

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model="sc_m4tv2",
            params={
                "data": payload,
                "progress_callback": progress_callback,
            },
        )

        output = {}

        if response.get("text_output"):
            output["text"] = response.get("text_output")
        if response.get("audio_output"):
            b64 = response.get("audio_output").split(",")[1]
            output["audio"] = await context.audio_from_base64(b64)

        return output
