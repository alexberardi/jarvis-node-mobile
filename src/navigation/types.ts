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
  NodeSettings: { nodeId: string; room: string | null };
  ImportKey: undefined;
  IntegrationAuth: {
    authConfig: string;          // JSON-serialized AuthenticationConfig
    nodeId: string;
    accessToken: string;
    providerBaseUrl?: string;    // Skip discovery if known
  };
};

export type SmartHomeSetupParamList = {
  SmartHomeSetup: undefined;
  HADiscovery: undefined;
  HAAuth: { haUrl: string };
  HADeviceImport: { haUrl: string; haToken: string };
  DeviceRoomAssignment: {
    haUrl: string;
    haToken: string;
    selectedDevices: string; // JSON-serialized (nav params must be serializable)
    areas: string;          // JSON-serialized
  };
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
  RoutineEdit: { routineId?: string };
  RoutineNodePicker: { routineId: string };
};

export type InboxStackParamList = {
  InboxList: undefined;
  InboxDetail: { itemId: string };
};

export type MainTabParamList = {
  HomeTab: undefined;
  NodesTab: NavigatorScreenParams<NodesStackParamList> | undefined;
  RoutinesTab: NavigatorScreenParams<RoutinesStackParamList> | undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Inbox: NavigatorScreenParams<InboxStackParamList>;
  SmartHomeSetup: NavigatorScreenParams<SmartHomeSetupParamList>;
};
