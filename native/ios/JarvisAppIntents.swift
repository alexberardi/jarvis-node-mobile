//
//  JarvisAppIntents.swift
//
//  Native App Intents that surface Jarvis quick actions in Shortcuts,
//  Spotlight, Siri, and the Action Button list WITHOUT the user having to
//  build a Shortcut. Each intent just opens the app's already-registered
//  custom URL scheme (com.jarvis.app://…); App.tsx's DeepLinkManager handles
//  the rest (parse → stash → HomeScreen drains → auto-listen / open chat).
//
//  This file is committed under native/ios/ (NOT ios/, which is gitignored
//  and regenerated). The local config plugin plugins/withJarvisAppIntents.js
//  copies it into the regenerated app target on every `expo prebuild`.
//
//  IMPORTANT: AppShortcutsProvider and its backing intents MUST be in the
//  MAIN app target (Apple constraint) for auto-registration to work.
//

import AppIntents
import UIKit

// MARK: - URL opener

@available(iOS 16.0, *)
enum JarvisURLOpener {
  /// Opens one of the app's own custom-scheme deep links.
  ///
  /// Notes:
  /// - The intents below set `openAppWhenRun = true`, so the app is
  ///   foregrounded before `perform()` runs and `UIApplication` is available
  ///   and entitled to open our own scheme.
  /// - On iOS 18, `open(url)` with no options resolves to the deprecated
  ///   `openURL(_:)` overload and silently does nothing — always pass
  ///   `options:`.
  /// - `OpenURLIntent` is intentionally NOT used: it only opens https
  ///   universal links, not custom schemes.
  @MainActor
  static func open(_ string: String) async {
    guard let url = URL(string: string) else { return }
    await withCheckedContinuation { continuation in
      UIApplication.shared.open(url, options: [:]) { _ in
        continuation.resume()
      }
    }
  }
}

// MARK: - Intents

/// Open Jarvis and immediately start listening for a voice command.
@available(iOS 16.0, *)
struct JarvisListenIntent: AppIntent {
  static let title: LocalizedStringResource = "Talk to Jarvis"
  static let description = IntentDescription("Open Jarvis and start listening for a command.")

  // Foreground the app so we can open our own URL scheme from perform().
  static var openAppWhenRun: Bool = true
  // Surface in Shortcuts / Spotlight automatically.
  static var isDiscoverable: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await JarvisURLOpener.open("com.jarvis.app://stt")
    return .result()
  }
}

/// Open Jarvis to the chat screen (no listening).
@available(iOS 16.0, *)
struct JarvisOpenChatIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Jarvis chat"
  static let description = IntentDescription("Open Jarvis to the chat screen.")

  static var openAppWhenRun: Bool = true
  static var isDiscoverable: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await JarvisURLOpener.open("com.jarvis.app://chat")
    return .result()
  }
}

// MARK: - App Shortcuts (auto-registered; no Info.plist needed)

@available(iOS 16.0, *)
struct JarvisShortcuts: AppShortcutsProvider {
  // Max 10 shortcuts per app. Every phrase MUST contain \(.applicationName)
  // (the system substitutes the app's display name, "Jarvis Automation").
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: JarvisListenIntent(),
      phrases: [
        "Talk to \(.applicationName)",
        "Ask \(.applicationName)",
        "Start a command with \(.applicationName)",
      ],
      shortTitle: "Talk to Jarvis",
      systemImageName: "mic.fill"
    )
    AppShortcut(
      intent: JarvisOpenChatIntent(),
      phrases: [
        "Open \(.applicationName)",
        "Open \(.applicationName) chat",
      ],
      shortTitle: "Open Jarvis chat",
      systemImageName: "bubble.left.and.bubble.right.fill"
    )
  }
}
