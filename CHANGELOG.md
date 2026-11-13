# Changelog

## 20261113-1958

- Added Android Auto car chat: `modules/jarvis-car` posts Jarvis replies as a messaging notification and runs the dictated reply through the headless task `JarvisCarReply`
- Added `carChatService` (Tailscale first, then an optional public URL) with tests
- Added an Android Auto section in Settings (public URL, test message)
- Exported `parseSSEChunk`, `accessTokenUsable` and `bgRefresh` for the headless task
- Added `jarvis-car` to `package.json`, its lockfile entries and the jest native mock

## 20261113-1626

- Added the Android Auto plan under `docs/plans/Plan-AndroidAuto.md`
