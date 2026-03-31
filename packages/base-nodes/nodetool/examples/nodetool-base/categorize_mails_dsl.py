"""
Categorize Emails DSL Example

Automatically categorize and organize emails using AI.

Workflow:
1. **Gmail Search** - Fetches recent emails using specified filters
2. **Template** - Formats each email into a structured prompt
3. **Classifier** - Uses an LLM to classify the email into categories
4. **Add Label** - Applies the determined label to each email in Gmail
"""

from nodetool.dsl.graph import run_graph, create_graph
from nodetool.dsl.lib.mail import GmailSearch, AddLabel
from nodetool.dsl.nodetool.text import Template
from nodetool.dsl.nodetool.agents import Classifier
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider


# Search Gmail for recent emails
gmail_search = GmailSearch(
    date_filter=GmailSearch.DateFilter.SINCE_ONE_DAY,
    folder=GmailSearch.GmailFolder.INBOX,
    max_results=10,
)

# Format email data for classification
email_template = Template(
    string="subject: {{subject}}\nsender: {{sender}}\ncontent: {{body|truncate(100)}}",
    values=gmail_search.out.email,  # Use the email payload from the search node
)

# Classify emails into categories
classifier = Classifier(
    text=email_template.output,
    system_prompt="""
    You are a precise text classifier. Your task is to analyze the input text and assign confidence scores.
    """,
    model=LanguageModel(
        type="language_model",
        id="qwen3:4b",
        provider=Provider.Ollama,
    ),
    categories=["newsletter", "work", "family", "friends"],
)

# Add the classified label to the email
add_label = AddLabel(
    message_id=gmail_search.out.message_id,  # Connect specific output
    label=classifier.output,
)

# Output the result
output = Output(
    name="result",
    value=classifier.output,
)

# Create the graph
graph = create_graph(output, add_label)


if __name__ == "__main__":
    result = run_graph(graph)
    print(f"Labels applied: {result}")
