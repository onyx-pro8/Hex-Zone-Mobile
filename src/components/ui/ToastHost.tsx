import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
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
  subscribeToast,
  type ToastItem,
  type ToastType,
} from "@/lib/toast";
import { colors, radius, shadow } from "@/theme/colors";

const MAX_VISIBLE = 3;

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
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
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
        if (finished) onDismiss(item.id);
      });
    }, item.duration);

    return () => clearTimeout(timer);
  }, [item.duration, item.id, onDismiss, opacity, translateY]);

  return (
    <Animated.View
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
        onPress={() => onDismiss(item.id)}
        hitSlop={10}
        accessibilityLabel="Dismiss"
        style={styles.dismiss}
      >
        <X size={16} color={tone.muted} />
      </Pressable>
    </Animated.View>
  );
}

/** Global toast stack — mount once near the app root. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return subscribeToast((toast) => {
      setItems((prev) => {
        const next = [...prev, toast];
        return next.length > MAX_VISIBLE
          ? next.slice(next.length - MAX_VISIBLE)
          : next;
      });
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { paddingTop: Math.max(insets.top, 12) + 8 },
      ]}
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
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
