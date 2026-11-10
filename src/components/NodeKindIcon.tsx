import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Icon, useTheme } from 'react-native-paper';

import { NodeKindFields, nodeKindIcon, nodeKindLabel } from '../utils/nodeKind';

interface Props {
  node: NodeKindFields | null | undefined;
  size?: number;
  color?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** The node's kind as an icon: a robot for a desktop agent, a Raspberry Pi otherwise. */
export const NodeKindIcon = ({ node, size = 24, color, testID, style }: Props) => {
  const theme = useTheme();
  return (
    <View testID={testID} accessible accessibilityLabel={nodeKindLabel(node)} style={style}>
      <Icon source={nodeKindIcon(node)} size={size} color={color ?? theme.colors.primary} />
    </View>
  );
};
