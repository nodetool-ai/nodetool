---
layout: page
title: "Mobile App"
description: "Run NodeTool Mini Apps and AI Chat on iOS and Android."
---

Use NodeTool on your mobile device. The mobile app lets you run Mini Apps and chat with AI assistants from anywhere.

> **New to NodeTool?** Start with the [Getting Started guide](getting-started.md) on desktop first.

---

## Overview

The NodeTool mobile app brings AI workflows to your phone and tablet:

| Feature | Description |
|---------|-------------|
| **AI Chat** | Real-time chat with AI models, streaming responses |
| **Mini Apps** | Run your workflows with a simple interface |
| **Cross-platform** | Works on iOS, Android, and web browsers |
| **Server Connection** | Connect to any NodeTool server |

---

## Getting the App

### From App Stores (Coming Soon)

The app will be available on:
- **iOS**: Apple App Store
- **Android**: Google Play Store

### For Developers

Build and run from source:

```bash
# Clone the NodeTool repository
git clone https://github.com/nodetool-ai/nodetool.git
cd nodetool/mobile

# Install dependencies
npm install

# Start the development server
npm start
```

Then:
- Press `i` for iOS Simulator (macOS only)
- Press `a` for Android Emulator
- Press `w` for web browser
- Scan the QR code with Expo Go on your phone

---

## Connecting to Your Server

The mobile app requires a running NodeTool server.

### Configure Server URL

1. Open the app
2. Go to **Settings** (gear icon)
3. Enter your server URL
4. Tap **Test Connection**
5. Save when successful

### Server URLs by Platform

| Platform | Server URL |
|----------|-----------|
| iOS Simulator | `http://localhost:7777` |
| Android Emulator | `http://10.0.2.2:7777` |
| Physical Device | `http://<your-computer-ip>:7777` |

> **Physical devices** must be on the same network as your NodeTool server.

---

## AI Chat

Chat with AI models from your mobile device.

### Features

- **Streaming responses** – See text appear in real-time
- **Model selection** – Choose from available AI models
- **Markdown rendering** – Code blocks, formatting, syntax highlighting
- **Stop generation** – Tap stop to cancel long responses
- **Multiple threads** – Keep separate conversation topics

### How to Chat

1. Tap the **Chat** icon in the header
2. Select a model (tap model name)
3. Type your message
4. Tap **Send**
5. Watch the AI respond in real-time

### Tips

- Use the **+** button to start a new conversation
- Tap **Stop** to halt long responses
- Scroll up to review conversation history
- Switch models mid-conversation if needed

---

## Mini Apps

Run your NodeTool workflows with a simplified mobile interface.

### What Are Mini Apps?

Mini Apps are workflows converted to simple interfaces. They hide the complexity of the workflow and show only:
- Input fields
- Run button
- Results

### Running a Mini App

1. Open the **Mini Apps** screen
2. Browse available apps
3. Tap an app to open it
4. Fill in the inputs:
   - **Text fields** – Type your input
   - **Number fields** – Enter values
   - **Toggle switches** – Enable/disable options
5. Tap **Run**
6. View results below

### Supported Input Types

| Type | Description |
|------|-------------|
| Text | Single or multi-line text input |
| Number | Numeric values |
| Boolean | On/off toggle switches |

---

## Server Requirements

Your NodeTool server must be:

1. **Running** – Start with `nodetool serve --port 7777`
2. **Accessible** – On same network as your device
3. **Configured** – With the models you want to use

### Starting the Server

```bash
# Activate environment
conda activate nodetool

# Start server
nodetool serve --port 7777
```

The server runs at `http://localhost:7777` by default.

### Firewall Settings

If connecting from a physical device, ensure:
- Port 7777 is open on your computer's firewall
- Your router allows local network connections
- Both devices are on the same WiFi network

---

## Troubleshooting

### Cannot Connect to Server

**Symptoms**: "Connection failed" or timeout errors

**Solutions**:
1. Verify the server is running
2. Check the server URL in Settings
3. For physical devices:
   - Use your computer's IP address (not localhost)
   - Ensure same WiFi network
   - Check firewall settings

### Android Emulator Connection Issues

**Problem**: Cannot reach localhost

**Solution**: Use `http://10.0.2.2:7777` instead of `localhost:7777`. This is Android's special IP for the host machine.

### App Crashes on Startup

**Solutions**:
1. Clear app data and restart
2. Check that all dependencies are installed: `npm install`
3. Reset Metro bundler: `npm start --reset-cache`

### Chat Not Streaming

**Symptoms**: Responses appear all at once

**Solutions**:
1. Check WebSocket connection
2. Verify server is running current version
3. Try a different AI model

---

## Platform Notes

### iOS

- Requires Xcode for development (macOS only)
- Use iOS Simulator for testing
- Production builds via EAS Build

### Android

- Requires Android Studio for development
- Use Android Emulator for testing
- Use `10.0.2.2` for localhost access

### Web

- Works in any modern browser
- Good for testing without mobile device
- Run with `npm run web`

---

## Building for Production

Use Expo's EAS Build for production apps:

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Build for Android
eas build --platform android --profile preview

# Build for iOS
eas build --platform ios --profile preview
```

For store submissions:
```bash
# Google Play Store (AAB format)
eas build --platform android --profile production

# Apple App Store
eas build --platform ios --profile production
```

> See [EAS Build Documentation](https://docs.expo.dev/build/introduction/) for details.

---

## Related Topics

- [Getting Started](getting-started.md) – Desktop setup and first workflow
- [User Interface](user-interface.md) – Full UI guide
- [Mini Apps](user-interface.md#mini-apps) – Creating Mini Apps
- [Global Chat](global-chat-agents.md) – Chat features in detail
- [API Reference](api-reference.md) – Server API documentation
