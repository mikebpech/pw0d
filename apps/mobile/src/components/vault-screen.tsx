/**
 * The vault list — the phone's home screen. Mirrors the web vault's middle
 * pane: type filters, search-as-you-type, and a tappable row per item that
 * pushes the detail screen.
 */

import type { ItemType } from "@pw0d/core";
import { router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Chip, ItemAvatar, TextField } from "@/components/ui";
import { type VaultItem, useVault } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

type Filter = "all" | ItemType;

function subtitle(item: VaultItem): string {
  if (item.data.type === "login") {
    if (item.data.username) return item.data.username;
    const url = item.data.urls[0];
    if (url) {
      try {
        return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
      } catch {
        return url;
      }
    }
    return "—";
  }
  if (item.data.type === "ssh") {
    const { username, host } = item.data;
    return username && host ? `${username}@${host}` : host || username || "—";
  }
  return item.data.content.slice(0, 60) || "—";
}

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "login", label: "Logins" },
  { value: "ssh", label: "SSH" },
  { value: "note", label: "Notes" },
];

export function VaultScreen() {
  const items = useVault((state) => state.items);
  const syncNow = useVault((state) => state.syncNow);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(() => {
    let list = filter === "all" ? items : items.filter((item) => item.type === filter);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter((item) => {
        const haystack = [
          item.data.name,
          item.data.type === "login" ? item.data.username : "",
          item.data.type === "login" ? item.data.urls.join(" ") : "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      });
    }
    return list;
  }, [items, filter, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
    } catch {
      // surfaced elsewhere; pull-to-refresh stays quiet
    } finally {
      setRefreshing(false);
    }
  }, [syncNow]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="on-drag"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.mutedForeground} />}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <TextField value={query} onChangeText={setQuery} placeholder="Search vault" autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {FILTERS.map((entry) => (
              <Chip key={entry.value} label={entry.label} active={filter === entry.value} onPress={() => setFilter(entry.value)} />
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={{ alignItems: "center", paddingVertical: 64, gap: 6 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>nothing here</Text>
          <Text style={{ color: colors.subtle, fontSize: 13 }}>{query ? "try a different search" : "your vault is empty"}</Text>
        </View>
      }
      renderItem={({ item }) => <Row item={item} />}
    />
  );
}

function Row({ item }: { item: VaultItem }) {
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={({ pressed }) => ({
        opacity: pressed ? 0.72 : 1,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.lg,
        borderCurve: "continuous",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      <ItemAvatar name={item.data.name} size={40} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 16, fontWeight: "700" }}>
          {item.data.name}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 13 }}>
          {subtitle(item)}
        </Text>
      </View>
      {item.data.type === "login" && item.data.totp ? (
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}>2FA</Text>
      ) : null}
    </Pressable>
  );
}
