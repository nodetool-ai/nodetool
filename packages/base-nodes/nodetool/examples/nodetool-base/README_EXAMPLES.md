# NodeTool Base DSL Examples

This directory contains 24 comprehensive examples demonstrating the capabilities of NodeTool's DSL for building AI-powered workflows.

## Original Examples (10)

### Content & Document Processing
1. **meeting_transcript_summarizer_dsl.py** - Convert meeting transcripts into structured summaries with key points
2. **chat_with_docs_dsl.py** - RAG-based Q&A system for document retrieval and question answering
3. **fetch_papers_dsl.py** - Automatically fetch and download research papers from GitHub
4. **summarize_newsletters_dsl.py** - Extract and summarize newsletter content
5. **summarize_rss_dsl.py** - Process RSS feeds and generate summaries

### Media Processing
6. **image_enhance_dsl.py** - Apply image enhancements like sharpening and contrast adjustment
7. **video_frame_text_overlay_dsl.py** - Extract video frames and add text overlays with AI captions
8. **transcribe_audio_dsl.py** - Convert speech to text using Whisper model
9. **image_to_video_dsl.py** - Animate a still image into a cinematic clip with AI motion

### Data & Automation
9. **categorize_mails_dsl.py** - Automatically classify emails with AI and apply labels
10. **data_generator_dsl.py** - Generate synthetic datasets using AI models

## New Examples (14)

### AI Content Generation
11. **social_media_sentiment_dsl.py** - Analyze sentiment and emotions in social media posts
12. **code_reviewer_dsl.py** - Automatically review code for best practices and security issues
13. **document_qa_extractor_dsl.py** - Extract specific information and answer questions from documents
14. **product_description_generator_dsl.py** - Generate marketing copy and product descriptions
15. **content_translator_dsl.py** - Translate content between languages with quality assurance
16. **research_paper_summarizer_dsl.py** - Extract and summarize research paper findings

### Business Intelligence & Analysis
17. **image_metadata_extractor_dsl.py** - Extract and analyze metadata from images
18. **meeting_notes_summarizer_dsl.py** - Convert meeting transcripts into structured action items
19. **content_personalization_dsl.py** - Generate personalized content for different audience segments
20. **job_application_analyzer_dsl.py** - Analyze job descriptions and provide application advice
21. **competitive_analysis_dsl.py** - Analyze competitor offerings and market positioning
22. **data_validation_pipeline_dsl.py** - Validate and clean data for quality assurance
23. **research_agent_market_analysis_dsl.py** - Run an autonomous ResearchAgent to gather market intelligence with dynamic outputs

### Media Generation
24. **text_to_video_campaign_dsl.py** - Generate realistic marketing videos from campaign briefs using text-to-video

### Language Learning
25. **language_practice_coach_dsl.py** - Practice speaking a foreign language with AI-powered feedback and coaching using ASR and LLM

## How to Run Examples

Each example follows the same pattern:

```bash
# From the repository root
cd nodetool-base

# Run an example
python -m nodetool.examples.nodetool_base.social_media_sentiment_dsl

# Or directly
python src/nodetool/examples/nodetool-base/social_media_sentiment_dsl.py

# Some examples also provide a Gradio UI (when available)
python src/nodetool/examples/nodetool-base/social_media_sentiment_dsl.py --gradio
```

## Example Structure

All examples follow this standard structure:

```python
from nodetool.dsl.graph import create_graph, run_graph
# Import required nodes...

# Define nodes at module level
node1 = SomeNode(...)
node2 = OtherNode(value=node1.output)

# Create graph
graph = create_graph(node2)

# Run in main block
if __name__ == "__main__":
    import asyncio
    result = asyncio.run(run_graph(graph))
    print(result)
```

## Common Patterns

### Text Analysis & Classification
- **Sentiment Analysis** - Use `Classifier` node
- **Text Generation** - Use `Agent` node with prompts
- **Named Entity Recognition** - Use `Agent` with NER prompt
- **Language Detection** - Use `Classifier` node

