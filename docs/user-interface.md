______________________________________________________________________

## layout: default title: User Interface

# NodeTool User Interface

The NodeTool interface is designed to be intuitive and powerful, providing easy access to all features while maintaining
a clean, modern design. This guide covers all the major UI components and how to use them effectively.

## Main Interface Layout

### Dashboard

The Dashboard is your starting point in NodeTool. It provides:

- **Recent Workflows**: Quick access to your most recent work
- **Chat History**: Access to your Global Chat conversations
- **Quick Actions**: Create new workflows, import templates, or browse examples
- **System Status**: Connection status and resource usage

### Left Sidebar

The left sidebar contains the main navigation:

- **Workflows**: Your saved workflows
- **Chat Conversations**: Your past chat conversations
- **Asset Explorer**: Browse and manage your files

### Main Content Area

The central area adapts based on your current activity:

- **Workflow Canvas**: Visual node editor with drag-and-drop functionality
- **Chat Interface**: Full-screen chat with AI agents
- **Asset Browser**: File management and preview
- **Model Downloads**: Model installation and management

## Workflow Editor

### Node Canvas

The main workflow editing area where you build your AI workflows:

- **Infinite Canvas**: Pan and zoom to work with large workflows
- **Grid Snapping**: Align nodes precisely with optional grid snap
- **Background**: Clean, minimal design to focus on your workflow
- **Context Menus**: Right-click nodes and edges for quick actions

### Node Menu

A searchable library of all available nodes:

- **Search**: Find nodes by name, category, or functionality
- **Categories**: Organized by AI providers, data types, and operations
- **Drag & Drop**: Drag nodes directly onto the canvas
- **Documentation**: Hover tooltips with node descriptions

### Node Properties

The properties panel shows details for selected nodes:

- **Input Fields**: Configure node parameters and settings
- **Output Preview**: See node results in real-time
- **Documentation**: Help text and usage examples
- **Validation**: Real-time error checking and suggestions

### Connection System

Visual connections between nodes:

- **Drag to Connect**: Drag from output to input sockets
- **Type Validation**: Automatic type checking for connections
- **Visual Feedback**: Color-coded connections by data type
- **Auto-Layout**: Automatic routing to avoid overlaps

## Global Chat Interface

### Chat View

The main chat interface for AI conversations:

- **Message History**: Scrollable conversation history
- **Real-time Updates**: Live streaming of AI responses
- **Rich Content**: Support for text, images, audio, and video
- **Thread Management**: Multiple conversation threads

### Chat Composer

The input area for sending messages:

- **Text Input**: Rich text editor with formatting support
- **File Attachments**: Drag and drop files directly
- **Voice Input**: Record audio messages (when supported)
- **Send Controls**: Send button and keyboard shortcuts

### Tool and Model Selection

Configure your AI interactions:

- **Model Selector**: Choose from available AI models
- **Tools Panel**: Enable specific AI tools and capabilities
- **Agent Mode**: Toggle autonomous agent behavior
- **Help Mode**: Get explanations of AI reasoning

## Asset Management

### Asset Explorer

Browse and manage your files:

- **File Browser**: Navigate folders and collections
- **Preview Panel**: View images, videos, and documents
- **Upload Area**: Drag and drop files to upload
- **Search and Filter**: Find assets by name, type, or date

### Asset Grid

Visual grid view of your assets:

- **Thumbnail View**: Preview images and videos
- **Metadata**: File size, type, and creation date
- **Selection**: Multi-select for batch operations
- **Context Actions**: Right-click for asset operations

### Asset Viewer

Full-screen asset preview:

- **Zoom and Pan**: Inspect images and documents closely
- **Playback Controls**: Play audio and video files
- **Metadata Panel**: Detailed file information
- **Edit Actions**: Basic editing and annotation tools

## Models Manager

### Model Library

Browse available AI models from multiple providers:

- **OpenAI Models**: GPT-4o, GPT-4.1, and specialized variants
- **Anthropic Models**: Claude 3.5 Haiku, Sonnet, and Claude 4 series
- **Google Models**: Gemini 2.0 and 2.5 series with multimodal capabilities
- **Hugging Face Models**: Extensive open-source model catalog
- **Hugging Face Groq**: High-performance models optimized for speed
- **Hugging Face Cerebras**: Models optimized for specialized hardware
- **MLX**: Models optimized for Apple Silicon
- **Llama.cpp**: Models optimized for local execution
- **Search**: Find models by name, provider, or capability
- **Filters**: Filter by model type, size, or requirements

