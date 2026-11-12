/**
 * Chooses which of the household's Pantry stores this device browses and
 * installs from (several pantries). Renders nothing with one store: there is
 * nothing to pick, and the screens look as they always did.
 */
import React, { useState } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Button, Menu } from 'react-native-paper';

import { usePantryStores } from '../services/pantryStores';

interface Props {
  style?: StyleProp<ViewStyle>;
}

const PantryStorePicker = ({ style }: Props) => {
  const { stores, store, pick } = usePantryStores();
  const [open, setOpen] = useState(false);
  if (stores.length < 2) return null;
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Button
          mode="outlined"
          icon="store-outline"
          onPress={() => setOpen(true)}
          style={style}
          accessibilityLabel={`Pantry store: ${store?.name}. Change store`}
          testID="pantry-store-picker"
        >
          {store?.name}
        </Button>
      }
    >
      {stores.map((s, i) => (
        <Menu.Item
          key={s.id}
          title={i === 0 ? `${s.name} (default)` : s.name}
          leadingIcon={s.id === store?.id ? 'check' : undefined}
          onPress={() => {
            pick(s.id);
            setOpen(false);
          }}
          testID={`pantry-store-option-${s.id}`}
        />
      ))}
    </Menu>
  );
};

export default PantryStorePicker;
