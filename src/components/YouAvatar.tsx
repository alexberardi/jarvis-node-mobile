import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Avatar } from 'react-native-paper';

import { useAuth } from '../auth/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { displayNameOf } from '../utils/displayName';

/** The signed-in member's initial; opens You (account and this-phone settings). */
const YouAvatar = ({ testID = 'settings-button' }: { testID?: string }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state } = useAuth();
  const initial = (displayNameOf(state.user).trim()[0] ?? '?').toUpperCase();
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Settings')}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="You: account and settings"
      style={{ padding: 6 }}
    >
      <Avatar.Text size={30} label={initial} />
    </TouchableOpacity>
  );
};

export default YouAvatar;
