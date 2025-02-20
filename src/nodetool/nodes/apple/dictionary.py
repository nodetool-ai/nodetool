from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.apple import IS_MACOS

if IS_MACOS:
    import CoreServices  # type: ignore


class SearchDictionary(BaseNode):
    """
    Search macOS Dictionary.app using Dictionary Services API
    dictionary, automation, macos, reference

    Use cases:
    - Look up word definitions programmatically
    - Check spelling and usage
    - Access dictionary content in workflows
    """

    term: str = Field(
        default="", description="Word or phrase to look up in the dictionary"
    )
    max_results: int = Field(
        default=1, description="Maximum number of definitions to return"
    )

    @classmethod
    def is_cacheable(cls) -> bool:
        return True

    async def process(self, context: ProcessingContext) -> list[str]:
        if not IS_MACOS:
            raise NotImplementedError("Dictionary functionality is only available on macOS")
        if not self.term:
            return []

        # Create a dictionary text range for the search term
        text_range = CoreServices.DCSGetTermRangeInString(None, self.term, 0)  # type: ignore

        # Get definitions for the term
        definitions = CoreServices.DCSCopyTextDefinition(  # type: ignore
            None, self.term, text_range  # Use default dictionary
        )

        if not definitions:
            return []

        # Split definitions by newlines and clean up
        definition_list = definitions.strip().split("\n")

        # Remove empty strings and limit results
        definition_list = [d.strip() for d in definition_list if d.strip()]
        return definition_list[: self.max_results]
