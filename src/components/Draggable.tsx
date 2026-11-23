import React, { useMemo, type MutableRefObject } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

export type DragHandlers<P> = {
  start: (payload: P, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  /** `at` is null when the drag was cancelled. */
  end: (at: { x: number; y: number } | null) => void;
};

/**
 * Press and hold, then drag. Positions are window coordinates. Handlers run on the JS thread and
 * come through a ref, so the gesture survives the parent re-rendering mid-drag. Taps on the child
 * still reach it.
 */
export default function Draggable<P>({
  payload,
  handlers,
  children,
}: {
  payload: P;
  handlers: MutableRefObject<DragHandlers<P>>;
  children: React.ReactNode;
}) {
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activateAfterLongPress(250)
        .onStart((e) => handlers.current.start(payload, e.absoluteX, e.absoluteY))
        .onUpdate((e) => handlers.current.move(e.absoluteX, e.absoluteY))
        .onEnd((e, ok) => handlers.current.end(ok ? { x: e.absoluteX, y: e.absoluteY } : null)),
    [payload, handlers],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false}>{children}</View>
    </GestureDetector>
  );
}
