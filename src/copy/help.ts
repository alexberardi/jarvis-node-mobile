// Single source of truth for in-app help copy.
// Tooltip + helper-text strings, grouped by screen.
// Adding new copy: keep entries ≤25 words, plain English, no marketing voice.

export const helpCopy = {
  // Recurring terms — use these as the canonical phrasing when explaining elsewhere.
  glossary: {
    k2: "The key on your phone that encrypts this node's settings. Without it, settings can't be viewed or changed from this device.",
    node: 'A voice device — a Pi Zero, a Docker container, or this phone running the Jarvis app.',
    command: 'Voice-triggered action installed on a node (e.g. set a timer, play music).',
    task: 'Background action that runs on a schedule, without you asking — e.g. checking calendars or weather.',
    service: 'Credentials shared across multiple commands (Spotify, Nest, Home Assistant).',
    fastPath: 'A pattern that skips the LLM. "Turn off the lights" runs instantly without inference.',
  },

  nodeSettings: {
    commandsTab: 'Voice commands installed on this node. Toggle to enable or disable without uninstalling.',
    tasksTab: 'Background tasks that run on a schedule without you asking — e.g. checking calendars or weather.',
    servicesTab: 'Services that share credentials across multiple commands (Spotify, Nest, Home Assistant).',
    deviceProtocols: 'Built-in support for talking to devices over WiFi or cloud APIs. Configure once, use everywhere.',
    perPersonSecret: 'This setting is per-person — each household member has their own value.',
    syncToOtherNodes: 'Copy the configured secrets for this service to other nodes. Targets need their encryption key imported first.',
    inspectFastPaths: 'Patterns that skip the LLM — "turn off the lights" runs instantly. Disable any that conflict.',
    uninstallPackage: 'Removes this package from this node only. Other nodes keep it installed.',
    configError: "The package author's config has invalid values. Try reinstalling, or report to the package author.",
    autoDisabledAgent: 'This task stopped itself after repeated errors. Fix the cause or re-enable manually.',
    generateK2: "Creates the key that encrypts this node's settings. Without it, settings can't be viewed or changed.",
    exportK2: 'Save the key so you can manage this node from another phone, or restore it after reinstall.',
    syncTargetNoK2: 'Encryption key not on this device. Open the original phone, export the key, then scan it here.',
  },

  provisioning: {
    prepare: "Grabs a short-lived setup token. You'll need to do this while still on your home WiFi.",
    connectToNode: "Tap once you've joined the node's WiFi (Jarvis-XXXX). You'll be offline briefly.",
    iosOpenSettings: 'iOS opens the main Settings page — tap WiFi from there.',
    simulatorMode: 'For testing against a simulator on another computer. Skip this for real nodes.',
    capabilities: "Audio + voice features this node supports. Anything missing means the hardware doesn't have it.",
    reconnectedToWifi: 'Tap after rejoining your home WiFi. The node also switches networks behind the scenes.',
  },

  k2: {
    backupCta: "Without this backup, you can't manage this node from another phone if you lose this one.",
    plainVsPasswordQr: 'Plain works for in-person handoff. Password-protected is safe to email or save to cloud.',
    importKeyTitle: 'Pairs this phone with a node already set up by another household member.',
    encryptedQrPassword: 'Encrypted backups require the password chosen when the QR was made.',
    alwaysVisible:
      "This node's settings are encrypted with a key on this phone. Lose the phone without backing up, and the node can't be managed without re-pairing.",
  },

  settings: {
    primaryNode: "One node speaks to your smart-home gear on behalf of all others. Pick whichever's most reliable.",
    useExternalDevices: "Pull live state from Home Assistant or another hub instead of Jarvis's local copy.",
    rediscoverServices: 'Re-scan your network for Jarvis services. Use after changing WiFi or moving to a new router.',
    configServiceUrl: 'Switches environments. Saving logs you out and clears local data — be ready to re-sign-in.',
    statusChip: 'Local = Jarvis running on your network. Cloud = a hosted Jarvis at jarvis.live.',
    pushNotifications: "When off, the app won't be reachable from outside your WiFi for alerts.",
    powerUserRole: "Power users can add nodes and create invites, but can't change household name or remove admins.",
  },

  voiceProfile: {
    enrollCta: 'Teaches Jarvis to recognize your voice so it knows which household member is speaking.',
    variedPrompts: 'Reading a command, a question, and a statement helps Jarvis match your everyday speaking patterns.',
    addVsRerecord: 'Add one keeps your existing samples. Re-record wipes them and rebuilds from scratch.',
    testMatch: 'Records a short sample and checks whether it matches your enrolled profile.',
    confidenceAnchor: 'Above ~70% reliably identifies you. Lower means add more samples from the same node.',
  },

  hardware: {
    tabIntro: 'Physical settings: mic, speakers, LEDs, Bluetooth. Hidden for Docker-hosted nodes.',
    voiceMode: 'How chatty Jarvis is by default. "Brief" answers in a sentence; "conversational" adds context.',
    adapterHash: 'Identifier for the language-model fine-tune this node uses. Useful when reporting bugs.',
    wakeAckAudio: 'The "On it" sound after the wake word. Turn off if you find it slows down quick commands.',
    autoCalibrate: "Quietly listens for 3 seconds, then sets the silence threshold above your room's noise floor.",
    ledPatterns: 'Tap to flash the corresponding LED pattern on the node. Useful for verifying LEDs work.',
    userButton: 'The single physical button on the ReSpeaker HAT.',
  },

  pantry: {
    firstRunTitle: 'Welcome to the Pantry',
    firstRun:
      "Browse and install commands, tasks, and services onto your nodes. Risk and Verified badges help you judge what's safe.",
    riskChip: 'Higher risk means broader system access (network, root, files). Review the security report before installing.',
    verifiedBadge: "Reviewed by a Jarvis maintainer. Unverified packages still work but haven't been audited.",
    bundleChip: 'Installs several related pieces (commands + tasks) together as one package.',
    installToCC: 'Prompt providers run on your server, not a node. They power how Jarvis writes responses.',
    rootInstall: 'This package wants to install system-level software with root access. Only continue if you trust the author.',
    testInstallTab: 'Temporary install for trying unpublished packages. Auto-removed after 20 minutes.',
    testInstallCode: "Paste the 6-character code from a developer who's testing a package they haven't published.",
    installedCount: 'How many of your nodes have this package installed.',
  },

  routines: {
    firstRunTitle: 'Building your first routine',
    firstRun:
      'Trigger phrases start the routine; steps are what it does. Routines can run on demand (out loud) or in the background.',
    aiProvider: 'Jarvis is free and runs on your server. Claude/OpenAI cost money but produce better routines.',
    triggerPhrases: 'Things you\'d say to start this routine (e.g. "good morning"). Add several variants.',
    labelVsCommand: 'Label is what shows in logs and history. Command is the function the node actually runs.',
    runInBackground: 'When on, this routine runs on a schedule and writes alerts to your inbox instead of speaking.',
    priority: 'When multiple background alerts queue up, higher priority ones speak first when you ask "what\'s up".',
    ttl: 'Alerts older than this disappear from your queue automatically. Stops yesterday\'s news.',
    configureDevices: 'Some steps need a specific light or speaker picked. Tap to choose them for this node.',
    domain: 'The category of device this step controls (lights, switches, locks, etc.).',
    saveChooseNodes: 'Routines live on one or more nodes. Pick which nodes should hear the trigger phrase.',
  },

  nodeDetail: {
    statusDot: 'Green = node has phoned home recently. Red = no contact for several minutes.',
    hardwareTab: 'Physical settings: mic, speakers, LEDs, Bluetooth. Hidden for Docker-hosted nodes.',
    packagesEmpty: 'Install commands from the Pantry tab to expand what this node can do.',
    activityTab: 'Recent routine runs on this node. Voice commands show up in Recent Commands instead.',
    deleteNode: 'Wipes credentials and reflashes a still-online node back to factory setup. Use also if the Pi is gone.',
    missingCog: 'Settings hidden because this node was paired on a different phone. Import its encryption key to manage.',
  },

  bluetooth: {
    speakerRole: 'Speaker = headphones/soundbar (Jarvis sends audio). Audio Input = mic, phone, or other source.',
    makeDiscoverable: 'Lets your phone or laptop find this node and connect to it for two minutes.',
    autoReconnect: 'When on, Jarvis reconnects to this device automatically when it sees it nearby.',
    forget: "Removes pairing on both sides. You'll need to put the device back in pairing mode next time.",
    pairedVsConnected: 'Paired = saved. Connected = actively streaming audio right now.',
  },

  smartHome: {
    haToken: 'HA token instead of password — works even when you change your HA login. Created in HA settings.',
    connectHaCta: 'If you use Home Assistant as a hub. Otherwise use the device scan on a node.',
    alreadyAdded: "Devices already in your household are crossed out so you don't import duplicates.",
    roomNesting:
      'Rooms can nest (e.g., Upstairs > Bedroom). Helps Jarvis pick the right device when you say "the bedroom light."',
    domainFilter: 'Filter by what kind of device. Tap a chip to show only that type.',
  },

  inbox: {
    adapterProposal: "A proposed fine-tune of Jarvis's language model based on your usage. Apply to make Jarvis sharper.",
    adapterStats: 'How many of your past commands were used to train this update, and how it scored against them.',
    applyAdapter:
      'Apply: switch to this fine-tune household-wide. Preview: see which commands changed. Dismiss: keep current model.',
    categoryChips: 'Type of message. Alerts are time-sensitive; confirmations expect a yes/no; reminders are FYI.',
    thumbsRating: 'Helps Jarvis learn which command interpretations worked. Used to suggest model fine-tunes you can apply.',
    toolCallLine: 'Shows which command Jarvis ran for your request, and the arguments it picked.',
  },
} as const;
