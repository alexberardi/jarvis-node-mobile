//
//  JarvisControlIntent.swift
//
//  Intents fired by the Control Center / Lock Screen controls.
//
//  WHY THESE DIFFER FROM native/ios/JarvisAppIntents.swift (Phase 1-2):
//  The Phase 1-2 intents live in the MAIN app target and foreground the app by
//  calling UIApplication.shared.open("com.jarvis.app://stt") — which works only
//  because a UIApplication exists in the app process.
//
//  A ControlWidgetButton's perform() runs in the WIDGET EXTENSION process,
//  which has NO UIApplication, and Apple does NOT support custom URL schemes
//  from a Control (Frameworks Engineer, forums thread/763783: "OpenURLIntent is
//  the supported way to open your app from a Control Widget. It does require
//  universal links and custom URL schemes are not supported.").
//
//  So these open the app via an https Universal Link on docs.jarvisautomation.dev
//  (backed by ios.associatedDomains + the AASA file). iOS routes the link into
//  the app, where React Native's Linking delivers it to parseQuickOpenUrl in
//  src/navigation/deepLinks.ts -> setPendingIntent -> HomeScreen auto-listen.
//
//  Lives in targets/_shared/ so @bacons/apple-targets gives it membership in
//  BOTH the control extension AND the main app target.
//

import AppIntents
import Foundation

private enum JarvisControlURL {
  // Must match ios.associatedDomains in app.json, the AASA at
  // https://docs.jarvisautomation.dev/.well-known/apple-app-site-association,
  // and parseQuickOpenUrl() in src/navigation/deepLinks.ts.
  static let listen = URL(string: "https://docs.jarvisautomation.dev/app/stt")!
  static let chat = URL(string: "https://docs.jarvisautomation.dev/app/chat")!
}

/// Open Jarvis and start listening.
@available(iOS 18.0, *)
struct JarvisControlListenIntent: AppIntent {
  static let title: LocalizedStringResource = "Talk to Jarvis"
  static let description = IntentDescription("Open Jarvis and start listening for a command.")
  static var openAppWhenRun: Bool = true
  // Control-only: don't list as a standalone Shortcuts action. The Phase 2
  // AppShortcutsProvider already exposes the user-facing Siri/Shortcuts entries.
  static var isDiscoverable: Bool = false

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    return .result(opensIntent: OpenURLIntent(JarvisControlURL.listen))
  }
}

/// Open Jarvis to the chat screen.
@available(iOS 18.0, *)
struct JarvisControlChatIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Jarvis chat"
  static let description = IntentDescription("Open Jarvis to the chat screen.")
  static var openAppWhenRun: Bool = true
  static var isDiscoverable: Bool = false

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    return .result(opensIntent: OpenURLIntent(JarvisControlURL.chat))
  }
}
