from nodetool.common.environment import Environment
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from nodetool.metadata.types import Provider, AudioRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.providers.aime.prediction import fetch_auth_key


class SeamlessCommunication(BaseNode):
    """
    Translates text from one language to another using the AIME API.
    """

    src_lang: str = Field(title="Source Language", default="deu")
    tgt_lang: str = Field(title="Target Language", default="eng")
    generate_audio: bool = Field(title="Generate Audio", default=True)
    text_input: str = Field(title="Text to Translate", default="")

    async def process(self, context: ProcessingContext):
        auth_key = await fetch_auth_key(
            user=Environment.get_aime_user(),
            key=Environment.get_aime_api_key(),
            model="translation",
        )

        payload = {
            "src_lang": self.src_lang,
            "tgt_lang": self.tgt_lang,
            "generate_audio": self.generate_audio,
            "text_input": self.text_input,
        }

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model="translation",
            params={
                "data": payload,
                "auth_key": auth_key,
            },
        )

        return str(response)
