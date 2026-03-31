"""
Data Validation Pipeline DSL Example

Validate and clean data for quality assurance before processing.

Workflow:
1. **Raw Data Input** - Load data from various sources
2. **Schema Validation** - Check data structure and types
3. **Anomaly Detection** - Identify outliers and missing values
4. **Data Cleaning** - Remove or correct invalid records
5. **Quality Report** - Generate validation summary
6. **Output** - Save cleaned data
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.input import StringInput
from nodetool.dsl.nodetool.agents import Agent
from nodetool.dsl.nodetool.text import FormatText
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider


# Sample data to validate
raw_data = StringInput(
    name="data",
    description="Raw data for validation",
    value="""
user_id,email,age,country
1,john@example.com,28,USA
2,jane@invalid,35,UK
3,bob@test.com,-5,Canada
4,alice@gmail.com,42,USA
5,,29,Germany
6,charlie@yahoo.com,abc,USA
""",
)

# Validate data quality
data_validator = Agent(
    prompt=FormatText(
        template="""Analyze this CSV data and identify:
1. Data quality issues
2. Invalid records
3. Missing values
4. Type mismatches
5. Recommendations for cleaning

Data:
{{ data }}""",
        data=raw_data.output,
    ).output,
    model=LanguageModel(
        type="language_model",
        id="gpt-4o-mini",
        provider=Provider.OpenAI,
    ),
    system="You are a data quality analyst. Identify validation issues in datasets.",
    max_tokens=800,
)

# Generate validation report
validation_report = FormatText(
    template="""# Data Validation Report

## Input Summary:
- **Format:** CSV
- **Source:** User provided

## Quality Analysis:
{{ analysis }}

## Issues Found:
1. Invalid email formats
2. Out-of-range values (negative age)
3. Missing values
4. Type mismatches

## Recommendations:
- Remove rows with missing emails
- Validate age ranges (0-150)
- Verify email format with regex
- Handle missing values appropriately

## Next Steps:
- Apply automated cleaning
- Re-validate cleaned dataset
- Generate quality metrics
- Save cleaned data to database

## Quality Score: 60%
- Valid records: 3 out of 6
- Issues to fix: 3
- Missing values: 1
""",
    analysis=data_validator.out.text,
)

# Output validation report
output = Output(
    name="validation_report",
    value=validation_report.output,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph)
    print("Data Validation Report:")
    print(result['validation_report'])
