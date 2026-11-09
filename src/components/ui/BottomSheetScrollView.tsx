import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useScrollFocusedIntoView } from "@/hooks/useScrollFocusedIntoView";

type ScrollApi = {
  /** Call from input onFocus (or rely on Input.tsx context wiring). */
  onInputFocus: () => void;
  scrollFocusedIntoView: () => void;
};

const BottomSheetScrollContext = createContext<ScrollApi | null>(null);

/** Used by shared Input to scroll the board when a field is focused. */
export function useBottomSheetScrollOnFocus(): () => void {
  const api = useContext(BottomSheetScrollContext);
  return api?.onInputFocus ?? (() => undefined);
}

type Props = ScrollViewProps & {
  children: ReactNode;
  /** Extra bottom padding so the last field/actions can clear the keyboard. */
  keyboardBottomGap?: number;
  /**
   * Optional escape hatch for raw TextInputs (not using Input.tsx):
   * parent can call `focusScrollRef.current?.()` from onFocus.
   */
  focusScrollRef?: MutableRefObject<(() => void) | null>;
};

/**
 * ScrollView for BottomSheet forms: when the keyboard opens (or focus moves),
 * scrolls so the focused input and trailing actions stay tappable.
 */
export const BottomSheetScrollView = forwardRef<ScrollView, Props>(
  function BottomSheetScrollView(
    {
      children,
      contentContainerStyle,
      keyboardBottomGap = 48,
      focusScrollRef,
      onScroll,
      keyboardShouldPersistTaps = "handled",
      keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
      ...rest
    },
    _ref,
  ) {
    const { scrollRef, onScroll: trackScroll, scrollFocusedIntoView } =
      useScrollFocusedIntoView();

    useEffect(() => {
      let retry: ReturnType<typeof setTimeout> | null = null;
      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const showSub = Keyboard.addListener(showEvent, () => {
        // First pass while keyboard animates; second after the sheet
        // finishes resizing so measureInWindow matches the final board.
        scrollFocusedIntoView();
        if (retry) clearTimeout(retry);
        retry = setTimeout(
          () => scrollFocusedIntoView(),
          Platform.OS === "ios" ? 280 : 180,
        );
      });
      return () => {
        showSub.remove();
        if (retry) clearTimeout(retry);
      };
    }, [scrollFocusedIntoView]);

    const onInputFocus = useCallback(() => {
      scrollFocusedIntoView();
    }, [scrollFocusedIntoView]);

    useEffect(() => {
      if (!focusScrollRef) return;
      focusScrollRef.current = onInputFocus;
      return () => {
        focusScrollRef.current = null;
      };
    }, [focusScrollRef, onInputFocus]);

    const api = useMemo<ScrollApi>(
      () => ({ onInputFocus, scrollFocusedIntoView }),
      [onInputFocus, scrollFocusedIntoView],
    );

    const flattened = StyleSheet.flatten(contentContainerStyle) as
      | ViewStyle
      | undefined;
    const basePad =
      typeof flattened?.paddingBottom === "number" ? flattened.paddingBottom : 0;

    return (
      <BottomSheetScrollContext.Provider value={api}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          nestedScrollEnabled
          scrollEventThrottle={16}
          onScroll={(event) => {
            trackScroll(event);
            onScroll?.(event);
          }}
          contentContainerStyle={
            [
              contentContainerStyle,
              { paddingBottom: basePad + keyboardBottomGap },
            ] as StyleProp<ViewStyle>
          }
          {...rest}
        >
          {children}
        </ScrollView>
      </BottomSheetScrollContext.Provider>
    );
  },
);
