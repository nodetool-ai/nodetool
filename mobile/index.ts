// Polyfill for crypto.getRandomValues() required by uuid package
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';
import { initErrorReporting } from './src/services/errorReporting';

// Route uncaught JS errors through the error reporter as early as possible.
initErrorReporting();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
