import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { ToastHost } from "@/components/ui/ToastHost";
import { colors } from "@/theme/colors";

const SLIDE_MS = 280;
/** Keep a dismissible dimmed region above the sheet when the keyboard is open. */
const MIN_BACKDROP_RATIO = 0.18;
const MIN_BACKDROP_PX = 96;
const MIN_SHEET_HEIGHT = 220;

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: number | `${number}%`;
  contentStyle?: ViewStyle;
  overlayColor?: string;
  /** Renders above the sheet and dim, covering the full screen (same Modal). */
  fullScreenOverlay?: ReactNode;
};

function resolveMaxHeight(
  maxHeight: number | `${number}%`,
  windowHeight: number,
): number {
  if (typeof maxHeight === "number") return maxHeight;
  return (windowHeight * Number.parseFloat(maxHeight)) / 100;
}

/**
 * Overlay paints immediately (Modal animationType none). Only the sheet
 * panel slides. The dimmed region is a flex spacer above the sheet, so
 * backdrop taps are not covered by the panel's hit box.
 *
 * When the keyboard is open the sheet is lifted by the keyboard height and
 * capped so it stays on screen — otherwise focused inputs sit behind the
 * keyboard (iOS Modal does not honor adjustResize). A minimum backdrop is
 * always reserved so the sheet + keyboard cannot trap the UI full-screen.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight = "88%",
  contentStyle,
  overlayColor = "rgba(15, 44, 92, 0.4)",
  fullScreenOverlay,
}: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(windowHeight)).current;
  const wasVisible = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      const next = Math.max(0, event.endCoordinates?.height ?? 0);
      setKeyboardHeight(next);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      Keyboard.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      translateY.setValue(windowHeight);
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else if (!visible) {
      translateY.setValue(windowHeight);
    }
    wasVisible.current = visible;
  }, [visible, windowHeight, translateY]);

  const keyboardOpen = keyboardHeight > 0;
  const minBackdrop = keyboardOpen
    ? Math.max(MIN_BACKDROP_PX, Math.round(windowHeight * MIN_BACKDROP_RATIO))
    : 0;
  const requestedMax = resolveMaxHeight(maxHeight, windowHeight);
  const available = Math.max(
    MIN_SHEET_HEIGHT,
    windowHeight - keyboardHeight - minBackdrop,
  );
  const sheetMaxHeight = Math.min(requestedMax, available);

  const handleBackdropPress = useCallback(() => {
    if (keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  }, [keyboardHeight, onClose]);

  const handleRequestClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <View style={[styles.root, { backgroundColor: overlayColor }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={handleBackdropPress}
          style={styles.backdrop}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxHeight,
              // Bound height while keyboard is open so nested ScrollViews can
              // scroll, but never consume the reserved backdrop above.
              ...(keyboardOpen ? { height: sheetMaxHeight } : null),
              marginBottom: keyboardHeight,
              transform: [{ translateY }],
            },
            contentStyle,
          ]}
        >
          <View style={keyboardOpen ? styles.sheetBodyKeyboard : styles.sheetBody}>
            {children}
          </View>
        </Animated.View>
        {fullScreenOverlay ? (
          <View style={styles.fullScreenOverlay} pointerEvents="box-none">
            {fullScreenOverlay}
          </View>
        ) : null}
        {/* Same Modal layer as the sheet — visible above it, does not block taps. */}
        <ToastHost />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
    width: "100%",
    overflow: "hidden",
  },
  sheetBody: {
    width: "100%",
  },
  sheetBodyKeyboard: {
    width: "100%",
    flex: 1,
  },
  fullScreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
});
