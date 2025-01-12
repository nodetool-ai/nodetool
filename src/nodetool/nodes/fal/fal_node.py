import os
from typing import Dict, Any
from fal_client import AsyncClient
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

class FALNode(BaseNode):
    """
    FAL Node for interacting with FAL AI services.
    Provides methods to submit and handle API requests to FAL endpoints.
    """
    
    @classmethod
    def is_visible(cls) -> bool:
        return cls is not FALNode
    

    def get_client(self, context: ProcessingContext) -> AsyncClient:
        if context.environment.get("FAL_API_KEY") is None:
            raise ValueError("FAL_API_KEY is not set in the environment")

        os.environ["FAL_KEY"] = context.environment.get("FAL_API_KEY") # type: ignore
        return AsyncClient()

    async def submit_request(
        self,
        context: ProcessingContext,
        application: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Submit a request to a FAL AI endpoint and return the result.

        Args:
            application (str): The path to the FAL model (e.g., "fal-ai/flux/dev/image-to-image")
            arguments (Dict[str, Any]): The arguments to pass to the model
            with_logs (bool, optional): Whether to include logs in the response. Defaults to True.

        Returns:
            Dict[str, Any]: The result from the FAL API
        """
        client = self.get_client(context)
        handler = await client.submit(
            application,
            arguments=arguments,
        )

        # Process events if requested
        async for event in handler.iter_events(with_logs=True):
            # You might want to implement a proper logging system here
            print(event)

        # Get the final result
        result = await handler.get()
        return result


