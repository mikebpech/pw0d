import { type ItemData, type ItemType, isValidTotpInput, scorePassword } from "@pw0d/core";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, ScrollView, Switch, Text, View } from "react-native";
import { GeneratorPanel } from "@/components/generator-panel";
import { StrengthMeter } from "@/components/strength-meter";
import { Button, Chip, TextField } from "@/components/ui";
import { type VaultItem, useVault } from "@/lib/store";
import { colors, radius } from "@/lib/theme";

const NO_FOLDER = "__none__";

interface Draft {
  type: ItemType;
  name: string;
  username: string;
  password: string;
  totp: string;
  urls: string;
  notes: string;
  content: string;
  host: string;
  publicKey: string;
  privateKey: string;
  passphrase: string;
  folderId: string;
}

const EMPTY_DRAFT: Draft = {
  type: "login",
  name: "",
  username: "",
  password: "",
  totp: "",
  urls: "",
  notes: "",
  content: "",
  host: "",
  publicKey: "",
  privateKey: "",
  passphrase: "",
  folderId: NO_FOLDER,
};

const TYPES: { value: ItemType; label: string }[] = [
  { value: "login", label: "Login" },
  { value: "ssh", label: "SSH" },
  { value: "note", label: "Note" },
];

function draftForItem(item: VaultItem | null, fallbackType: ItemType): Draft {
  if (!item) return { ...EMPTY_DRAFT, type: fallbackType };
  const data = item.data;
  return {
    ...EMPTY_DRAFT,
    type: item.type,
    name: data.name,
    username: data.type === "login" || data.type === "ssh" ? data.username : "",
    password: data.type === "login" ? data.password : "",
    totp: data.type === "login" ? (data.totp ?? "") : "",
    urls: data.type === "login" ? data.urls.join("\n") : "",
    notes: data.type === "login" || data.type === "ssh" ? data.notes : "",
    content: data.type === "note" ? data.content : "",
    host: data.type === "ssh" ? data.host : "",
    publicKey: data.type === "ssh" ? data.publicKey : "",
    privateKey: data.type === "ssh" ? data.privateKey : "",
    passphrase: data.type === "ssh" ? data.passphrase : "",
    folderId: item.folderId ?? NO_FOLDER,
  };
}

function buildData(draft: Draft, previous: VaultItem | null): ItemData {
  const name = draft.name.trim() || "Untitled";
  if (draft.type === "login") {
    return {
      type: "login",
      name,
      username: draft.username,
      password: draft.password,
      urls: draft.urls
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean),
      notes: draft.notes,
      customFields: previous?.data.type === "login" ? previous.data.customFields : [],
      ...(draft.totp.trim() ? { totp: draft.totp.trim() } : {}),
    };
  }
  if (draft.type === "ssh") {
    return {
      type: "ssh",
      name,
      host: draft.host,
      username: draft.username,
      publicKey: draft.publicKey,
      privateKey: draft.privateKey,
      passphrase: draft.passphrase,
      notes: draft.notes,
    };
  }
  return { type: "note", name, content: draft.content };
}

