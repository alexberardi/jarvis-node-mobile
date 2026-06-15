//
//  JarvisControlWidget.swift
//
//  Control Center / Lock Screen controls for Jarvis (iOS 18+).
//
//  This is the widget-extension entry point. The whole extension targets
//  iOS 18 (see expo-target.config.js deploymentTarget: '18.0'), so the
//  ControlWidget types need no further @available gating here.
//
//  The intents fired by these controls (JarvisControlListenIntent /
//  JarvisControlChatIntent) live in targets/_shared/ so @bacons/apple-targets
//  compiles them into BOTH this extension and the main app target.
//

import WidgetKit
import SwiftUI

@main
struct JarvisControlBundle: WidgetBundle {
  var body: some Widget {
    JarvisListenControl()
    JarvisChatControl()
  }
}

/// "Talk to Jarvis" — opens the app and starts listening.
struct JarvisListenControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.jarvis.nodemobile.controls.listen") {
      ControlWidgetButton(action: JarvisControlListenIntent()) {
        Label("Talk to Jarvis", systemImage: "mic.fill")
      }
    }
    .displayName("Talk to Jarvis")
    .description("Open Jarvis and start listening.")
  }
}

/// "Open Jarvis" — opens the app to the chat screen.
struct JarvisChatControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.jarvis.nodemobile.controls.chat") {
      ControlWidgetButton(action: JarvisControlChatIntent()) {
        Label("Open Jarvis", systemImage: "bubble.left.and.bubble.right.fill")
      }
    }
    .displayName("Open Jarvis")
    .description("Open Jarvis to the chat screen.")
  }
}
