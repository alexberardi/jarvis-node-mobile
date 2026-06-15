/**
 * @bacons/apple-targets config for the Jarvis Control Center / Lock Screen control.
 *
 * Declares a second iOS target — a WidgetKit extension (bundle id
 * com.jarvis.nodemobile.controls). Control Center / Lock Screen controls use
 * the 'widget' target type (there is no 'control' type); the extension exports
 * a ControlWidget. iOS 18+ only.
 *
 * No App Group: the control opens the app via an https Universal Link
 * (https://docs.jarvisautomation.dev/app/stt) whose path carries the intent,
 * so no shared storage is needed. Code signing uses ios.appleTeamId from
 * app.json (8H5GA7SX77).
 */
/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'JarvisControl',
  bundleIdentifier: '.controls',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
};