export function ItemForm({ id, initialType = "login" }: { id?: string; initialType?: ItemType }) {
  const item = useVault((state) => (id ? state.items.find((entry) => entry.id === id) ?? null : null));
  const folders = useVault((state) => state.folders);
  const createItem = useVault((state) => state.createItem);
  const updateItem = useVault((state) => state.updateItem);
  const deleteItem = useVault((state) => state.deleteItem);
  const [draft, setDraft] = useState(() => draftForItem(item, initialType));
  const [showGenerator, setShowGenerator] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(draftForItem(item, initialType));
  }, [item, initialType]);

  const canChangeType = !id;
  const strength = draft.password ? scorePassword(draft.password).score : null;
  const invalidTotp = draft.type === "login" && draft.totp.trim() && !isValidTotpInput(draft.totp.trim());
  const title = id ? "Edit item" : "New item";

  const folderChoices = useMemo(() => [{ id: NO_FOLDER, name: "No folder" }, ...folders], [folders]);

  async function save() {
    if (!draft.name.trim() || invalidTotp) return;
    setBusy(true);
    const folderId = draft.folderId === NO_FOLDER ? null : draft.folderId;
    try {
      if (id) {
        await updateItem(id, buildData(draft, item), folderId);
        router.back();
      } else {
        const nextId = await createItem(buildData(draft, null), folderId);
        router.replace(`/item/${nextId}`);
      }
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!id || !item) return;
    Alert.alert(`Delete ${item.data.name}?`, "This permanently removes the item from your vault.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteItem(id);
            router.dismissTo("/");
          } catch (error) {
            Alert.alert("Delete failed", error instanceof Error ? error.message : "Try again.");
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 48 }}>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: "800" }}>{title}</Text>

        {canChangeType ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {TYPES.map((type) => (
              <Chip key={type.value} label={type.label} active={draft.type === type.value} onPress={() => setDraft({ ...draft, type: type.value })} />
            ))}
          </View>
        ) : null}

        <Field label="Name">
          <TextField value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="GitHub" autoCapitalize="words" />
        </Field>

        {draft.type === "login" ? (
          <>
            <Field label="Username / email">
              <TextField value={draft.username} onChangeText={(username) => setDraft({ ...draft, username })} autoCapitalize="none" autoCorrect={false} />
            </Field>
            <Field label="Password">
              <TextField value={draft.password} onChangeText={(password) => setDraft({ ...draft, password })} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              {strength !== null ? <StrengthMeter score={strength} /> : null}
              <ToggleLink label="Show generator" value={showGenerator} onChange={setShowGenerator} />
              {showGenerator ? (
                <Panel>
                  <GeneratorPanel onUse={(password) => setDraft((current) => ({ ...current, password }))} />
                </Panel>
              ) : null}
            </Field>
            <Field label="URLs">
              <TextField
                value={draft.urls}
                onChangeText={(urls) => setDraft({ ...draft, urls })}
                placeholder="https://github.com/login"
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                style={{ minHeight: 86, paddingTop: 12, textAlignVertical: "top" }}
              />
            </Field>
            <Field label="One-time code">
              <TextField value={draft.totp} onChangeText={(totp) => setDraft({ ...draft, totp })} placeholder="otpauth:// URI or base32 secret" autoCapitalize="none" autoCorrect={false} />
              {invalidTotp ? <Text style={{ color: colors.destructive, fontSize: 12 }}>Invalid TOTP secret or URI</Text> : null}
            </Field>
            <Field label="Notes">
              <TextField value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline style={{ minHeight: 96, paddingTop: 12, textAlignVertical: "top" }} />
            </Field>
          </>
        ) : null}

        {draft.type === "ssh" ? (
          <>
            <Field label="Host">
              <TextField value={draft.host} onChangeText={(host) => setDraft({ ...draft, host })} autoCapitalize="none" autoCorrect={false} />
            </Field>
            <Field label="User">
              <TextField value={draft.username} onChangeText={(username) => setDraft({ ...draft, username })} autoCapitalize="none" autoCorrect={false} />
            </Field>
            <Field label="Public key">
              <TextField value={draft.publicKey} onChangeText={(publicKey) => setDraft({ ...draft, publicKey })} multiline style={{ minHeight: 96, paddingTop: 12, textAlignVertical: "top" }} />
            </Field>
            <Field label="Private key">
              <TextField value={draft.privateKey} onChangeText={(privateKey) => setDraft({ ...draft, privateKey })} secureTextEntry multiline style={{ minHeight: 132, paddingTop: 12, textAlignVertical: "top" }} />
            </Field>
            <Field label="Passphrase">
              <TextField value={draft.passphrase} onChangeText={(passphrase) => setDraft({ ...draft, passphrase })} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            </Field>
            <Field label="Notes">
              <TextField value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline style={{ minHeight: 96, paddingTop: 12, textAlignVertical: "top" }} />
            </Field>
          </>
        ) : null}

        {draft.type === "note" ? (
          <Field label="Content">
            <TextField value={draft.content} onChangeText={(content) => setDraft({ ...draft, content })} multiline style={{ minHeight: 220, paddingTop: 12, textAlignVertical: "top" }} />
          </Field>
        ) : null}

        <Field label="Folder">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {folderChoices.map((folder) => (
              <Chip key={folder.id} label={folder.name} active={draft.folderId === folder.id} onPress={() => setDraft({ ...draft, folderId: folder.id })} />
            ))}
          </ScrollView>
        </Field>

        <View style={{ gap: 10, marginTop: 6 }}>
          <Button label={busy ? "Encrypting..." : "Save"} onPress={() => void save()} busy={busy} disabled={!draft.name.trim() || Boolean(invalidTotp)} />
          {id ? <Button label="Delete" variant="destructive" onPress={confirmDelete} /> : null}
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.subtle, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</Text>
      {children}
    </View>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.cardElevated, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, borderCurve: "continuous", padding: 12 }}>
      {children}
    </View>
  );
}

function ToggleLink({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} thumbColor={colors.foreground} />
    </View>
  );
}
