# Agent CLI Implementation Guide

This document provides implementation guidance for the `nodetool agent` command that should be added to nodetool-core.

## Overview

The `nodetool agent` command runs autonomous AI agents from start to finish using YAML configuration files. Agents use the planning agent architecture to break down tasks, execute them step-by-step, and achieve goals through tool usage and iterative refinement.

## Command Specification

### Command Syntax

```bash
nodetool agent --config FILE [OPTIONS]
```

### Required Arguments

- `--config FILE` — Path to agent YAML configuration file

### Optional Arguments

**Prompt Input:**
- `--prompt TEXT` — Inline prompt for the agent to execute
- `--prompt-file FILE` — Load prompt from a text file
- `--interactive` / `-i` — Start interactive session with the agent

**Configuration Overrides:**
- `--workspace DIR` — Override workspace directory from config
- `--max-iterations N` — Override maximum planning iterations from config

**Output Options:**
- `--output FILE` — Save agent output to file
- `--jsonl` — Output in JSONL format for automation
- `--verbose` / `-v` — Enable DEBUG-level logging

### Interactive Mode Commands

When running with `--interactive`, support these commands:

- `/help` — Show available commands
- `/workspace` — Show workspace path and files
- `/tools` — List available tools
- `/config` — Show current configuration
- `/clear` — Clear conversation history
- `/save [file]` — Save conversation to file
- `/exit` — Exit interactive session

## YAML Configuration Schema

### Required Fields

```yaml
name: string                    # Agent identifier
system_prompt: string           # Agent behavior instructions (multiline)
model:                          # Primary model configuration
  provider: string              # AI provider name (required)
  id: string                    # Model identifier (required)
  name: string                  # Display name (optional)
planning_agent:                 # Planning agent configuration
  enabled: true                 # Must be true (required)
  model:                        # Planning model (required)
    provider: string
    id: string
    name: string                # Optional
```

### Optional Fields

```yaml
description: string             # Human-readable description
tools: list[string]             # Available tool names
max_tokens: integer             # Maximum response length (default: 8192)
context_window: integer         # Context window size (default: 8192)
temperature: float              # Response randomness 0.0-1.0 (default: 0.7)
max_iterations: integer         # Maximum planning cycles (default: 10)
workspace:                      # Workspace configuration
  path: string                  # Workspace directory
  auto_create: boolean          # Create if doesn't exist (default: true)
```

## Implementation Requirements

### 1. Configuration Loading

```python
import yaml
from pathlib import Path
from typing import Dict, Any, Optional

class AgentConfig:
    """Agent configuration loaded from YAML."""
    
    def __init__(self, config_path: Path):
        with open(config_path) as f:
            self.config = yaml.safe_load(f)
        self.validate()
    
    def validate(self):
        """Validate required fields."""
        required = ['name', 'system_prompt', 'model', 'planning_agent']
        for field in required:
            if field not in self.config:
                raise ValueError(f"Missing required field: {field}")
        
        # Validate model configuration
        if 'provider' not in self.config['model']:
            raise ValueError("model.provider is required")
        if 'id' not in self.config['model']:
            raise ValueError("model.id is required")
        
        # Validate planning agent
        pa = self.config['planning_agent']
        if not pa.get('enabled', False):
            raise ValueError("planning_agent.enabled must be true")
        if 'model' not in pa:
            raise ValueError("planning_agent.model is required")
    
    def get_workspace_path(self) -> Path:
        """Get workspace path with defaults."""
        workspace = self.config.get('workspace', {})
        path = workspace.get('path')
        if not path:
            # Default to ~/.nodetool-workspaces/<agent-name>
            path = Path.home() / '.nodetool-workspaces' / self.config['name']
        else:
            path = Path(path).expanduser()
        
        if workspace.get('auto_create', True):
            path.mkdir(parents=True, exist_ok=True)
        
        return path
```

### 2. Planning Agent Integration

The agent ALWAYS uses the planning agent architecture:

```python
from nodetool.agents import PlanningAgent

class AgentRunner:
    """Runs an agent with planning."""
    
    def __init__(self, config: AgentConfig):
        self.config = config
        self.workspace = config.get_workspace_path()
        
        # Create planning agent
        planning_model = config.config['planning_agent']['model']
        self.planner = PlanningAgent(
            model=self.get_model(planning_model),
            max_iterations=config.config.get('max_iterations', 10)
        )
        
        # Create main agent
        main_model = config.config['model']
        self.agent = self.create_agent(
            model=self.get_model(main_model),
            system_prompt=config.config['system_prompt'],
            tools=config.config.get('tools', []),
            workspace=self.workspace
        )
    
    async def run(self, prompt: str) -> str:
        """Run agent with planning."""
        # Planning phase
        plan = await self.planner.create_plan(prompt)
        
        # Execution phase
        result = await self.execute_plan(plan)
        
        return result
```

