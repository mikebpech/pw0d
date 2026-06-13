import { Stack, useLocalSearchParams } from "expo-router";
import { ItemDetail } from "@/components/item-detail";
import { useVault } from "@/lib/store";

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const name = useVault((state) => state.items.find((item) => item.id === id)?.data.name ?? "");
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <ItemDetail id={id} />
    </>
  );
}
