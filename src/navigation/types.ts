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

export type NodesStackParamList = {
  NodeList: undefined;
  AddNode: undefined;
  NodeDetail: { nodeId: string; initialTab?: 'overview' | 'hardware' | 'packages' | 'activity' };
  NodeSettings: { nodeId: string; room: string | null };
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
  DeviceList: { householdId: string };
  IntegrationAuth: {
    authConfig: string;     // JSON-serialized AuthenticationConfig
    nodeId: string;
    accessToken: string;
    providerBaseUrl?: string;
  };
};

export type CommandDataStackParamList = {
  /** Top-level data browser. Shows node picker when >1 node, then commands.
   *  When `nodeId` is passed, the picker is skipped and the screen shows
   *  the commands for that node directly — used when entering from a
   *  node-scoped surface (e.g. NodeSettings options menu). */
  DataBrowserHome: { nodeId?: string } | undefined;
  /** Records list for one command on one node. */
  DataBrowserRecords: { nodeId: string; commandName: string };
  /** Read-only detail for one record. */
  DataBrowserDetail: {
    nodeId: string;
    commandName: string;
    recordKey: string;
  };
  /** Editable form for one record. */
  DataBrowserEdit: {
    nodeId: string;
    commandName: string;
    recordKey: string;
  };
};

export type RoutinesStackParamList = {
  RoutineList: undefined;
  RoutineSuggest: undefined;
  RoutineBuilder: undefined;
  RoutineEdit: { routineId?: string; routineData?: string };
  RoutineNodePicker: { routineId: string };
  RoutineHistory: { routineId: string; routineName: string };
  PlaceholderResolver: { routineId: string; nodeId: string };
};

export type InboxStackParamList = {
  InboxList: undefined;
  InboxDetail: { itemId: string };
  // Pushed onto the stack when a user taps an InteractiveElement whose
  // navigation_type is "stack". Polls the callback's status endpoint
  // until the result lands, then renders the same body/chip layout as
  // InboxDetail — but inline, no separate inbox row.
  InboxCallbackResult: { jobId: string; title?: string; targetNodeId?: string };
  AdapterProposal: { itemId: string };
  AdapterProposalDetail: { proposalId: string };
  AdapterDeployed: { itemId: string };
  ExportShoppingList: {
    itemId: string;
    // Roundtrip return values from WalmartIdPicker. The inbox metadata is
    // a snapshot, so the picker navigates back here with the key/id it
    // just saved and the screen merges them into a local overrides map —
    // no refetch needed.
    pickedKey?: string;
    pickedId?: string;
  };
  WalmartIdPicker: {
    searchQuery: string; // seeds the walmart.com search WebView
    recordKey: string; // shopping-list record to patch
    nodeId: string; // node that owns the record
    itemId: string; // inbox item — needed to navigate back to ExportShoppingList
    // When set ("View" on a mapped row), the WebView opens on this
    // product's page instead of search results so the user can confirm
    // the stored mapping — and browse away + re-pick if it's wrong.
    productId?: string;
  };
};

export type RecentCommandsStackParamList = {
  RecentCommandsList: undefined;
  RecentCommandDetail: { transcriptId: number };
};

export type MemoriesStackParamList = {
  MemoriesList: undefined;
  MemoryEdit: { memoryId?: number };
};

export type StoreStackParamList = {
  StoreBrowse: undefined;
  StoreDetail: { commandName: string };
  TestInstall: undefined;
  NodePickerSheet: {
    nodes: string;           // JSON-serialized NodeInfo[]
    commandName: string;
    githubRepoUrl: string;
    gitTag: string;
    latestVersion: string;
    packageName: string;
    installedNodeIds: string; // JSON-serialized string[] of node IDs that already have this command
    installedVersions: string; // JSON-serialized Record<nodeId, installedVersion | "unknown">
  };
  InstallProgress: {
    installs: string;        // JSON-serialized InstallEntry[]
    packageName: string;
    commandName: string;
    githubRepoUrl: string;
    gitTag: string | null;
    mode?: 'store' | 'test' | 'cc-provider'; // 'cc-provider' polls CC directly
  };
};

export type MainTabParamList = {
  HomeTab: undefined;
  DevicesTab: NavigatorScreenParams<DevicesStackParamList> | undefined;
  StoreTab: NavigatorScreenParams<StoreStackParamList> | undefined;
  RoutinesTab: NavigatorScreenParams<RoutinesStackParamList> | undefined;
  NodesTab: NavigatorScreenParams<NodesStackParamList> | undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Inbox: NavigatorScreenParams<InboxStackParamList>;
  RecentCommands: NavigatorScreenParams<RecentCommandsStackParamList> | undefined;
  Settings: undefined;
  HouseholdEdit: { householdId: string; householdName: string };
  SmartHomeSetup: NavigatorScreenParams<SmartHomeSetupParamList>;
  VoiceProfile: undefined;
  CommandData: NavigatorScreenParams<CommandDataStackParamList>;
  Memories: NavigatorScreenParams<MemoriesStackParamList> | undefined;
};