### Download Manager

Manage model downloads:

- **Download Queue**: See pending and active downloads
- **Progress Tracking**: Real-time download progress
- **Storage Usage**: Monitor disk space consumption
- **Download History**: View completed downloads

### Model Configuration

Configure model settings:

- **Parameters**: Adjust model behavior and performance
- **API Keys**: Manage credentials for cloud providers (OpenAI, Anthropic, Google, Hugging Face)
- **Local Models**: Configure locally installed models
- **Provider Settings**: Configure inference backends and endpoints
- **Usage Statistics**: Monitor model performance and costs

## Panel System

### Resizable Panels

All panels can be resized for optimal workflow:

- **Drag Borders**: Resize panels by dragging edges
- **Collapse/Expand**: Hide panels when not needed
- **Panel Memory**: Sizes are remembered between sessions
- **Responsive Design**: Adapts to different screen sizes

### Panel Management

Control panel visibility:

- **View Menu**: Toggle panel visibility
- **Keyboard Shortcuts**: Quick panel access
- **Panel Settings**: Configure default layouts
- **Workspace Modes**: Preset layouts for different tasks

## Keyboard Shortcuts

### General Navigation

- **Ctrl/Cmd + N**: New workflow
- **Ctrl/Cmd + O**: Open workflow
- **Ctrl/Cmd + S**: Save workflow
- **Ctrl/Cmd + Z**: Undo
- **Ctrl/Cmd + Y**: Redo

### Workflow Editor

- **Space + Drag**: Pan canvas
- **Ctrl/Cmd + Scroll**: Zoom in/out
- **Ctrl/Cmd + 0**: Fit to view
- **Delete**: Delete selected nodes
- **Ctrl/Cmd + C**: Copy nodes
- **Ctrl/Cmd + V**: Paste nodes
- **Ctrl/Cmd + D**: Duplicate nodes

### Chat Interface

- **Enter**: Send message
- **Shift + Enter**: New line
- **Ctrl/Cmd + K**: Clear chat
- **Ctrl/Cmd + /**: Toggle tools
- **Escape**: Stop generation

## Themes and Customization

### Theme Selection

Choose your preferred visual style:

- **Dark Theme**: Default dark mode for extended use
- **Light Theme**: Clean light mode for bright environments
- **System Theme**: Follow system preferences
- **Custom Themes**: Create and share custom color schemes

### Interface Customization

Personalize your workspace:

- **Panel Layout**: Arrange panels to suit your workflow
- **Toolbar Configuration**: Choose which tools to display
- **Keyboard Shortcuts**: Customize hotkeys
- **Grid Settings**: Adjust grid size and visibility

## Status and Feedback

### Connection Status

Monitor your connections:

- **WebSocket Status**: Real-time connection indicator
- **Model Status**: AI model availability and health
- **Sync Status**: Workflow synchronization state
- **Error Notifications**: Clear error messages and solutions

### Progress Indicators

Track long-running operations:

- **Workflow Execution**: Node-by-node progress
- **File Uploads**: Upload progress and completion
- **Model Downloads**: Download progress and speed
- **Generation Progress**: AI response generation status

## Responsive Design

### Mobile Support

NodeTool works across devices:

- **Responsive Layout**: Adapts to different screen sizes
- **Touch Support**: Touch-friendly interactions
- **Mobile Navigation**: Optimized navigation for small screens
- **Gesture Support**: Pinch to zoom, swipe to navigate

### Accessibility

Designed for all users:

- **Keyboard Navigation**: Full keyboard accessibility
- **Screen Reader Support**: ARIA labels and descriptions
- **High Contrast**: Support for high contrast themes
- **Focus Management**: Clear focus indicators

## Tips for Effective Use

### Workflow Organization

- Use clear naming conventions for nodes and workflows
- Group related nodes together
- Add comments and documentation to complex workflows
- Use collections to organize related assets

### Performance Tips

- Close unused panels to improve performance
- Use preview mode for large workflows
- Optimize image and video assets before upload
- Monitor resource usage in the status bar

### Collaboration

- Share workflows with descriptive names and documentation
- Use consistent asset organization across team members
- Export workflows for version control
- Document workflow requirements and dependencies

This comprehensive interface guide covers all major aspects of the NodeTool UI. For specific feature documentation,
refer to the dedicated guides for each component.
