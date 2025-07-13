---
layout: default
title: Global Chat
---

# Global Chat

Global Chat is NodeTool's powerful AI assistant interface that lets you interact with AI models from anywhere in the application. It provides a full-featured chat experience with advanced capabilities including autonomous agents, specialized tools, and workflow integration.

## Overview

Global Chat transforms NodeTool into a comprehensive AI workspace where you can:
- Chat with various AI models (OpenAI, Anthropic, Google, local models)
- Use specialized tools for web search, image generation, and more
- Enable autonomous agents that can plan and execute complex tasks
- Integrate with your workflows and assets seamlessly
- Manage multiple conversation threads

## Getting Started

### Opening Global Chat
- **From Dashboard**: Click the **Chat** icon in the left sidebar
- **From Recent Threads**: Select a conversation from your Dashboard
- **Quick Access**: Use the keyboard shortcut or system tray

### Interface Layout
The Global Chat interface consists of:
- **Thread List**: Left sidebar showing all your conversations
- **Chat View**: Main conversation area with message history
- **Input Area**: Message composer with tools and model selection
- **Control Panel**: Model selection, tools, and settings

## Thread Management

### Creating and Managing Threads
- **New Thread**: Click **New Chat** to start a fresh conversation
- **Thread Switching**: Click any thread in the sidebar to switch
- **Auto-Naming**: Threads are automatically named from your first message
- **Thread Deletion**: Use the delete button to remove unwanted threads
- **Thread Persistence**: All threads are saved and synced across sessions

### Thread Features
- **Message History**: Complete conversation history with timestamps
- **Rich Content**: Support for text, images, audio, and video messages
- **Search**: Find specific messages within threads
- **Export**: Save conversation history for external use

## AI Models and Providers

### Model Selection
Global Chat supports multiple AI providers and a comprehensive range of models:

#### Anthropic Models
- **Claude 3.5 Haiku**: Fast, efficient model for everyday tasks
- **Claude 3.5 Sonnet**: Balanced model for complex reasoning
- **Claude 3.7 Sonnet**: Advanced reasoning capabilities
- **Claude Sonnet 4**: Next-generation reasoning model
- **Claude Opus 4**: Premium model for the most complex tasks

#### Google Gemini Models
- **Gemini 2.5 Pro Experimental**: Cutting-edge experimental model
- **Gemini 2.5 Flash**: Fast, efficient multimodal model
- **Gemini 2.0 Flash**: Optimized for speed and efficiency
- **Gemini 2.0 Flash Lite**: Lightweight version for basic tasks
- **Gemini 2.0 Flash Exp Image Generation**: Specialized for image generation

#### OpenAI Models
- **GPT-4o**: Advanced multimodal model with vision capabilities
- **GPT-4o Audio**: Enhanced with audio processing capabilities
- **GPT-4o Mini**: Efficient version of GPT-4o
- **GPT-4o Mini Audio**: Compact model with audio support
- **ChatGPT-4o**: Conversational variant of GPT-4o
- **GPT-4.1**: Latest reasoning model
- **GPT-4.1 Mini**: Efficient version of GPT-4.1
- **O4 Mini**: Specialized reasoning model
- **Codex Mini**: Code-focused model for programming tasks

#### Hugging Face Models
NodeTool now supports Hugging Face Inference Providers, giving you access to cutting-edge open-source models:

- **SmolLM3 3B**: Compact, efficient language model
- **DeepSeek V3 0324**: Advanced reasoning and code generation
- **DeepSeek TNG R1T2 Chimera**: Hybrid reasoning model
- **DeepSeek R1**: Latest DeepSeek reasoning model
- **DeepSeek R1 Distill Qwen 1.5B**: Distilled version for efficiency
- **Hunyuan A13B Instruct**: Tencent's instruction-tuned model
- **DeepSWE Preview**: Specialized for software engineering tasks
- **Gemma 2 2B IT**: Google's efficient instruction-tuned model
- **Meta Llama 3.1 8B Instruct**: Meta's powerful instruction model
- **Phi 4**: Microsoft's latest compact model
- **Qwen 2.5 7B Instruct 1M**: Extended context length model
- **Qwen 2.5 Coder 32B Instruct**: Code-specialized model
- **Qwen 2.5 VL 7B Instruct**: Vision-language model

#### Hugging Face Groq Models
High-performance models optimized for speed through Groq's inference infrastructure:

- **Meta Llama 3 70B Instruct**: Large-scale instruction model
- **Llama 3.3 70B Instruct**: Enhanced version with improved capabilities
- **Llama Guard 4 12B**: Safety and content moderation model
- **Llama 4 Scout 17B 16E Instruct**: Preview of next-generation Llama
- **Llama 4 Maverick 17B 128E Instruct**: Extended context Llama 4 variant