### 3. Tool Registry

Support for standard tools:

```python
STANDARD_TOOLS = {
    # File Operations
    'write_file': WriteFileTool,
    'read_file': ReadFileTool,
    'list_directory': ListDirectoryTool,
    'delete_file': DeleteFileTool,
    
    # Web Research
    'google_search': GoogleSearchTool,
    'browser': BrowserTool,
    
    # Code Execution
    'execute_code': ExecuteCodeTool,
    'terminal': TerminalTool,
    
    # Additional
    'grep': GrepTool,
    'image_generation': ImageGenerationTool,
    'audio_generation': AudioGenerationTool,
    'video_generation': VideoGenerationTool,
}

def load_tools(tool_names: list[str], workspace: Path) -> list[Tool]:
    """Load tools by name."""
    tools = []
    for name in tool_names:
        if name not in STANDARD_TOOLS:
            raise ValueError(f"Unknown tool: {name}")
        tool_class = STANDARD_TOOLS[name]
        tools.append(tool_class(workspace=workspace))
    return tools
```

### 4. Output Formats

#### Standard Output (Human-Readable)

```
[Planning] Breaking down task into 3 steps...
[Step 1/3] Searching for information...
[Tool: google_search] Found 5 relevant results
[Step 2/3] Analyzing results...
[Step 3/3] Generating summary...

Final Output:
[Agent response here]
```

#### JSONL Output (Machine-Readable)

```json
{"type":"planning","step":1,"total":3,"description":"Searching for information"}
{"type":"tool","name":"google_search","status":"success","results":5}
{"type":"planning","step":2,"total":3,"description":"Analyzing results"}
{"type":"planning","step":3,"total":3,"description":"Generating summary"}
{"type":"output","content":"[Agent response here]"}
{"type":"complete","status":"success","iterations":3}
```

### 5. Interactive Mode

```python
class InteractiveSession:
    """Interactive agent session."""
    
    COMMANDS = {
        '/help': 'show_help',
        '/workspace': 'show_workspace',
        '/tools': 'list_tools',
        '/config': 'show_config',
        '/clear': 'clear_history',
        '/save': 'save_conversation',
        '/exit': 'exit_session',
    }
    
    async def run(self):
        """Run interactive session."""
        self.print_welcome()
        
        while True:
            try:
                user_input = input("> ")
                
                if user_input.startswith('/'):
                    command = user_input.split()[0]
                    if command in self.COMMANDS:
                        method = getattr(self, self.COMMANDS[command])
                        await method(user_input)
                    else:
                        print(f"Unknown command: {command}")
                        print("Type /help for available commands")
                else:
                    # Regular prompt
                    result = await self.agent.run(user_input)
                    print(result)
                    
            except KeyboardInterrupt:
                print("\nUse /exit to quit")
            except Exception as e:
                print(f"Error: {e}")
```

### 6. CLI Integration

Add to nodetool CLI (in nodetool-core):

```python
import click

@click.command()
@click.option('--config', required=True, type=click.Path(exists=True),
              help='Path to agent YAML configuration file')
@click.option('--prompt', type=str,
              help='Inline prompt for the agent')
@click.option('--prompt-file', type=click.Path(exists=True),
              help='Load prompt from file')
@click.option('--interactive', '-i', is_flag=True,
              help='Start interactive session')
@click.option('--workspace', type=click.Path(),
              help='Override workspace directory')
@click.option('--max-iterations', type=int,
              help='Override maximum iterations')
@click.option('--output', type=click.Path(),
              help='Save output to file')
@click.option('--jsonl', is_flag=True,
              help='Output in JSONL format')
@click.option('--verbose', '-v', is_flag=True,
              help='Enable debug logging')
def agent(config, prompt, prompt_file, interactive, workspace,
          max_iterations, output, jsonl, verbose):
    """Run an autonomous AI agent with YAML configuration."""
    
    if verbose:
        logging.basicConfig(level=logging.DEBUG)
    
    # Load configuration
    agent_config = AgentConfig(Path(config))
    
    # Apply overrides
    if workspace:
        agent_config.config['workspace'] = {'path': workspace}
    if max_iterations:
        agent_config.config['max_iterations'] = max_iterations
    
    # Create agent runner
    runner = AgentRunner(agent_config)
    
    # Determine mode
    if interactive:
        session = InteractiveSession(runner)
        asyncio.run(session.run())
    else:
        # Get prompt
        if prompt_file:
            with open(prompt_file) as f:
                prompt = f.read()
        elif prompt:
            pass
        else:
            raise click.UsageError(
                "Either --prompt or --prompt-file required for non-interactive mode"
            )
        
        # Run agent
        result = asyncio.run(runner.run(prompt))
        
        # Output result
        if output:
            with open(output, 'w') as f:
                f.write(result)
        else:
            print(result)
```

