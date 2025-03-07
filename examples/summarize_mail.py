import asyncio
from nodetool.dsl.google.mail import GmailSearch, EmailFlag
from nodetool.dsl.graph import graph, run_graph
from nodetool.dsl.nodetool.output import StringOutput
from nodetool.dsl.nodetool.text import Join, Concat
from nodetool.dsl.ollama.text import Ollama
from nodetool.dsl.nodetool.list import MapTemplate
from nodetool.metadata.types import LlamaModel

# Search Gmail for recent emails
emails = GmailSearch(
    date_filter=GmailSearch.DateFilter.SINCE_ONE_DAY,
    max_results=2,
)

# Format emails into a template
formatted_emails = MapTemplate(
    values=emails,
    template="==================\nFrom: {sender}\nSubject: {subject}\nBody: {body}\n==================",
)

# Join all formatted emails
joined_emails = Join(strings=formatted_emails, separator="")

# Add summarization prompt
prompt = Concat(
    a=joined_emails,
    b="Create a concise and well-structured summary of the emails above. Prioritize important topics at the top, group related emails together, and include a separate section for newsletters. Summarize each email briefly, highlighting key details, and organize the digest for easy scanning and action.",
)

# Generate summary using Gemma
summary = Ollama(
    prompt=prompt,
    model=LlamaModel(repo_id="llama3.2:3b"),
    system_prompt="You are a summarizer.",
    context_window=65536,
    temperature=0,
    top_k=50,
    top_p=0.95,
)

output = StringOutput(
    name="summary",
    description="Summary of the emails",
    value=summary,
)

summary_str = asyncio.run(run_graph(graph(output)))
print(summary_str)