#### Hugging Face Cerebras Models
Models optimized for Cerebras' specialized hardware:

- **Cerebras GPT 2.5 12B Instruct**: Cerebras' proprietary model
- **Llama 3.3 70B Instruct**: Optimized for Cerebras hardware
- **Llama 4 Scout 17B 16E Instruct**: Next-gen Llama on Cerebras

#### Local Models
- **Ollama**: Run models locally with Ollama
- **Hugging Face Transformers**: Local inference of Hugging Face models
- **Custom Endpoints**: Connect to your own model servers

### Provider Benefits

#### Cloud Providers
- **Anthropic**: Industry-leading reasoning and safety
- **Google**: Advanced multimodal capabilities
- **OpenAI**: Cutting-edge language and vision models

#### Hugging Face Ecosystem
- **Open Source**: Access to the latest open-source models
- **Cost Effective**: Often more economical than proprietary models
- **Specialized Models**: Domain-specific models for coding, vision, etc.
- **Rapid Innovation**: Access to newest research developments
- **Multiple Inference Backends**: Choose optimal hardware (standard, Groq, Cerebras)

#### Local Deployment
- **Privacy**: Complete data control and privacy
- **No API Costs**: One-time setup with no ongoing fees
- **Offline Capability**: Work without internet connection
- **Customization**: Fine-tune models for specific use cases

### Model Configuration
- **API Keys**: Manage credentials for cloud providers
- **Model Parameters**: Adjust temperature, max tokens, and other settings
- **Provider Settings**: Configure rate limits and usage preferences
- **Model Switching**: Change models mid-conversation
- **Fallback Options**: Automatic fallback to alternative models
- **Usage Monitoring**: Track costs and performance across providers

## Tools and Capabilities

Global Chat provides access to a comprehensive set of tools that extend AI capabilities:

### Search Tools
- **Google Search**: Search the web for current information
- **Google News**: Find recent news articles and updates
- **Google Images**: Search for images and visual content
- **Google Lens**: Visual search and image analysis
- **Google Maps**: Location search and directions
- **Google Shopping**: Product search and comparison
- **Google Finance**: Financial data and market information
- **Google Jobs**: Job listings and career information
- **Email Search**: Search through your email content
- **Document Search**: Search your uploaded documents and knowledge base

### Generation Tools
- **Image Generation**: Create images using OpenAI DALL-E or Google models
- **Text-to-Speech**: Convert text to natural-sounding audio
- **Workflow Generation**: Create NodeTool workflows from descriptions

### Utility Tools
- **Web Browser**: Browse websites and extract information
- **File Processing**: Analyze and process uploaded files
- **Data Extraction**: Extract structured data from various sources

### Tool Selection
- **Tool Selector**: Choose which tools to enable for your conversation
- **Tool Categories**: Organized by Search, Generation, and Utility
- **Tool Descriptions**: Detailed information about each tool's capabilities
- **Tool Feedback**: See when tools are being used and their results

## Agent Mode

### What is Agent Mode?
Agent Mode transforms the AI into an autonomous agent that can:
- **Plan Complex Tasks**: Break down requests into manageable steps
- **Use Tools Autonomously**: Decide when and how to use available tools
- **Execute Multi-Step Workflows**: Complete complex tasks requiring multiple actions
- **Reason About Results**: Analyze outcomes and adjust strategies

### Agent Capabilities
When Agent Mode is enabled, the AI can:
- **Web Research**: Conduct comprehensive research using multiple search tools
- **Content Creation**: Generate and refine content using various tools
- **Problem Solving**: Work through complex problems step by step
- **Task Management**: Organize and execute multi-faceted projects

### Agent Planning
The agent uses sophisticated planning to:
- **Break Down Tasks**: Divide complex requests into subtasks
- **Sequence Operations**: Determine the optimal order of actions
- **Handle Dependencies**: Manage task relationships and prerequisites
- **Adapt to Results**: Modify plans based on intermediate outcomes

### Planning Updates
During agent execution, you'll see:
- **Current Plan**: The agent's overall strategy
- **Active Task**: What the agent is currently working on
- **Progress Updates**: Real-time status of task execution
- **Reasoning**: The agent's thought process and decision-making

## Help Mode

### Understanding AI Reasoning
Enable Help Mode to get insights into:
- **Decision Process**: Why the AI chose specific actions
- **Tool Selection**: Reasoning behind tool usage
- **Response Generation**: How the AI formulated its answers
- **Error Handling**: How the AI addresses issues or limitations

