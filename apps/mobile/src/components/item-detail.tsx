/**
 * Read-only item detail — the phone analog of the web vault's detail pane.
 * Reveals/copies fields, shows live TOTP, and lists URLs. Editing stays on the
 * larger web/extension surfaces for now (Tier 1 companion scope: view + copy).
 */

import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { TotpRow } from "@/components/totp-row";
import { ItemAvatar, SecretRow, ValueRow } from "@/components/ui";
import { useVault } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

const TYPE_LABEL = { login: "login", note: "note", ssh: "SSH key" } as const;

export function ItemDetail({ id }: { id: string }) {
  const item = useVault((state) => state.items.find((entry) => entry.id === id) ?? null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(timer);
  }, [toast]);

  const onCopied = (label: string) => setToast(`${label} copied`);

  const folderName = useVault((state) => (item?.folderId ? state.folders.find((f) => f.id === item.folderId)?.name ?? null : null));

  const rows = useMemo(() => {
    if (!item) return null;
    const data = item.data;
    if (data.type === "login") {
      return (
        <>
          <ValueRow label="username" value={data.username} onCopied={onCopied} />
          <SecretRow label="password" value={data.password} onCopied={onCopied} />
          {data.totp ? <TotpRow stored={data.totp} onCopied={onCopied} /> : null}
          {data.urls.map((url) => (
            <ValueRow key={url} label="url" value={url} onCopied={onCopied} />
          ))}
          {data.notes ? <ValueRow label="notes" value={data.notes} onCopied={onCopied} /> : null}
        </>
      );
    }
    if (data.type === "ssh") {
      const connection = data.username && data.host ? `${data.username}@${data.host}` : data.host || data.username;
      return (
        <>
          {connection ? <ValueRow label="connection" value={connection} onCopied={onCopied} /> : null}
          <ValueRow label="public key" value={data.publicKey} onCopied={onCopied} />
          <SecretRow label="private key" value={data.privateKey} onCopied={onCopied} />
          <SecretRow label="passphrase" value={data.passphrase} onCopied={onCopied} />
          {data.notes ? <ValueRow label="notes" value={data.notes} onCopied={onCopied} /> : null}
        </>
      );
    }
    return <ValueRow label="content" value={data.content} onCopied={onCopied} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>item not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <ItemAvatar name={item.data.name} size={52} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text selectable style={{ color: colors.foreground, fontSize: 22, fontWeight: "800" }}>
              {item.data.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ backgroundColor: colors.secondary, borderRadius: radius.sm, borderCurve: "continuous", paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>
                  {TYPE_LABEL[item.type]}
                </Text>
              </View>
              {folderName ? <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{folderName}</Text> : null}
            </View>
          </View>
        </View>

        {rows}

        <Text style={{ color: colors.subtle, fontSize: 12, marginTop: 4 }}>
          updated {new Date(item.updatedAt).toLocaleDateString()}
        </Text>
      </ScrollView>

      {toast ? (
        <View style={{ position: "absolute", bottom: 32, alignSelf: "center", backgroundColor: colors.cardElevated, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, borderCurve: "continuous", paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}
