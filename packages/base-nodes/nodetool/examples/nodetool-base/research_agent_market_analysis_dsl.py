"""
Autonomous Research Agent DSL Example

Use the ResearchAgent node to perform a lightweight market analysis with
structured outputs defined through dynamic slots.

Workflow:
1. **Input Brief** – Provide product, audience, and region details.
2. **Objective Builder** – Combine the brief into a research objective.
3. **Autonomous Research** – Launch the ResearchAgent with dynamic output schema.
4. **Report Assembly** – Format the structured findings into a briefing memo.
"""

from nodetool.dsl.graph import create_graph, run_graph_sync
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.agents import ResearchAgent
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider


# ---- Inputs -----------------------------------------------------------------
# Product brief that will guide the autonomous research.
product_name = StringInput(
    name="product_name",
    description="SaaS product under evaluation",
    value="Aurora Metrics",
)

target_segment = StringInput(
    name="target_segment",
    description="Primary audience for the product",
    value="Series B startup COOs in North America",
)

focus_region = StringInput(
    name="focus_region",
    description="Geographic focus for market intelligence",
    value="United States and Canada",
)

analysis_goal = StringInput(
    name="analysis_goal",
    description="Specific decision the leadership team needs to make",
    value=(
        "Assess the competitive landscape and opportunities for a data-driven "
        "operations dashboard ahead of a Q1 launch."
    ),
)

# Create a detailed research objective for the agent from the inputs.
research_objective = FormatText(
    template=(
        """You are supporting the launch team for {{ product }}.
        Build a concise market research brief that helps leadership evaluate
        {{ goal }}

        Context to consider:
        - Target segment: {{ segment }}
        - Focus region: {{ region }}
        - Deliver the results using the predefined JSON keys.
        """
    ),
    product=product_name.output,
    goal=analysis_goal.output,
    segment=target_segment.output,
    region=focus_region.output,
)

# ---- Autonomous Research Agent ---------------------------------------------
# Configure the research agent and declare the dynamic output schema.
research_agent = ResearchAgent(
    objective=research_objective.output,
    model=LanguageModel(
        type="language_model",
        id="openai/gpt-oss-120b",
        provider=Provider.HuggingFaceCerebras
    ),
    # Dynamic outputs describe the structured data the agent must return.
    # Each entry maps a field name to a TypeMetadata instance.
    dynamic_outputs = {
        "executive_summary": str,
        "market_landscape": str,
        "key_players": list[str],
        "opportunities": str,
        "risk_factors": str,
        "recommended_actions": str,
        "sources": str
    }
)

# ---- Reporting --------------------------------------------------------------
# Assemble a polished briefing memo using the agent's structured outputs.
research_brief = FormatText(
    template="""# Aurora Metrics – Market Intelligence Brief

## Executive Summary
{{ summary }}

## Market Landscape
{{ landscape }}

## Key Players
- {{ players | join('\n- ') }}

## Opportunities
{{ opportunities }}

## Risk Factors
{{ risks }}

## Recommended Actions
{{ actions }}

## Source Notes
{{ sources }}
""",
    summary=research_agent.out.executive_summary,
    landscape=research_agent.out.market_landscape,
    players=research_agent.out.key_players,
    opportunities=research_agent.out.opportunities,
    risks=research_agent.out.risk_factors,
    actions=research_agent.out.recommended_actions,
    sources=research_agent.out.sources,
)

# ---- Output Node -----------------------------------------------------------
research_output = Output(
    name="market_research_brief",
    description="Compiled market research memo",
    value=research_brief.output,
)

# Create the workflow graph.
graph = create_graph(research_output)


if __name__ == "__main__":

    result = run_graph_sync(graph)
    print("✅ Market research brief ready!\n")
    print(result["market_research_brief"])
