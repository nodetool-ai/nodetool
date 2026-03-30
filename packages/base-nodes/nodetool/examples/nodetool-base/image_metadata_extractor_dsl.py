"""
Image Metadata Extractor DSL Example

Extract and analyze metadata, objects, and descriptions from images.

Workflow:
1. **Image Input** - Load an image file
2. **Object Detection** - Identify objects in the image
3. **Scene Description** - Generate natural language description
4. **Metadata Extraction** - Extract technical metadata
5. **Report Generation** - Create structured analysis report
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import ImageInput
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import ImageRef, LanguageModel, Provider


# Load sample image
image_input = ImageInput(
    name="image",
    description="Image to analyze",
    value=ImageRef(
        uri="https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png",
        type="image",
    ),
)

# Analyze image using vision AI
image_analyzer = Agent(
    prompt=FormatText(
        template="""Please analyze this image and provide:
1. Objects detected
2. Scene description
3. Colors and composition
4. Estimated image dimensions
5. Quality assessment""",
    ).output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o",
        provider=Provider.OpenAI,
    ),
    system="You are an expert image analyst. Provide detailed analysis of images.",
    max_tokens=1000,
)

# Format analysis report
analysis_report = FormatText(
    template="""# Image Analysis Report

## Image Information:
- **Source:** User provided image
- **Analysis Type:** Comprehensive metadata extraction

## Analysis Results:
{{ analysis }}

## Recommendations:
- Use descriptive filenames for organization
- Consider image copyright and usage rights
- Optimize images for web if needed""",
    analysis=image_analyzer.out.text,
)

# Output the analysis
output = Output(
    name="image_analysis",
    value=analysis_report.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":

    result = run_graph(graph)
    print("Image Analysis Results:")
    print(result)
