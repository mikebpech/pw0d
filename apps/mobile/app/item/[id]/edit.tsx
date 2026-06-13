import { Stack, useLocalSearchParams } from "expo-router";
import { ItemForm } from "@/components/item-form";
import { useVault } from "@/lib/store";

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const name = useVault((state) => state.items.find((item) => item.id === id)?.data.name ?? "");
  return (
    <>
      <Stack.Screen options={{ title: name ? `Edit ${name}` : "Edit item" }} />
      <ItemForm id={id} />
    </>
  );
}
