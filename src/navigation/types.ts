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
  NodeDetail: { nodeId: string };
  NodeSettings: { nodeId: string; room: string | null };
  ImportKey: undefined;
  IntegrationAuth: {
    authConfig: string;          // JSON-serialized AuthenticationConfig
    nodeId: string;
    accessToken: string;
    providerBaseUrl?: string;    // Skip discovery if known
  };
};

export type DevicesStackParamList = {
  DevicesList: undefined;
  DeviceEdit: { deviceId: string; householdId: string };
  ExternalDeviceDetail: { device: string; householdId: string };
  RoomManagement: undefined;
  DeviceDiscovery: { nodeId: string };
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

export type RoutinesStackParamList = {
  RoutineList: undefined;
  RoutineSuggest: undefined;
  RoutineBuilder: undefined;
  RoutineEdit: { routineId?: string; routineData?: string };
  RoutineNodePicker: { routineId: string };
  RoutineHistory: { routineId: string; routineName: string };
};

export type InboxStackParamList = {
  InboxList: undefined;
  InboxDetail: { itemId: string };
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
    packageName: string;
    installedNodeIds: string; // JSON-serialized string[] of node IDs that already have this command
  };
  InstallProgress: {
    installs: string;        // JSON-serialized InstallEntry[]
    packageName: string;
    commandName: string;
    githubRepoUrl: string;
    gitTag: string | null;
    mode?: 'store' | 'test'; // 'test' uses test-install poll endpoint
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
  Settings: undefined;
  HouseholdEdit: { householdId: string; householdName: string };
  SmartHomeSetup: NavigatorScreenParams<SmartHomeSetupParamList>;
};
