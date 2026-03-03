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

export type RoomsStackParamList = {
  RoomList: undefined;
  RoomDetail: { roomId: string; roomName: string };
  DeviceDetail: { deviceId: string };
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
  IntegrationAuth: {
    authConfig: string;     // JSON-serialized AuthenticationConfig
    nodeId: string;
    accessToken: string;
  };
};

export type MainTabParamList = {
  HomeTab: undefined;
  RoomsTab: NavigatorScreenParams<RoomsStackParamList> | undefined;
  NodesTab: NavigatorScreenParams<ProvisioningStackParamList> | undefined;
  SettingsTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  SmartHomeSetup: NavigatorScreenParams<SmartHomeSetupParamList>;
};
