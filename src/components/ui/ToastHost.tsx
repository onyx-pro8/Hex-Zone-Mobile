import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react-native";
import {
  dismissToast,
  subscribeToastStack,
  type ToastItem,
  type ToastType,
} from "@/lib/toast";
import { colors, radius, shadow } from "@/theme/colors";

type Tone = {
  border: string;
  bg: string;
  text: string;
  muted: string;
  icon: string;
};

function toneFor(type: ToastType): Tone {
  switch (type) {
    case "success":
      return {
        border: "rgba(47,162,74,0.45)",
        bg: "#EAF7EE",
        text: "#1B5E2A",
        muted: "#3D7A4A",
        icon: colors.success,
      };
    case "warning":
      return {
        border: "rgba(224,153,42,0.5)",
        bg: "#FBF3E4",
        text: "#7A4E10",
        muted: "#9A6A28",
        icon: colors.warning,
      };
    case "error":
      return {
        border: "rgba(226,59,78,0.45)",
        bg: "#FCEAED",
        text: "#7A1622",
        muted: "#9A3A46",
        icon: colors.danger,
      };
    default:
      return {
        border: "rgba(47,128,237,0.4)",
        bg: "#EAF2FC",
        text: colors.text,
        muted: colors.textMuted,
        icon: colors.accent,
      };
  }
}

function ToastIcon({ type, color }: { type: ToastType; color: string }) {
  const size = 18;
  switch (type) {
    case "success":
      return <CheckCircle2 size={size} color={color} />;
    case "warning":
      return <AlertTriangle size={size} color={color} />;
    case "error":
      return <XCircle size={size} color={color} />;
    default:
      return <Info size={size} color={color} />;
  }
}

function ToastCard({
  item,
  manageLifetime,
}: {
  item: ToastItem;
  manageLifetime: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const tone = toneFor(item.type);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    if (!manageLifetime) return;

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -8,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) dismissToast(item.id);
      });
    }, item.duration);

    return () => clearTimeout(timer);
  }, [item.duration, item.id, manageLifetime, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[
        styles.card,
        {
          opacity,
          transform: [{ translateY }],
          borderColor: tone.border,
          backgroundColor: tone.bg,
        },
        shadow.card,
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.iconWrap}>
        <ToastIcon type={item.type} color={tone.icon} />
      </View>
      <View style={styles.body}>
        {item.title ? (
          <Text style={[styles.title, { color: tone.text }]} numberOfLines={2}>
            {item.title}
          </Text>
        ) : null}
        <Text style={[styles.message, { color: tone.muted }]} numberOfLines={5}>
          {item.message}
        </Text>
      </View>
      <Pressable
        onPress={() => dismissToast(item.id)}
        hitSlop={10}
        accessibilityLabel="Dismiss"
        style={styles.dismiss}
      >
        <X size={16} color={tone.muted} />
      </Pressable>
    </Animated.View>
  );
}

type ToastHostProps = {
  /**
   * Primary host owns auto-dismiss timers. Mount once at the app root.
   * Extra hosts inside Modals/BottomSheets should omit this so timers are not doubled.
   */
  primary?: boolean;
};

/**
 * Toast stack overlay.
 * Primary host uses a transparent Modal so toasts stack above other Modals
 * (invite detail, bottom sheets). pointerEvents="box-none" keeps empty space
 * from eating taps where the platform allows it.
 */
export function ToastHost({ primary = false }: ToastHostProps) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToastStack(setItems), []);

  if (items.length === 0) return null;

  const stack = (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          { paddingTop: Math.max(insets.top, 12) + 8 },
        ]}
      >
        {items.map((item) => (
          <ToastCard
            key={item.id}
            item={item}
            manageLifetime={primary}
          />
        ))}
      </View>
    </View>
  );

  if (!primary) return stack;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => {
        items.forEach((item) => dismissToast(item.id));
      }}
    >
      {stack}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  host: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: "stretch",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconWrap: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  dismiss: {
    marginTop: 1,
    padding: 2,
  },
});