## Testing

### Unit Tests

1. **Configuration Loading:**
   - Valid YAML parsing
   - Required field validation
   - Default value handling
   - Workspace path resolution

2. **Tool Loading:**
   - Tool registry lookup
   - Tool initialization with workspace
   - Unknown tool error handling

3. **Output Formatting:**
   - Standard output formatting
   - JSONL output formatting
   - File output writing

### Integration Tests

1. **Basic Agent Run:**
   - Load config, run simple prompt
   - Verify output
   - Check workspace files created

2. **Planning Agent:**
   - Multi-step task execution
   - Tool usage
   - Iteration limits

3. **Interactive Mode:**
   - Command handling
   - Multi-turn conversation
   - State persistence

### Example Tests

```python
def test_config_loading():
    """Test YAML configuration loading."""
    config = AgentConfig(Path('tests/fixtures/minimal.yaml'))
    assert config.config['name'] == 'minimal-agent'
    assert 'system_prompt' in config.config
    assert config.config['planning_agent']['enabled'] is True

def test_missing_required_field():
    """Test validation of required fields."""
    with pytest.raises(ValueError, match="Missing required field"):
        config = AgentConfig(Path('tests/fixtures/invalid.yaml'))

async def test_agent_run():
    """Test basic agent execution."""
    config = AgentConfig(Path('tests/fixtures/minimal.yaml'))
    runner = AgentRunner(config)
    result = await runner.run("What is 2+2?")
    assert result is not None
    assert len(result) > 0
```

## Security Considerations

1. **Workspace Isolation:**
   - All file operations restricted to workspace directory
   - Validate file paths to prevent directory traversal
   - Set appropriate file permissions

2. **Tool Restrictions:**
   - Only enable necessary tools
   - Sandbox code execution
   - Rate limit external API calls

3. **API Key Security:**
   - Load from environment variables
   - Never log API keys
   - Use encrypted storage when possible

## Performance Optimization

1. **Model Selection:**
   - Use fast models for planning (gpt-4o-mini)
   - Use powerful models for complex reasoning
   - Consider cost vs performance tradeoffs

2. **Caching:**
   - Cache model responses when appropriate
   - Reuse tool results
   - Cache file reads

3. **Streaming:**
   - Stream LLM responses
   - Show progress indicators
   - Allow early termination

## Documentation Generated

This implementation guide is based on the following documentation files created in this PR:

1. **[agent-cli.md](../agent-cli.md)** — Complete user documentation
2. **[agent-config-schema.md](../agent-config-schema.md)** — YAML schema reference
3. **[examples/agents/README.md](../examples/agents/README.md)** — Example usage
4. **Example YAML files:**
   - [research-agent.yaml](../examples/agents/research-agent.yaml)
   - [code-assistant.yaml](../examples/agents/code-assistant.yaml)
   - [content-creator.yaml](../examples/agents/content-creator.yaml)
   - [minimal.yaml](../examples/agents/minimal.yaml)

## Related Documentation

- [CLI Documentation](../cli.md) — Main CLI reference
- [Global Chat & Agents](../global-chat-agents.md) — Agent system overview
- [Chat CLI](../chat-cli.md) — Interactive chat interface
- [Cookbook](../cookbook.md) — Workflow patterns and examples

## Implementation Checklist

- [ ] Create `AgentConfig` class for YAML loading and validation
- [ ] Implement planning agent integration
- [ ] Create tool registry and loader
- [ ] Implement `AgentRunner` class
- [ ] Add output formatters (standard and JSONL)
- [ ] Implement interactive mode with commands
- [ ] Add CLI command to Click/Typer command group
- [ ] Write unit tests for configuration
- [ ] Write integration tests for agent execution
- [ ] Add example configurations to package
- [ ] Update CLI help text
- [ ] Add to main CLI documentation
