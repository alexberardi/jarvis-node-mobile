/**
 * Editable inbox-card field of input_type "datetime" (see utils/inboxEditors).
 *
 * Renders the current value as a friendly local date/time with a tap-to-edit
 * affordance backed by the native picker: iOS gets a single inline "datetime"
 * spinner; Android has no combined datetime mode, so it runs the two one-shot
 * dialogs in sequence — date, then time.
 *
 * CONTRACT: the value in (`value`) and out (`onChange`) is always an ISO 8601
 * local-wall-clock string like "2026-08-11T18:00:00". That is what flows
 * through the InteractiveElementsSection merge into the callback `data`, and
 * command-center's add_event parses ISO — so we never touch UTC. The
 * ISO<->Date conversion lives in utils/time (parseIsoToDate / formatDateToIso),
 * built from local components so the wall-clock time never shifts.
 */
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, Icon, Text, useTheme } from 'react-native-paper';

import { formatDateToIso, formatIsoFriendly, parseIsoToDate } from '../utils/time';

interface Props {
  /** Display label (already resolved by the caller). */
  label?: string;
  /** Current value — an ISO 8601 local-wall-clock string. */
  value: string;
  /** Called with the new value, same ISO 8601 shape as `value`. */
  onChange: (iso: string) => void;
  disabled?: boolean;
  testID?: string;
}

const EditableDateTimeField: React.FC<Props> = ({
  label,
  value,
  onChange,
  disabled = false,
  testID,
}) => {
  const theme = useTheme();
  // iOS: one inline datetime spinner, kept open until the user taps Done.
  const [iosOpen, setIosOpen] = useState(false);
  // Android: two sequential one-shot dialogs. `androidMode` is which is open;
  // `androidDate` carries the date chosen in step 1 into step 2 (time).
  const [androidMode, setAndroidMode] = useState<'date' | 'time' | null>(null);
  const [androidDate, setAndroidDate] = useState<Date | null>(null);

  const current = parseIsoToDate(value);

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === 'android') {
      setAndroidDate(null);
      setAndroidMode('date');
    } else {
      setIosOpen((open) => !open);
    }
  };

  // iOS spinner fires on every tick — write the ISO value live and keep it open.
  const handleIosChange = (_evt: DateTimePickerEvent, picked?: Date) => {
    if (picked) onChange(formatDateToIso(picked));
  };

  const handleAndroidChange = (evt: DateTimePickerEvent, picked?: Date) => {
    if (androidMode === 'date') {
      // 'set' advances to the time step; anything else (dismiss) cancels the
      // whole edit and leaves the value untouched.
      if (evt.type !== 'set' || !picked) {
        setAndroidMode(null);
        return;
      }
      // `picked` keeps the existing time-of-day (we seeded the date dialog with
      // `current`), so it's a valid base for the time step.
      setAndroidDate(picked);
      setAndroidMode('time');
      return;
    }
    if (androidMode === 'time') {
      setAndroidMode(null);
      if (evt.type !== 'set' || !picked) {
        setAndroidDate(null);
        return;
      }
      const base = androidDate ?? current;
      const combined = new Date(base);
      combined.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      onChange(formatDateToIso(combined));
      setAndroidDate(null);
    }
  };

  return (
    <View>
      <Pressable
        onPress={openPicker}
        disabled={disabled}
        android_ripple={{ color: theme.colors.surfaceVariant }}
        style={[
          styles.affordance,
          {
            borderColor: theme.colors.outline,
            backgroundColor: theme.colors.surface,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
        testID={testID}
        accessibilityLabel={label ? `Edit ${label}` : 'Edit date and time'}
      >
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
          {formatIsoFriendly(value)}
        </Text>
        <Icon source="calendar-clock" size={20} color={theme.colors.onSurfaceVariant} />
      </Pressable>

      {Platform.OS === 'ios' && iosOpen && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={current}
            mode="datetime"
            display="spinner"
            onChange={handleIosChange}
          />
          <Button compact onPress={() => setIosOpen(false)} style={styles.done}>
            Done
          </Button>
        </View>
      )}

      {Platform.OS === 'android' && androidMode !== null && (
        <DateTimePicker
          value={androidMode === 'time' ? androidDate ?? current : current}
          mode={androidMode}
          is24Hour={false}
          display="default"
          onChange={handleAndroidChange}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  affordance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  pickerWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  done: {
    alignSelf: 'flex-end',
  },
});

export default EditableDateTimeField;
