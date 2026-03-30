"""
Research Paper Summarizer DSL Example

Extract and summarize key findings from research papers and technical documents.

Workflow:
1. **Paper Input** - Provide research paper text or URL
2. **Section Extraction** - Identify paper sections (abstract, methods, results)
3. **Key Findings** - Extract main research contributions
4. **Technical Summary** - Summarize technical approach
5. **Conclusion Extraction** - Capture main conclusions
6. **Report** - Generate structured summary
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider


# Research paper content
paper_content = StringInput(
    name="paper",
    description="Research paper text",
    value="""
Title: Attention Is All You Need

Abstract:
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.
We propose a new simple network architecture, the Transformer, based solely on attention mechanisms.

Introduction:
Recurrent neural networks have long been the standard for sequence modeling tasks.
However, RNNs suffer from parallelization challenges during training.
Our approach abandons recurrence entirely and relies on attention mechanisms.

Methods:
The Transformer architecture consists of:
1. Multi-head self-attention layers
2. Feed-forward networks
3. Positional encoding
4. Layer normalization

Results:
Our model achieves state-of-the-art results on machine translation tasks.
The architecture enables much faster training compared to RNNs.
We demonstrate superior performance on multiple benchmarks.

Conclusion:
The Transformer architecture represents a major advancement in sequence modeling.
It enables faster training and better parallelization.
Future work will explore applications beyond sequence transduction.
""",
)

# Extract key findings
findings_extractor = Agent(
    prompt=FormatText(
        template="""Analyze this research paper and extract:
1. Main research question/contribution
2. Novel approach or methodology
3. Key findings and results
4. Impact and significance

Paper:
{{ paper }}""",
        paper=paper_content.output,
    ).output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o",
        provider=Provider.OpenAI,
    ),
    system="You are a research analyst. Extract key findings and contributions from academic papers.",
    max_tokens=1000,
)

# Summarize technical approach
technical_summary = Agent(
    prompt=FormatText(
        template="""Provide a technical summary of the methodology described in this paper:
{{ paper }}

Focus on: Architecture, algorithms, and technical innovations.""",
        paper=paper_content.output,
    ).output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    system="You are a technical expert. Summarize research methodologies clearly.",
    max_tokens=800,
)

# Format comprehensive summary
paper_summary = FormatText(
    template="""# Research Paper Summary Report

## Key Findings:
{{ findings }}

## Technical Approach:
{{ technical }}

## Quick Reference:
- **Type:** Research Paper (Academic)
- **Field:** Machine Learning
- **Contribution Level:** High Impact
- **Methodology:** Novel Architecture

## For Practitioners:
This paper presents fundamental concepts that have influenced modern AI development.
The techniques are widely applicable across various sequence modeling tasks.

## Further Reading:
Consider reading related work on:
- RNN architectures
- Attention mechanisms
- Transfer learning approaches
""",
    findings=findings_extractor.out.text,
    technical=technical_summary.out.text,
)

# Output the summary
output = Output(
    name="paper_summary",
    value=paper_summary.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    import asyncio

    result = asyncio.run(run_graph(graph))
    print("Research Paper Summary:")
    print(result)
