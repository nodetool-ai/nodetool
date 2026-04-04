"""
Competitive Analysis DSL Example

Analyze competitor offerings and market positioning for strategic planning.
Fetches competitor information from Google search results.

Workflow:
1. **Company Profile** - Define your company/product
2. **Competitor List** - Input competitor names (comma-separated)
3. **Web Search** - Fetch real-time competitor information via Google Search
4. **Feature Comparison** - Compare features and pricing
5. **SWOT Analysis** - Analyze strengths and weaknesses
6. **Market Position** - Determine competitive positioning
7. **Report** - Generate strategic recommendations
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.search.google import GoogleSearch
from nodetool.metadata.types import LanguageModel, Provider


# Company profile
company_info = StringInput(
    name="company",
    description="Your company/product information",
    value="""
Company: TaskFlow AI
Product: AI-powered project management tool
Target Market: Remote teams and startups
Price Point: $29/month per user
Key Features:
- AI task prioritization
- Automated report generation
- Integration with 20+ tools
- Real-time collaboration
- Advanced analytics
Founding: 2023
Team Size: 15 people
""",
)

# Competitor list (comma-separated) - will be fetched via Google Search
competitor_names_input = StringInput(
    name="competitors",
    description="Competitor names (comma-separated)",
    value="Asana,Monday.com,Jira",
)

# Search for Asana - competitor 1
asana_search = GoogleSearch(
    keyword="Asana project management pricing features",
    num_results=5,
)

# Search for Monday.com - competitor 2
monday_search = GoogleSearch(
    keyword="Monday.com project management pricing features",
    num_results=5,
)

# Search for Jira - competitor 3
jira_search = GoogleSearch(
    keyword="Jira project management pricing features",
    num_results=5,
)

# Aggregate competitor information from searches
competitor_info_aggregator = FormatText(
    template="""Competitor Information from Search Results:

## Asana
{{ asana_info }}

## Monday.com
{{ monday_info }}

## Jira
{{ jira_info }}""",
    asana_info=asana_search.output,
    monday_info=monday_search.output,
    jira_info=jira_search.output,
)

collected_competitor_info = competitor_info_aggregator

# Construct SWOT analysis prompt with collected competitor data
swot_prompt = FormatText(
    template="""Perform a SWOT analysis comparing this company to its competitors:

Your Company:
{{ company }}

Competitors (from Google Search):
{{ competitors }}

Analyze:
1. Strengths (vs competitors)
2. Weaknesses (vs competitors)
3. Opportunities in the market
4. Threats from competition""",
    company=company_info.output,
    competitors=collected_competitor_info.output,
)

# Perform SWOT analysis
swot_analyzer = Agent(
    prompt=swot_prompt.output,
    model=LanguageModel(
        id="openai/gpt-oss-120b",
        provider=Provider.HuggingFaceCerebras,
    ),
    system="You are a business strategist specializing in competitive analysis.",
    max_tokens=1200,
)

# Construct positioning strategy prompt
positioning_prompt = FormatText(
    template="""Based on this company profile and competitive landscape, provide:
1. Current market positioning
2. Recommended differentiation strategy
3. Target niche or segment
4. Pricing strategy recommendation
5. Go-to-market recommendations

Company:
{{ company }}

Competitors (from Google Search):
{{ competitors }}""",
    company=company_info.output,
    competitors=collected_competitor_info.output,
)

# Identify market positioning
positioning_strategist = Agent(
    prompt=positioning_prompt.output,
    model=LanguageModel(
        id="openai/gpt-oss-120b",
        provider=Provider.HuggingFaceCerebras,
    ),
    system="You are a go-to-market strategist.",
    max_tokens=1000,
)

# Format comprehensive analysis
competitive_report = FormatText(
    template="""# Competitive Analysis Report

## Company Being Analyzed:
{{ company }}

## Market Overview:
- Target Market: Remote teams and AI-forward companies
- Market Size: Growing (project management market ~$4B)
- Entry Stage: Early-stage with unique AI positioning

## Competitive SWOT Analysis:
{{ swot }}

## Strategic Positioning:
{{ positioning }}

## Market Positioning Matrix:
**Feature Richness vs. Ease of Use**

```
           Easy
            |
            | Asana
            |---Monday.com
Comprehensive|  TaskFlow
            | Jira
            |_____ Hard
          Simple      Complex
```

## Recommendations:
1. **Differentiation:** Focus on AI-powered features competitors lack
2. **Pricing:** Maintain competitive pricing with value-add AI features
3. **Go-to-Market:** Target startups and remote teams (underserved by Asana)
4. **Features:** Develop automation and AI capabilities as core differentiator
5. **Positioning:** "AI-first project management, designed for modern teams"

## Action Items:
- Develop 2-3 killer AI features
- Create customer success stories
- Build content marketing around AI productivity
- Consider strategic partnerships
- Plan product roadmap to address market gaps

## Timeline:
- Q1: Strengthen AI features
- Q2: Launch marketing campaign
- Q3: Enterprise sales push
- Q4: Year-end performance review
""",
    company=company_info.output,
    swot=swot_analyzer.out.text,
    positioning=positioning_strategist.out.text,
)

# Output the analysis
output = Output(
    name="competitive_analysis",
    value=competitive_report.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph)
    print("Competitive Analysis Report:")
    print(result['competitive_analysis'])
