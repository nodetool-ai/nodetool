// Polyfill for crypto.getRandomValues() required by uuid package
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import { installRandomUuid } from './src/polyfills/randomUuid';

// Hermes has no `crypto.randomUUID`, and the import above only supplies
// `getRandomValues`. `@nodetool-ai/timeline`'s id factory calls `randomUUID`,
// so without this every makeClip/makeTrack/splitClip would throw on device.
installRandomUuid();

import App from './App';
import { initErrorReporting } from './src/services/errorReporting';
import { installSentryReporter } from './src/services/sentryReporter';

// Route uncaught JS errors through the error reporter as early as possible.
initErrorReporting();

// Swaps the console-only sink for Sentry, but only when a DSN is configured.
// Without one this is a no-op and nothing leaves the device. Installed here
// rather than in App.tsx so a crash during the first render is still caught.
installSentryReporter();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
