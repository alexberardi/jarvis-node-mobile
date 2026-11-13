// Register the background geofence task FIRST (import side-effect) so
// TaskManager.defineTask runs at global scope before anything else — required
// for the OS to find it when it cold-relaunches the app for a boundary crossing.
import './src/services/backgroundPresenceTask';

import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { CAR_REPLY_TASK, carReplyTask } from './src/services/carChatService';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Android Auto replies arrive in a headless context (see modules/jarvis-car).
AppRegistry.registerHeadlessTask(CAR_REPLY_TASK, () => carReplyTask);
