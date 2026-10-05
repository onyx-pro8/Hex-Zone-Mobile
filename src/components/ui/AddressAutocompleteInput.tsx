import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import {
  formatPhotonLabel,
  formatPhotonPlaceCategory,
  searchPhotonAddresses,
  type PhotonFeature,
} from "@/lib/addressSearch";
import { colors } from "@/theme/colors";
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";

export type AddressAutocompleteInputProps = {
  label?: string;
  value: string;
  /** `coords` is `[lat, lng]` when a suggestion is chosen, or `null` when the user edits manually. */
  onChange: (
    address: string,
    coords: [number, number] | null,
    feature?: PhotonFeature,
  ) => void;
  placeholder?: string;
  containerStyle?: ViewStyle;
  leftIcon?: ReactNode;
};

type AnchorRect = { x: number; y: number; width: number; height: number };

type DockPayload = {
  suggestions: PhotonFeature[];
  anchor: AnchorRect;
  onSelect: (feature: PhotonFeature) => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
};

type SuggestionDockApi = {
  publish: (payload: DockPayload | null) => void;
};

const SuggestionDockContext = createContext<SuggestionDockApi | null>(null);

function sameRect(a: AnchorRect | null, b: AnchorRect): boolean {
  if (!a) return false;
  return (
    Math.abs(a.x - b.x) < 2 &&
    Math.abs(a.y - b.y) < 2 &&
    Math.abs(a.width - b.width) < 2 &&
    Math.abs(a.height - b.height) < 2
  );
}

function SuggestionRows({
  suggestions,
  maxHeight,
  onSelect,
  onTouchStart,
  onTouchEnd,
}: {
  suggestions: PhotonFeature[];
  maxHeight: number;
  onSelect: (feature: PhotonFeature) => void;
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
}) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.bgSurface,
        maxHeight,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 24,
        padding: 8,
      }}
    >
      <ScrollView
        style={{ maxHeight: Math.max(0, maxHeight - 16), flexGrow: 0 }}
        keyboardShouldPersistTaps="always"
        nestedScrollEnabled
        bounces={false}
      >
        {suggestions.map((feature, index) => {
          const mainLabel = formatPhotonLabel(feature.properties);
          const category = formatPhotonPlaceCategory(feature.properties);
          const sub = [
            category,
            feature.properties.city ||
              feature.properties.town ||
              feature.properties.village,
            feature.properties.country,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <Pressable
              key={`${feature.geometry.coordinates.join(",")}-${index}`}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
              onPressIn={() => onSelect(feature)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderBottomWidth: index < suggestions.length - 1 ? 1 : 0,
                borderBottomColor: colors.border,
                backgroundColor: pressed
                  ? "rgba(47,128,237,0.12)"
                  : "transparent",
              })}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: "600",
                }}
                numberOfLines={2}
              >
                {mainLabel}
              </Text>
              {sub ? (
                <Text
                  style={{
                    color: colors.textDim,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Hosts the address suggestion list above the scroll content so the keyboard
 * and the Previous/Next bar cannot cover it, and so a tap selects a row
 * instead of dismissing the field.
 */
export function AddressSuggestionDock({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<DockPayload | null>(null);
  const api = useMemo<SuggestionDockApi>(() => ({ publish: setPayload }), []);
  const rootRef = useRef<View>(null);
  const [frame, setFrame] = useState<AnchorRect | null>(null);
  const keyboardInset = useKeyboardBottomInset();

  const updateFrame = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      const next = { x, y, width, height };
      setFrame((prev) => (sameRect(prev, next) ? prev : next));
    });
  }, []);

  useEffect(() => {
    if (!payload) return;
    updateFrame();
    const id = setInterval(updateFrame, 160);
    return () => clearInterval(id);
  }, [payload, keyboardInset, updateFrame]);

  const overlay = useMemo(() => {
    if (!payload || !frame || payload.suggestions.length === 0) return null;
    const gap = 6;
    const belowTop = payload.anchor.y + payload.anchor.height - frame.y + gap;
    const spaceBelow = frame.height - belowTop;
    const spaceAbove = payload.anchor.y - frame.y - gap;
    const placeAbove = spaceBelow < 150 && spaceAbove > spaceBelow;
    let maxHeight = Math.min(
      260,
      Math.max(0, placeAbove ? spaceAbove : spaceBelow),
    );
    let top = placeAbove
      ? payload.anchor.y - frame.y - gap - maxHeight
      : belowTop;

    if (top < 8) {
      maxHeight = Math.max(0, maxHeight - (8 - top));
      top = 8;
    }
    if (top + maxHeight > frame.height - 8) {
      maxHeight = frame.height - 8 - top;
    }
    if (maxHeight < 72 || payload.anchor.width < 40) return null;

    return (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: payload.anchor.x - frame.x,
          width: payload.anchor.width,
          top,
          maxHeight,
          zIndex: 40,
          elevation: 24,
        }}
      >
        <SuggestionRows
          suggestions={payload.suggestions}
          maxHeight={maxHeight}
          onSelect={payload.onSelect}
          onTouchStart={payload.onTouchStart}
          onTouchEnd={payload.onTouchEnd}
        />
      </View>
    );
  }, [payload, frame]);

  return (
    <SuggestionDockContext.Provider value={api}>
      <View
        ref={rootRef}
        collapsable={false}
        onLayout={updateFrame}
        style={{ flex: 1 }}
      >
        {children}
        {overlay}
      </View>
    </SuggestionDockContext.Provider>
  );
}

