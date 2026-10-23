import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

const BARS = [0, 1, 2, 3, 4];

/**
 * The "Jarvis is thinking" indicator: five small bars breathing in the brand color, the same
 * waveform the admin chat shows while a turn is pending. With reduce-motion on, the bars hold
 * still and pulse opacity instead of stretching.
 */
const ThinkingWave: React.FC<{ color: string }> = ({ color }) => {
  const values = useRef(BARS.map(() => new Animated.Value(0.35))).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => mounted && setReduceMotion(r))
      .catch(() => mounted && setReduceMotion(false));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return undefined;
    const pulse = (v: Animated.Value, delay: number) =>
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.35, duration: 450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
      ]);
    const anims = reduceMotion
      ? [pulse(values[0], 0)] // one slow shared pulse drives opacity below
      : values.map((v, i) => pulse(v, i * 120));
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [reduceMotion, values]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BARS.map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            { backgroundColor: color },
            reduceMotion ? { opacity: values[0] } : { transform: [{ scaleY: values[i] }] },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bar: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
  },
});

export default ThinkingWave;
