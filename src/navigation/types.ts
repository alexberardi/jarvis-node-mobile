import { NavigatorScreenParams } from '@react-navigation/native';

export type ProvisioningStackParamList = {
  ScanForNodes: undefined;
  NodeInfo: undefined;
  SelectNetwork: undefined;
  EnterPassword: undefined;
  ProvisioningProgress: undefined;
  Success: undefined;
};

export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
};

/** One section of the household editor, opened from the Household tab. */
export type HouseholdSection = 'home' | 'jarvis' | 'knowledge' | 'presence' | 'calls' | 'members';

/** A node settings tab; set when a node card opens one tab on its own. */
export type NodeSettingsTab = 'commands' | 'agents' | 'integrations' | 'stored_data';
/** Which part of a node's hardware screen a node card opens. */
export type NodeHardwarePart = 'voice' | 'speaker' | 'hardware';

export type NodesStackParamList = {
  HouseholdHome: undefined;
  NodeList: undefined;
  AddNode: undefined;
  AddComputer: undefined;
  NodeDetail: { nodeId: string };
  NodeSettings: { nodeId: string; room: string | null; tab?: NodeSettingsTab };
  NodeHardware: { nodeId: string; part: NodeHardwarePart };
  NodePackages: { nodeId: string };
  /** Every credential across the household's nodes, or one node's. */
  Credentials: { nodeId?: string } | undefined;
  CredentialDetail: { id: string; nodeId?: string };
  NodeForgeTest: { nodeId: string };
  ImportKey: undefined;
  IntegrationAuth: {
    authConfig: string;          // JSON-serialized AuthenticationConfig
    nodeId: string;
    accessToken: string;
    providerBaseUrl?: string;    // Skip discovery if known
  };
  FastPathInspect: {
    nodeId: string;
    groupName: string;
    // JSON-serialized [{ command_name, fast_paths: FastPathEntry[] }] —
    // navigation params must be serializable.
    commandsJson: string;
  };
};

export type DevicesStackParamList = {
  DevicesList: undefined;
  DeviceEdit: { deviceId: string; householdId: string };
  ExternalDeviceDetail: { device: string; householdId: string };
  RoomManagement: undefined;
  RoomDetail: { roomId: string };
  DeviceDiscovery: { nodeId: string };
  CameraView: { deviceId: string; householdId: string; deviceName: string };
};

export type SmartHomeSetupParamList = {
  SmartHomeSetup: undefined;
  HADiscovery: undefined;
  HAAuth: { haUrl: string };
  HADeviceImport: { haUrl: string; haToken: string };
  DeviceRoomAssignment: {
    selectedDevices: string; // JSON-serialized (nav params must be serializable)
    areas: string;          // JSON-serialized
    source?: 'home_assistant' | 'direct';
    haUrl?: string;
    haToken?: string;
  };
  DeviceDiscovery: { nodeId: string };
};

export type CommandDataStackParamList = {
  /** Records list for one command on one node. */
  DataBrowserRecords: { nodeId: string; commandName: string };
  /** Read-only detail for one record. */
  DataBrowserDetail: {
    nodeId: string;
    commandName: string;
    recordKey: string;
  };
  /** Editable form for one record. Omit `recordKey` to create a new one. */
  DataBrowserEdit: {
    nodeId: string;
    commandName: string;
    recordKey?: string;
  };
};

export type RoutinesStackParamList = {
  RoutineList: undefined;
  RoutineEdit: { routineId?: string };
};

export type InboxStackParamList = {
  InboxList: undefined;
  InboxDetail: { itemId: string };
  // The household's "never suggest this again" blocklist for agent-proposed
  // action cards. Reached from the Inbox header (where the proposals land).
  SuppressedSuggestions: undefined;
  // Pushed onto the stack when a user taps an InteractiveElement whose
  // navigation_type is "stack". Polls the callback's status endpoint
  // until the result lands, then renders the same body/chip layout as
  // InboxDetail — but inline, no separate inbox row.
  InboxCallbackResult: { jobId: string; title?: string; targetNodeId?: string };
  AdapterProposal: { itemId: string };
  AdapterProposalDetail: { proposalId: string };
  AdapterDeployed: { itemId: string };
  InteractiveList: {
    itemId: string;
    // Roundtrip return values from WebViewPicker. The inbox metadata is
    // a snapshot, so the picker navigates back here with the key/field/
    // value it just saved and the screen merges them into a local
    // gate-override map — no refetch needed.
    pickedKey?: string;
    pickedField?: string;
    pickedValue?: string;
  };
  WebViewPicker: {
    itemId: string; // inbox item — needed to navigate back to InteractiveList
    rowKey: string; // record to patch (the row's key)
    nodeId: string; // node that owns the record
    commandName: string; // record-API target (the action's save.command_name)
    field: string; // record field to patch (the action's save.field)
    startUrl: string; // already substituted ({label}/{value}); must be https
    pattern: string; // JS regex source; capture group 1 = the value
    // Stored value, when one exists. Detecting it again shows an info bar
    // instead of the "Use this value" button — the user browses away and
    // re-picks if the stored mapping is wrong.
    currentValue?: string;
  };
};

export type MemoriesStackParamList = {
  MemoriesList: undefined;
  MemoryEdit: { memoryId?: number };
};

export type PhonebookStackParamList = {
  PhonebookList: undefined;
  /** Omit `contactId` to add a new business. */
  PhonebookEdit: { contactId?: string };
};

export type CallContextStackParamList = {
  CallContextList: undefined;
  /**
   * The whole list is saved as a unit, so the editor is handed the current
   * fields and the index it is editing (omit `index` to add a new one), plus
   * the catalog for the category/tier pickers. Plain serializable data — the
   * list screen reloads on focus to reflect what was saved.
   */
  CallContextEdit: {
    fields: import('../api/callContextApi').CallContextField[];
    catalog: import('../api/callContextApi').CallContextCatalog;
    index?: number;
  };
};

export type StoreStackParamList = {
  StoreBrowse: undefined;
  StoreDetail: { commandName: string };
  TestInstall: undefined;
  InstallProgress: {
    installs: string;        // JSON-serialized InstallEntry[]
    packageName: string;
    commandName: string;
    githubRepoUrl: string;
    gitTag: string | null;
    mode?: 'store' | 'test' | 'cc-provider'; // 'cc-provider' polls CC directly
    /** The package declares settings or a sign-in: offer Credentials once it's in. */
    needsSetup?: boolean;
  };
};

export type MainTabParamList = {
  HomeTab: undefined;
  DevicesTab: NavigatorScreenParams<DevicesStackParamList> | undefined;
  StoreTab: NavigatorScreenParams<StoreStackParamList> | undefined;
  RoutinesTab: NavigatorScreenParams<RoutinesStackParamList> | undefined;
  HouseholdTab: NavigatorScreenParams<NodesStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Inbox: NavigatorScreenParams<InboxStackParamList>;
  /** You (default), the household list with join/create, or Household › Smart home. */
  Settings: { view?: 'you' | 'households' | 'smart_home' } | undefined;
  HouseholdEdit: { householdId: string; householdName: string; section?: HouseholdSection };
  SmartHomeSetup: NavigatorScreenParams<SmartHomeSetupParamList>;
  VoiceProfile: undefined;
  CommandData: NavigatorScreenParams<CommandDataStackParamList>;
  Memories: NavigatorScreenParams<MemoriesStackParamList> | undefined;
  Phonebook: NavigatorScreenParams<PhonebookStackParamList> | undefined;
  CallContext: NavigatorScreenParams<CallContextStackParamList> | undefined;
  NowPlaying: undefined;
};