export function AddressAutocompleteInput({
  label,
  value,
  onChange,
  placeholder = "Search for a street or place…",
  containerStyle,
  leftIcon,
}: AddressAutocompleteInputProps) {
  const dock = useContext(SuggestionDockContext);
  const keyboardInset = useKeyboardBottomInset();
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listPressRef = useRef(false);
  const suppressBlurRef = useRef(false);
  const anchorRef = useRef<View>(null);
  const inputRef = useRef<TextInput>(null);
  const selectedRef = useRef(false);
  const selectRef = useRef<(feature: PhotonFeature) => void>(() => {});

  const borderColor = focused ? colors.accent : colors.border;
  const keyboardOpen = keyboardInset > 0;

  const clearBlurTimeout = () => {
    if (blurTimeout.current != null) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
  };

  const measureAnchor = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      const next = { x, y, width, height };
      setAnchor((prev) => (sameRect(prev, next) ? prev : next));
    });
  }, []);

  useEffect(() => {
    if (!focused) {
      setSuggestions([]);
      setLoading(false);
      setSuggestOpen(false);
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      setSuggestOpen(false);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchPhotonAddresses(q, ac.signal)
        .then((features) => {
          setSuggestions(features);
          setSuggestOpen(features.length > 0);
        })
        .catch((err: Error) => {
          if (err.name === "AbortError") return;
          setSuggestions([]);
          setSuggestOpen(false);
        })
        .finally(() => setLoading(false));
    }, 320);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [value, focused]);

  const selectSuggestion = useCallback(
    (feature: PhotonFeature) => {
      selectedRef.current = true;
      suppressBlurRef.current = true;
      listPressRef.current = false;
      clearBlurTimeout();
      const labelText = formatPhotonLabel(feature.properties);
      const [lon, lat] = feature.geometry.coordinates;
      onChange(
        labelText,
        Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null,
        feature,
      );
      setSuggestOpen(false);
      setSuggestions([]);
      setFocused(false);
      Keyboard.dismiss();
    },
    [onChange],
  );

  selectRef.current = selectSuggestion;

  useEffect(() => {
    if (!dock || !suggestOpen) return;
    measureAnchor();
    const id = setInterval(measureAnchor, 160);
    return () => clearInterval(id);
  }, [dock, suggestOpen, keyboardInset, suggestions.length, measureAnchor]);

  useEffect(() => {
    if (!dock) return;
    if (!suggestOpen || suggestions.length === 0 || !anchor) {
      dock.publish(null);
      return;
    }
    dock.publish({
      suggestions,
      anchor,
      onSelect: (feature) => selectRef.current(feature),
      onTouchStart: () => {
        listPressRef.current = true;
        clearBlurTimeout();
      },
      onTouchEnd: () => {
        listPressRef.current = false;
        if (!selectedRef.current) inputRef.current?.focus();
      },
    });
  }, [dock, suggestOpen, suggestions, anchor]);

  useEffect(() => {
    if (!dock) return;
    return () => dock.publish(null);
  }, [dock]);

  useEffect(() => () => clearBlurTimeout(), []);

  const closeFromBlur = () => {
    clearBlurTimeout();
    blurTimeout.current = setTimeout(() => {
      if (suppressBlurRef.current) return;
      if (listPressRef.current) {
        closeFromBlur();
        return;
      }
      setFocused(false);
    }, 280);
  };

  const showInline = !dock && suggestOpen && suggestions.length > 0;
  const inlineAbove = showInline && keyboardOpen;
  const inlineList = showInline ? (
    <View style={{ marginTop: inlineAbove ? 0 : 6, marginBottom: inlineAbove ? 6 : 0 }}>
      <SuggestionRows
        suggestions={suggestions}
        maxHeight={keyboardOpen ? 220 : 240}
        onSelect={selectSuggestion}
        onTouchStart={() => {
          listPressRef.current = true;
          clearBlurTimeout();
        }}
        onTouchEnd={() => {
          listPressRef.current = false;
          if (!selectedRef.current) inputRef.current?.focus();
        }}
      />
    </View>
  ) : null;

  return (
    <View style={[{ zIndex: suggestOpen ? 20 : 0 }, containerStyle]}>
      {inlineAbove ? inlineList : null}
      {label ? (
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {label}
        </Text>
      ) : null}
      <View
        ref={anchorRef}
        collapsable={false}
        onLayout={measureAnchor}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.bgCard,
          borderColor,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          minHeight: 52,
        }}
      >
        {leftIcon ? <View style={{ marginRight: 10 }}>{leftIcon}</View> : null}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(text) => {
            suppressBlurRef.current = false;
            onChange(text, null);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
          autoCapitalize="words"
          onFocus={() => {
            clearBlurTimeout();
            selectedRef.current = false;
            suppressBlurRef.current = false;
            setFocused(true);
            if (suggestions.length > 0) setSuggestOpen(true);
            measureAnchor();
          }}
          onBlur={closeFromBlur}
          style={{
            flex: 1,
            color: colors.text,
            fontSize: 15,
            fontWeight: "500",
            paddingVertical: 14,
          }}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : null}
      </View>

      {showInline && !inlineAbove ? inlineList : null}
    </View>
  );
}
