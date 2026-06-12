import { generatePassword } from "@pw0d/core";
import { hostnameOf, urlMatchScore } from "@/lib/matching";
import type { BgRequest, CredentialMatch, ItemSummary, PendingSave } from "@/lib/messages";
import * as session from "@/lib/session";

export default defineBackground(() => {
  // ---- auto-lock ----
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === session.LOCK_ALARM) void session.lock();
  });

  // ---- keyboard shortcut: fill best match on the active tab ----
  browser.commands.onCommand.addListener((command) => {
    if (command === "fill-login") void fillActiveTab();
  });

  // ---- context menu ----
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: "pw0d-fill",
      title: "pw0d: fill login",
      contexts: ["editable"],
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pw0d-fill" && tab?.id) {
      void browser.tabs.sendMessage(tab.id, { type: "fillBestMatch" });
    }
  });

  async function fillActiveTab(): Promise<boolean> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return false;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "fillBestMatch" });
      return true;
    } catch {
      return false; // no content script on this page (chrome://, store, etc.)
    }
  }

  async function credentialsForUrl(url: string): Promise<CredentialMatch[]> {
    const items = await session.decryptedItems();
    const matches: CredentialMatch[] = [];
    for (const item of items) {
      if (item.data.type !== "login") continue;
      const score = urlMatchScore(item.data.urls, url);
      if (score === 0) continue;
      matches.push({
        id: item.id,
        name: item.data.name,
        username: item.data.username,
        password: item.data.password,
        totp: item.data.totp ?? null,
        score,
      });
    }
    return matches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  // Pending save offer, survives the post-submit navigation.
  async function setPendingSave(pending: PendingSave | null): Promise<void> {
    if (pending) {
      await browser.storage.session.set({ pendingSave: pending, pendingSaveAt: Date.now() });
    } else {
      await browser.storage.session.remove(["pendingSave", "pendingSaveAt"]);
    }
  }

  async function getPendingSave(): Promise<PendingSave | null> {
    const { pendingSave, pendingSaveAt } = await browser.storage.session.get([
      "pendingSave",
      "pendingSaveAt",
    ]);
    if (!pendingSave || typeof pendingSaveAt !== "number") return null;
    if (Date.now() - pendingSaveAt > 60_000) {
      await setPendingSave(null);
      return null;
    }
    return pendingSave as PendingSave;
  }

  // ---- message router ----
  // Chrome's native onMessage ignores returned Promises — use sendResponse.
  browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    void handle(raw as BgRequest).then(sendResponse);
    return true;
  });

  function handle(message: BgRequest): Promise<unknown> {
    switch (message.type) {
      case "getState":
        return session.getStatus();

      case "login":
        return session
          .login(message.serverUrl, message.email, message.password, message.totpCode)
          .then(() => ({ ok: true as const }))
          .catch((error: unknown) => {
            const code = error && typeof error === "object" && "code" in error ? error.code : null;
            if (code === "totp_required") {
              return { ok: false as const, error: "enter your authenticator code", needsTotp: true };
            }
            return {
              ok: false as const,
              error: error instanceof Error ? error.message : "login failed",
            };
          });

      case "unlock":
        return session
          .unlock(message.password)
          .then(() => ({ ok: true as const }))
          .catch(() => ({ ok: false as const, error: "wrong master password" }));

      case "lock":
        return session.lock().then(() => ({ ok: true as const }));

      case "logout":
        return session.logout().then(() => ({ ok: true as const }));

      case "sync":
        return session
          .sync()
          .then(() => ({ ok: true as const }))
          .catch((error: unknown) => ({
            ok: false as const,
            error: error instanceof Error ? error.message : "sync failed",
          }));

      case "search":
        return session.decryptedItems().then((items) => {
          const query = message.query.trim().toLowerCase();
          const summaries: ItemSummary[] = items
            .filter((item) => {
              if (!query) return true;
              const haystack = [
                item.data.name,
                "username" in item.data ? item.data.username : "",
                item.data.type === "login" ? item.data.urls.join(" ") : "",
              ]
                .join(" ")
                .toLowerCase();
              return haystack.includes(query);
            })
            .map((item) => ({
              id: item.id,
              type: item.data.type,
              name: item.data.name,
              username: "username" in item.data ? item.data.username : "",
              host:
                item.data.type === "login" && item.data.urls[0]
                  ? hostnameOf(item.data.urls[0])
                  : null,
              hasTotp: item.data.type === "login" && !!item.data.totp,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          return { items: summaries };
        });

      case "getItem":
        return session
          .decryptedItems()
          .then((items) => ({ data: items.find((item) => item.id === message.id)?.data ?? null }));

      case "credentialsForUrl":
        return credentialsForUrl(message.url).then((matches) => ({ matches }));

      case "menuState":
        return (async () => {
          const { status } = await session.getStatus();
          if (status !== "unlocked") return { status, matches: [], suggestions: [] };
          const matches = await credentialsForUrl(message.url);
          // Signup prefill: the user's most-used email-style usernames.
          const counts = new Map<string, number>();
          for (const item of await session.decryptedItems()) {
            const username = "username" in item.data ? item.data.username.trim() : "";
            if (username.includes("@")) counts.set(username, (counts.get(username) ?? 0) + 1);
          }
          const suggestions = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([username]) => username);
          return { status, matches, suggestions };
        })();

      case "fillIntoActiveTab":
        return (async () => {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return { ok: false };
          const items = await session.decryptedItems();
          const item = items.find((entry) => entry.id === message.id);
          if (!item || item.data.type !== "login") return { ok: false };
          try {
            await browser.tabs.sendMessage(tab.id, {
              type: "fillCredential",
              username: item.data.username,
              password: item.data.password,
            });
            return { ok: true };
          } catch {
            return { ok: false };
          }
        })();

      case "generate":
        return Promise.resolve({ password: generatePassword(message.options) });

      case "openPopup":
        return (async () => {
          try {
            await browser.action.openPopup();
            return { ok: true };
          } catch {
            // openPopup needs a user gesture the SW doesn't have — fall back
            // to a small standalone window of the same UI.
            try {
              await browser.windows.create({
                url: browser.runtime.getURL("/popup.html"),
                type: "popup",
                width: 390,
                height: 600,
              });
              return { ok: true };
            } catch {
              return { ok: false };
            }
          }
        })();

      case "loginSubmitted":
        return (async () => {
          const { status } = await session.getStatus();
          if (status !== "unlocked" || !message.password) return { ok: true as const };
          const host = hostnameOf(message.url);
          if (!host) return { ok: true as const };
          const matches = await credentialsForUrl(message.url);
          const sameUser = matches.find((match) => match.username === message.username);
          if (!sameUser) {
            await setPendingSave({
              kind: "save",
              url: message.url,
              host,
              username: message.username,
              password: message.password,
            });
          } else if (sameUser.password !== message.password) {
            await setPendingSave({
              kind: "update",
              url: message.url,
              host,
              username: message.username,
              password: message.password,
              itemId: sameUser.id,
              itemName: sameUser.name,
            });
          }
          return { ok: true as const };
        })();

      case "getPendingSave":
        return (async () => {
          const pending = await getPendingSave();
          if (!pending) return { pending: null, candidates: [] };
          // Only surface the offer on pages of the same registrable domain.
          if (urlMatchScore([pending.url], message.url) === 0) return { pending: null, candidates: [] };
          const candidates = (await credentialsForUrl(pending.url)).map((match) => ({
            id: match.id,
            name: match.name,
            username: match.username,
          }));
          return { pending, candidates };
        })();

      case "resolvePendingSave":
        return (async () => {
          const pending = await getPendingSave();
          await setPendingSave(null);
          if (!pending || !message.accept) return { ok: true };
          const username = message.username ?? pending.username;
          const password = message.password || pending.password;
          try {
            if (message.targetItemId) {
              await session.updateLoginCredential(message.targetItemId, { username, password });
            } else {
              await session.saveNewLogin({
                name: message.name?.trim() || pending.host,
                username,
                password,
                url: pending.url,
              });
            }
            return { ok: true };
          } catch (error) {
            return { ok: false, error: error instanceof Error ? error.message : "save failed" };
          }
        })();
    }
  }
});
