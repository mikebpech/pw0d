import type { ItemType } from "@pw0d/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { ItemForm } from "@/components/item-form";

function initialType(raw: string | undefined): ItemType {
  return raw === "ssh" || raw === "note" || raw === "login" ? raw : "login";
}

export default function NewItemScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "New item" }} />
      <ItemForm initialType={initialType(type)} />
    </>
  );
}
