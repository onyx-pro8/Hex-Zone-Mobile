import { useCallback, useRef } from "react";
import {
  Platform,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from "react-native";

/** Extra space under the focused field so trailing actions (e.g. Validate) stay reachable. */
const TRAILING_ACTION_ROOM = 88;
const TOP_PADDING = 16;

/**
 * Keeps the focused TextInput visible inside a ScrollView after the keyboard
 * opens or the user moves focus between fields.
 */
export function useScrollFocusedIntoView() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollYRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  const scrollFocusedIntoView = useCallback(() => {
    const delay = Platform.OS === "android" ? 120 : 60;
    setTimeout(() => {
      const scroll = scrollRef.current;
      if (!scroll) return;

      const focused =
        typeof TextInput.State?.currentlyFocusedInput === "function"
          ? TextInput.State.currentlyFocusedInput()
          : null;

      if (!focused || typeof (focused as { measureInWindow?: unknown }).measureInWindow !== "function") {
        scroll.scrollToEnd({ animated: true });
        return;
      }

      (focused as {
        measureInWindow: (
          cb: (x: number, y: number, w: number, h: number) => void,
        ) => void;
      }).measureInWindow((fx, fy, _fw, fh) => {
        scroll.measureInWindow((sx, sy, _sw, sh) => {
          if (sh <= 0) {
            scroll.scrollToEnd({ animated: true });
            return;
          }

          const visibleTop = sy + TOP_PADDING;
          const visibleBottom = sy + sh - TOP_PADDING;
          const targetTop = fy;
          const targetBottom = fy + fh + TRAILING_ACTION_ROOM;
          let nextY = scrollYRef.current;

          if (targetTop < visibleTop) {
            nextY -= visibleTop - targetTop;
          } else if (targetBottom > visibleBottom) {
            nextY += targetBottom - visibleBottom;
          } else {
            return;
          }

          scroll.scrollTo({ y: Math.max(0, nextY), animated: true });
        });
      });
    }, delay);
  }, []);

  return { scrollRef, onScroll, scrollFocusedIntoView };
}
