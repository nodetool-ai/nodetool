# Agent Configuration Examples

This directory contains example YAML configuration files for the `nodetool agent` command.

Run an example with `nodetool agent run <file>` and supply the objective with `--objective` (or pipe it via stdin, or
set an `objective:` field in the YAML):

```bash
nodetool agent run <file>.yaml --objective "Your objective here"
```

## Available Examples

### [research-agent.yaml](research-agent.yaml)

Autonomous research agent for gathering and synthesizing information from the web.

**Use cases:**
- Market research and competitive analysis
- Literature reviews and fact-finding
- Data collection from multiple sources
- Automated research workflows

**Tools:**
- Web search (Google)
- Web browsing and content extraction
- File read/write operations

**Example:**
```bash
nodetool agent run research-agent.yaml \
  --objective "Research the latest developments in quantum computing"
```

### [code-assistant.yaml](code-assistant.yaml)

AI coding assistant for development tasks, debugging, and code review.

**Use cases:**
- Writing clean, efficient code
- Debugging and fixing issues
- Code refactoring and optimization
- Explaining complex code

> **Note:** this example's `tools:` list includes `execute_code` and `terminal`, which are **not** wired into the agent
> CLI's tool registry — they are ignored at run time with a warning. For code execution use `run_code`; there is no
> shell/terminal tool. Update the file to `run_code` (and remove `terminal`) before relying on code execution.

**Example:**
```bash
nodetool agent run code-assistant.yaml \
  --objective "Create a Python script to parse CSV files and generate visualizations"
```

### [content-creator.yaml](content-creator.yaml)

Creative writing agent for generating blog posts, marketing content, and documentation.

**Use cases:**
- Blog posts and articles
- Marketing copy and social media content
- Technical documentation
- Creative storytelling

**Tools:**
- Web research
- File operations

**Example:**
```bash
nodetool agent run content-creator.yaml \
  --objective "Write a blog post about sustainable software development practices"
```

### [minimal.yaml](minimal.yaml)

Minimal agent configuration showing the core fields.

**Use cases:**
- Starting point for custom agents
- Simple task automation
- Testing agent functionality

**Example:**
```bash
nodetool agent run minimal.yaml \
  --objective "Summarize the main features of NodeTool"
```

## Creating Custom Agents

### Basic Structure

```yaml
name: my-agent
description: Agent description

system_prompt: |
  Agent instructions and behavior

model:
  provider: openai
  id: gpt-4o

planning_agent:
  enabled: true
  model:
    provider: openai
    id: gpt-4o-mini

tools:
  - write_file
  - read_file

max_tokens: 128000
max_steps: 10
```

### Best Practices

1. **Start with minimal.yaml** and add complexity as needed
2. **Be specific in system_prompt** about expected behavior and workflow
3. **Choose appropriate models** for the task complexity and budget
4. **Enable only necessary tools** to reduce complexity and improve focus
5. **Set a reasonable `max_steps`** to bound task length
6. **Test incrementally** with simple objectives before complex tasks

### Configuration Tips

**System Prompt:**
- Clearly define the agent's role and responsibilities
- Include specific workflow steps
- Provide guidelines for tool usage
- Set expectations for output format and quality

**Model Selection:**
- **Planning model**: Use a fast, cost-effective model (gpt-4o-mini)
- **Main model**: Match the model to task complexity
  - Simple tasks: gpt-4o-mini, gemini-2.0-flash
  - Complex reasoning: gpt-4o, claude-sonnet-4-6
  - Code tasks: claude-sonnet-4-6 (large context)

**Tool Configuration:**
- Start minimal (read_file, write_file)
- Add tools progressively based on needs (e.g. `run_code`, `grep`, `google_search`, `browser`)
- Document tool usage in the system_prompt

**Parameters:**
- **max_tokens**: per-step context budget (default 128000)
- **max_steps**: bound the number of steps (e.g. 5 simple, 10 standard, 20 complex)

## Testing Agents

### Validate a Config

```bash
nodetool agent test your-agent.yaml
```

This reports a missing `model.provider`/`model.id`, lists the resolved tools, and warns about unknown tool names.

### Quick Run

```bash
nodetool agent run your-agent.yaml --objective "Simple test task"
```

### Automated Testing

```bash
# Test multiple objectives
for objective in "Test 1" "Test 2" "Test 3"; do
  nodetool agent run your-agent.yaml --objective "$objective"
done
```

## Documentation

For complete documentation, see:

- [Agent CLI Documentation](../../agent-cli.md) — Complete reference
- [Global Chat & Agents](../../global-chat-agents.md) — Agent system overview
- [NodeTool CLI](../../cli.md) — Full CLI reference

## Troubleshooting

### Agent doesn't complete tasks

**Solution:** Increase `max_steps` or improve `system_prompt` specificity.

```yaml
max_steps: 20  # Allow more steps
```

### Tool errors

**Solution:** Verify the tool name against the available tools list. Unknown names are ignored with a warning;
`nodetool agent test` reports them.

### Rate limiting

**Solution:** Use a local model.

```yaml
model:
  provider: ollama
  id: llama3.2:3b
```

### Performance issues

**Solution:** Use a faster model for planning.

```yaml
planning_agent:
  model:
    provider: openai
    id: gpt-4o-mini
```

## Contributing

To add new example configurations:

1. Create a descriptive YAML file (e.g., `data-analyst.yaml`)
2. Include a detailed system_prompt with clear instructions
3. Choose an appropriate model and tools
4. Validate with `nodetool agent test`, then run with sample objectives
5. Update this README with the new example
6. Submit a pull request

## License

These examples are provided under the same license as NodeTool (AGPL-3.0).
