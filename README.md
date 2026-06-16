# jarvis-node-mobile

The official mobile app for [Jarvis](https://jarvisautomation.io) — a private, self-hosted voice assistant. The app (store name **"Jarvis Automation"**) lets you talk to Jarvis from your phone, provision and manage Pi Zero voice nodes, and control your smart home.

Built with Expo / React Native (iOS and Android).

## Features

- **Voice & chat** — send voice commands and chat with Jarvis from your phone (microphone access).
- **Node provisioning** — scan a QR code to pair a Pi Zero voice node, then push WiFi/config to headless nodes.
- **Server discovery** — auto-discover your self-hosted `jarvis-config-service` on the local network (Bonjour / zeroconf).
- **Smart home** — Home Assistant device discovery and control.
- **Rooms & devices** — organize and manage paired nodes and devices.
- **Secure storage** — auth tokens kept in the platform keychain (`expo-secure-store`).
- **Quick-open voice** — iOS Action Button / Control Center / Shortcuts integration.

## Tech stack

- Expo 54, React Native 0.81, React 19, TypeScript
- React Navigation 7 (bottom tabs + native stacks)
- React Native Paper (Material Design UI)
- TanStack React Query 5 (data fetching)
- expo-camera (QR scanning), expo-secure-store (keychain), react-native-zeroconf (discovery)
- Local crypto module in `modules/jarvis-crypto`

## Requirements

- Node.js + npm
- Xcode (iOS) / Android Studio (Android)
- A running Jarvis backend (at minimum `jarvis-auth`, `jarvis-config-service`, and `jarvis-command-center`)

## Development

```bash
npm install            # install dependencies

npm start              # Expo dev server (dev client)
npm run ios            # build & run on iOS (device/simulator)
npm run android        # build & run on Android
npm run web            # run in the browser

npm test               # run the Jest test suite
npm run test:watch     # watch mode
npm run test:coverage  # with coverage
```

API base URLs are configured in `src/config/env.ts` (dev mode targets localhost).

## Builds

Distributed via **EAS Build** (`eas.json`) with development / staging / production profiles, e.g.:

```bash
npm run build:dev:ios
npm run build:dev:android
```

- iOS bundle id: `com.jarvis.nodemobile`
- Android package: `com.jarvis.nodemobile`

## License

Apache-2.0 (see `LICENSE`).