### Learning and Improvement
Help Mode helps you:
- **Understand Capabilities**: Learn what the AI can and cannot do
- **Improve Prompts**: Craft better requests for optimal results
- **Debug Issues**: Identify and resolve conversation problems
- **Optimize Workflows**: Better integrate AI into your processes

## Workflow Integration

### Workflow Assistant
Global Chat can help with your NodeTool workflows:
- **Workflow Creation**: Generate workflows from natural language descriptions
- **Workflow Editing**: Modify existing workflows through conversation
- **Workflow Explanation**: Understand how workflows operate
- **Workflow Debugging**: Identify and fix workflow issues

### Asset Integration
- **Asset Upload**: Drag and drop files directly into chat
- **Asset Analysis**: Analyze images, documents, and other media
- **Asset Processing**: Use assets as input for AI operations
- **Asset Generation**: Create new assets through AI tools

## Message Types and Rich Content

### Text Messages
- **Formatted Text**: Support for markdown and rich text formatting
- **Code Blocks**: Syntax highlighting for programming languages
- **Mathematical Expressions**: LaTeX rendering for equations
- **Links and References**: Clickable links and citations

### Multimedia Messages
- **Images**: Upload, analyze, and generate images
- **Audio**: Record voice messages and generate speech
- **Video**: Upload and analyze video content
- **Documents**: PDF, Word, and other document formats

### Interactive Elements
- **Buttons and Actions**: Interactive UI elements within messages
- **Workflow Links**: Direct links to generated workflows
- **Tool Results**: Structured display of tool outputs
- **Progress Indicators**: Real-time feedback during operations

## Connection and Sync

### WebSocket Connection
Global Chat uses WebSocket for real-time communication:
- **Live Updates**: Instant message delivery and responses
- **Connection Status**: Clear indicators of connection health
- **Automatic Reconnection**: Seamless reconnection after network issues
- **Offline Support**: Queue messages when offline

### Sync Across Devices
- **Cloud Sync**: Conversations sync across all your devices
- **Real-time Updates**: See new messages instantly on all devices
- **Conflict Resolution**: Intelligent handling of simultaneous edits
- **Backup and Restore**: Automatic backup of all conversations

## Advanced Features

### Conversation Management
- **Thread Organization**: Group related conversations
- **Conversation Search**: Find specific messages across all threads
- **Conversation Export**: Export chat history in various formats
- **Conversation Sharing**: Share conversations with team members

### Customization
- **Chat Themes**: Customize the appearance of the chat interface
- **Keyboard Shortcuts**: Personalize hotkeys for common actions
- **Notification Settings**: Control when and how you're notified
- **Auto-Save**: Automatic saving of message drafts

### Performance Optimization
- **Message Caching**: Efficient storage and retrieval of messages
- **Lazy Loading**: Load messages on demand for better performance
- **Compression**: Optimize message storage and transfer
- **Rate Limiting**: Respect API limits and optimize usage

## Privacy and Security

### Data Protection
- **Local Storage**: Conversations can be stored locally
- **Encryption**: End-to-end encryption for sensitive conversations
- **Access Control**: Control who can access your conversations
- **Data Retention**: Configurable message retention policies

### API Key Management
- **Secure Storage**: Encrypted storage of API credentials
- **Key Rotation**: Support for regular key updates
- **Usage Monitoring**: Track API usage and costs
- **Permission Control**: Granular control over AI capabilities

## Troubleshooting

### Common Issues
- **Connection Problems**: Check network and WebSocket status
- **Model Errors**: Verify API keys and model availability
- **Tool Failures**: Check tool configuration and permissions
- **Performance Issues**: Monitor resource usage and optimize settings

### Error Handling
- **Graceful Degradation**: Fallback options when features fail
- **Error Messages**: Clear, actionable error descriptions
- **Recovery Options**: Ways to recover from errors
- **Support Resources**: Links to help and documentation

## Best Practices

### Effective Prompting
- **Be Specific**: Provide clear, detailed instructions
- **Use Context**: Reference previous messages and shared knowledge
- **Iterate**: Refine your requests based on results
- **Combine Tools**: Use multiple tools for complex tasks

### Agent Optimization
- **Clear Goals**: Define specific, measurable objectives
- **Provide Context**: Give the agent relevant background information
- **Monitor Progress**: Watch planning updates and guide when needed
- **Review Results**: Validate agent outputs and provide feedback

### Workflow Integration
- **Start Simple**: Begin with basic workflows and add complexity
- **Document Requirements**: Clearly specify workflow needs
- **Test Thoroughly**: Validate generated workflows before use
- **Iterate**: Refine workflows through conversation

Global Chat is designed to be your intelligent AI companion throughout your NodeTool experience. Whether you're brainstorming ideas, researching topics, creating content, or building workflows, Global Chat provides the tools and intelligence to help you work more effectively.
