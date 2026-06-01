import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
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

export function AddressAutocompleteInput({
  label,
  value,
  onChange,
  placeholder = "Search for a street or place…",
  containerStyle,
  leftIcon,
}: AddressAutocompleteInputProps) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const borderColor = focused ? colors.accent : colors.border;

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

  const clearBlurTimeout = () => {
    if (blurTimeout.current != null) {
      clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
  };

  const selectSuggestion = (feature: PhotonFeature) => {
    clearBlurTimeout();
    const labelText = formatPhotonLabel(feature.properties);
    const [lon, lat] = feature.geometry.coordinates;
    onChange(labelText, [lat, lon], feature);
    setSuggestOpen(false);
    setSuggestions([]);
  };

  return (
    <View style={[{ zIndex: suggestOpen ? 20 : 0 }, containerStyle]}>
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
          value={value}
          onChangeText={(text) => onChange(text, null)}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
          autoCapitalize="words"
          onFocus={() => {
            clearBlurTimeout();
            setFocused(true);
            if (suggestions.length > 0) setSuggestOpen(true);
          }}
          onBlur={() => {
            blurTimeout.current = setTimeout(() => {
              setSuggestOpen(false);
              setFocused(false);
            }, 200);
          }}
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

      {suggestOpen && suggestions.length > 0 ? (
        <View
          style={{
            marginTop: 6,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.bgSurface,
            maxHeight: 240,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.35,
            shadowRadius: 16,
            elevation: 12,
            padding: 8,
          }}
        >
          <ScrollView
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
                  onPress={() => selectSuggestion(feature)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: index < suggestions.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                    backgroundColor: pressed
                      ? "rgba(255,45,170,0.12)"
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
      ) : null}
    </View>
  );
}
