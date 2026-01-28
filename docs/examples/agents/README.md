# Agent Configuration Examples

This directory contains example YAML configuration files for the `nodetool agent` command.

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
nodetool agent \
  --config examples/agents/research-agent.yaml \
  --prompt "Research the latest developments in quantum computing"
```

### [code-assistant.yaml](code-assistant.yaml)

AI coding assistant for development tasks, debugging, and code review.

**Use cases:**
- Writing clean, efficient code
- Debugging and fixing issues
- Code refactoring and optimization
- Explaining complex code

**Tools:**
- File operations
- Code execution
- Terminal access
- File search (grep)

**Example:**
```bash
nodetool agent \
  --config examples/agents/code-assistant.yaml \
  --prompt "Create a Python script to parse CSV files and generate visualizations"
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
nodetool agent \
  --config examples/agents/content-creator.yaml \
  --prompt "Write a blog post about sustainable software development practices"
```

### [minimal.yaml](minimal.yaml)

Minimal agent configuration showing required fields only.

**Use cases:**
- Starting point for custom agents
- Simple task automation
- Testing agent functionality

**Example:**
```bash
nodetool agent \
  --config examples/agents/minimal.yaml \
  --prompt "Summarize the main features of NodeTool"
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

max_tokens: 8192
```

### Best Practices

1. **Start with minimal.yaml** and add complexity as needed
2. **Be specific in system_prompt** about expected behavior and workflow
3. **Choose appropriate models** for the task complexity and budget
4. **Enable only necessary tools** to reduce complexity and improve focus
5. **Set reasonable iteration limits** to prevent infinite loops
6. **Test incrementally** with simple prompts before complex tasks

### Configuration Tips

**System Prompt:**
- Clearly define the agent's role and responsibilities
- Include specific workflow steps
- Provide guidelines for tool usage
- Set expectations for output format and quality

**Model Selection:**
- **Planning agent**: Use fast, cost-effective models (gpt-4o-mini)
- **Main agent**: Match model to task complexity
  - Simple tasks: gpt-4o-mini, gemini-flash
  - Complex reasoning: gpt-4o, claude-3.5-sonnet
  - Code tasks: claude-3.5-sonnet (large context)
  - Creative tasks: gemini-2.0-flash, claude-3.5-sonnet

**Tool Configuration:**
- Start minimal (read_file, write_file)
- Add tools progressively based on needs
- Document tool usage in system_prompt

**Parameters:**
- **max_tokens**: 4096 (basic), 8192 (standard), 16384+ (complex)
- **temperature**: 0.0-0.3 (analytical), 0.7 (balanced), 0.9-1.0 (creative)
- **max_iterations**: 5-8 (simple), 10-15 (standard), 20+ (exploratory)

## Testing Agents

### Quick Test

```bash
nodetool agent --config your-agent.yaml --prompt "Simple test task"
```

### Interactive Testing

```bash
nodetool agent --config your-agent.yaml --interactive
```

This allows multi-turn conversations to test different scenarios.

### Automated Testing

```bash
# Test multiple prompts
for prompt in "Test 1" "Test 2" "Test 3"; do
  nodetool agent --config your-agent.yaml --prompt "$prompt" --jsonl
done
```

## Documentation

For complete documentation, see:

- [Agent CLI Documentation](../../agent-cli.md) — Complete reference
- [Global Chat & Agents](../../global-chat-agents.md) — Agent system overview
- [NodeTool CLI](../../cli.md) — Full CLI reference

## Troubleshooting

### Agent doesn't complete tasks

**Solution:** Increase max_iterations or improve system_prompt specificity

```yaml
max_iterations: 20  # Increase from default 10
```

### Tool errors

**Solution:** Verify tool is available and properly configured

```bash
nodetool agent --config agent.yaml --interactive
> /tools  # List available tools
```

### Rate limiting

**Solution:** Use local models or add retry logic

```yaml
model:
  provider: ollama
  id: llama3.2:3b  # Local model, no rate limits
```

### Performance issues

**Solution:** Use faster models for planning agent

```yaml
planning_agent:
  model:
    provider: openai
    id: gpt-4o-mini  # Fast and cost-effective
```

## Contributing

To add new example configurations:

1. Create a descriptive YAML file (e.g., `data-analyst.yaml`)
2. Include comprehensive system_prompt with clear instructions
3. Choose appropriate model and tools
4. Test thoroughly with various prompts
5. Update this README with the new example
6. Submit a pull request

## License

These examples are provided under the same license as NodeTool (AGPL-3.0).
