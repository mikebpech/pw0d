import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { GeneratorPanel } from "@/components/generator-panel";
import { colors, radius } from "@/lib/theme";

export default function GeneratorScreen() {
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), 1400);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18 }}>
        <GeneratorPanel onCopied={() => setToast(true)} />
      </ScrollView>
      {toast ? (
        <View
          style={{
            position: "absolute",
            bottom: 40,
            alignSelf: "center",
            backgroundColor: colors.cardElevated,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            borderCurve: "continuous",
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>Copied to clipboard</Text>
        </View>
      ) : null}
    </View>
  );
}
