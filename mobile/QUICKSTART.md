# Quick Start Guide for NodeTool Mobile App

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Mobile Quick Start**

This guide will help you get the NodeTool mobile app running on your device.

## Prerequisites

1. Install Node.js (v20 or later)
2. Install Expo Go app on your phone:
   - [iOS - App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Android - Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

## Setup

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Start NodeTool Server

Make sure your NodeTool server is running. From the root directory:

```bash
# If not already set up
conda activate nodetool
nodetool serve
```

The server should be running at `http://localhost:8000` by default.

### 3. Start Expo Development Server

```bash
npm start
```

This will:
- Start the Metro bundler
- Show a QR code in the terminal
- Open a webpage with the QR code

### 4. Connect Your Phone

#### Option A: Same Network (Recommended)

1. Make sure your phone and computer are on the same WiFi network
2. Open Expo Go app on your phone
3. Scan the QR code from the terminal or webpage
4. The app will build and open on your phone

#### Option B: USB/Cable Connection

If you have connectivity issues:

**For Android:**
```bash
npm run android
```

**For iOS (macOS only):**
```bash
npm run ios
```

## Configuring Server URL

### For Same Network Access

1. Find your computer's local IP address:
   - **macOS/Linux**: Run `ifconfig | grep "inet "` or `ip addr show`
   - **Windows**: Run `ipconfig`
2. Look for an IP like `192.168.x.x` or `10.0.x.x`
3. In the mobile app, go to Settings
4. Enter `http://YOUR_IP:8000` (e.g., `http://192.168.1.100:8000`)
5. Tap "Test Connection" to verify

### For Android Emulator

If using Android Studio emulator:
- Use `http://10.0.2.2:8000` (Android's special alias for host localhost)

### For iOS Simulator

If using iOS Simulator on macOS:
- Use `http://localhost:8000` (simulators can access Mac's localhost directly)

## Using the App

1. **First Time Setup**:
   - Open the app
   - Tap the Settings button (⚙️)
   - Configure your server URL
   - Test the connection

2. **Browse Mini Apps**:
   - Return to the main screen
   - Pull down to refresh the list
   - Tap on any mini app to open it

3. **Run a Mini App**:
   - Fill in the input fields
   - Tap "Run" button
   - View results below

## Troubleshooting

### "Unable to connect to server"

**Check Server:**
```bash
# Make sure server is running
curl http://localhost:8000/api/workflows/
```

**Check Network:**
- Ensure phone and computer are on the same WiFi
- Some public/enterprise WiFi networks block device-to-device communication
- Try a personal hotspot as an alternative

**Check Firewall:**
- Make sure your firewall allows incoming connections on port 8000
- On macOS: System Preferences > Security & Privacy > Firewall
- On Windows: Windows Defender Firewall settings

### "Network request failed"

1. Double-check the server URL in Settings
2. Make sure the URL includes `http://` prefix
3. Verify no typos in IP address
4. Ensure server is running and accessible

### App won't load on phone

1. Clear Expo Go cache: Shake phone > Clear Cache
2. Restart Metro bundler: Press `r` in terminal
3. Reload app: Shake phone > Reload

### Metro bundler errors

```bash
# Clear cache and restart
npm start --reset-cache
```

## Development Tips

### Hot Reload

The app supports hot reloading. When you save changes to the code:
- Most changes reload instantly
- Some changes require a manual reload (shake device > Reload)

### Debug Menu

Shake your device or press:
- iOS Simulator: Cmd + D
- Android Emulator: Cmd/Ctrl + M

Options:
- Reload
- Debug Remote JS (Chrome DevTools)
- Show Performance Monitor
- Show Element Inspector

### Viewing Logs

In the terminal running `npm start`, press:
- `j` to open React Native debugger
- `Ctrl + C` to stop the server

## Building for Production

### Testing Builds

1. Create an Expo account: https://expo.dev/signup
2. Install EAS CLI: `npm install -g eas-cli`
3. Build for your platform:

```bash
# For Android
eas build --platform android --profile preview

# For iOS (requires Apple Developer account)
eas build --platform ios --profile preview
```

### Publishing to Stores

See [Expo documentation](https://docs.expo.dev/build/introduction/) for:
- Creating production builds
- Submitting to App Store
- Submitting to Play Store

## Next Steps

- Explore different mini apps
- Create your own workflows in NodeTool
- Share workflows with your team
- Build custom nodes for your use case

## Support

For issues specific to:
- NodeTool server: See main [README.md](../README.md)
- Mobile app: Open an issue on GitHub
- Expo platform: Visit [Expo documentation](https://docs.expo.dev/)
