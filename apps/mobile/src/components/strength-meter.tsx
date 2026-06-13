import { View } from "react-native";
import { colors, strengthColor } from "@/lib/theme";

/** Four-segment strength bar, lit up to the zxcvbn score (0–4). Matches web. */
export function StrengthMeter({ score }: { score: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 4, marginTop: 8 }}>
      {[0, 1, 2, 3].map((segment) => (
        <View
          key={segment}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: segment < score ? strengthColor[score] : colors.border,
          }}
        />
      ))}
    </View>
  );
}
