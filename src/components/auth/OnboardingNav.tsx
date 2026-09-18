import { View, type ViewStyle } from "react-native";
import { Button } from "@/components/ui/Button";

type OnboardingNavProps = {
  onPrevious?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  previousLabel?: string;
  nextLoading?: boolean;
  nextDisabled?: boolean;
  showPrevious?: boolean;
  style?: ViewStyle;
};

export function OnboardingNav({
  onPrevious,
  onNext,
  nextLabel = "Next",
  previousLabel = "Previous",
  nextLoading,
  nextDisabled,
  showPrevious = true,
  style,
}: OnboardingNavProps) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          width: "100%",
          gap: showPrevious ? 12 : 0,
        },
        style,
      ]}
    >
      {showPrevious ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Button
            label={previousLabel}
            variant="outline"
            onPress={onPrevious}
            fullWidth
            disabled={nextLoading}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Button
          label={nextLabel}
          onPress={onNext}
          loading={nextLoading}
          disabled={nextDisabled}
          fullWidth
        />
      </View>
    </View>
  );
}