### Content Processing
- **Summarization** - Use `Agent` node with summarization prompt
- **Translation** - Use `Agent` node with translation prompt
- **Format Conversion** - Use `FormatText` node with templates
- **Q&A** - Use `Agent` with document context

### Data Operations
- **Data Validation** - Use data analysis nodes
- **Data Filtering** - Use `Filter` node from data module
- **Data Extraction** - Use `ExtractColumn` node
- **Data Generation** - Use `DataGenerator` node

## Node Categories Available

### Text Nodes (`nodetool.text`)
- `Agent` - AI agent for text processing
- `Classifier` - Multi-class classification
- `FormatText` - Template-based text formatting
- `AutomaticSpeechRecognition` - Speech to text

### Input/Output Nodes
- `StringInput` - Text input
- `ImageInput` - Image input
- `AudioInput` - Audio input
- `VideoInput` - Video input
- `Output` - Generic output for any type (strings, images, audio, video, dataframes, lists, etc.)

### Data Nodes (`nodetool.data`)
- `FromList` - Convert list to DataFrame
- `Filter` - Filter data by conditions
- `ExtractColumn` - Extract specific column
- `DataGenerator` - Generate synthetic data

### Image Processing Nodes (`lib.pillow`)
- `Sharpen` - Apply sharpening filter
- `AutoContrast` - Adjust image contrast
- `RenderText` - Draw text on images

### Vector Database Nodes (`vector.chroma`)
- `HybridSearch` - Semantic and keyword search

## Tips for Creating New Examples

1. **Start simple** - Use 3-5 nodes minimum
2. **Add documentation** - Include docstring with workflow steps
3. **Use realistic data** - Include sample inputs that demonstrate value
4. **Show output format** - Make expected results clear
5. **Follow naming convention** - Use `*_dsl.py` suffix

## Example Workflow Template

```python
"""
Example Title

Description of what this workflow does.

Workflow:
1. **Input** - Describe input
2. **Processing** - Describe processing
3. **Analysis** - Describe analysis
4. **Output** - Describe output
"""

from nodetool.dsl.graph import create_graph, run_graph
# ... imports ...

# Create nodes at module level
input_node = StringInput(...)
process_node = ProcessNode(value=input_node.output)
output_node = Output(value=process_node.output)

# Create graph
graph = create_graph(output_node)

if __name__ == "__main__":
    import asyncio
    result = asyncio.run(run_graph(graph))
    print(result)
```

## Integration Examples

### With External APIs
- OpenAI models (GPT-4, etc.)
- Google Gemini
- HuggingFace models
- Local Ollama models

### With File Systems
- Local file processing
- URL fetching
- S3 integration
- Workspace output

### With Databases
- ChromaDB vector search
- Data persistence
- Result caching

## Learning Path

Recommended order for learning:

1. **Basics**: Start with `social_media_sentiment_dsl.py`
2. **Text Processing**: Try `content_translator_dsl.py`
3. **Multi-step Workflows**: Study `research_paper_summarizer_dsl.py`
4. **Advanced**: Explore `competitive_analysis_dsl.py`
5. **Custom**: Create your own examples

## Performance Considerations

- **API Calls**: Consider rate limiting for LLM calls
- **Large Files**: Process in chunks for video/audio
- **Async Operations**: Use async/await for parallel execution
- **Caching**: Leverage ChromaDB for semantic caching

## Troubleshooting

### Missing Dependencies
```bash
pip install nodetool-base
```

### API Keys
Set environment variables for your AI providers:
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-...
```

### Connection Issues
Ensure DSL modules are properly generated:
```bash
nodetool codegen
```

## Contributing New Examples

To add a new example:

1. Create a new file: `src/nodetool/examples/nodetool-base/new_example_dsl.py`
2. Follow the standard structure
3. Include clear documentation
4. Test with `python new_example_dsl.py`
5. Submit with description of use case

## Further Resources

- [NodeTool Documentation](https://docs.nodetool.ai)
- [Node Reference Guide](https://docs.nodetool.ai/nodes)
- [DSL Guide](https://docs.nodetool.ai/dsl)
- [Community Examples](https://github.com/nodetool/examples)
