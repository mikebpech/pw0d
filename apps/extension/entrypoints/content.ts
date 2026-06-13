/**
 * Autofill content script. Principles:
 * - UI lives in a CLOSED shadow root — page JS can't read the menu's DOM.
 * - Fills happen only on explicit user action (click in our menu, keyboard
 *   command, context menu). Never on page load.
 * - Top frame only (manifest default) — no cross-origin iframe fills.
 * - Credentials are requested from the background per-interaction and never
 *   stored in page-reachable state.
 */

import { totpCodeFor } from "@pw0d/core";
import {
  classifyForm as classifyAutofillForm,
  iconTargetKeys,
  isLoginishField,
  isOtpField as isAutofillOtpField,
  usernameFieldFor as usernameDescriptorFor,
  visibleField,
  type ButtonDescriptor,
  type FieldDescriptor,
  type PageDescriptor,
} from "@/lib/autofill";
import type { BgRequest, BgResponse, CredentialMatch, PendingSave } from "@/lib/messages";
import { sendToBackground } from "@/lib/messages";

/**
 * When the extension is reloaded/updated, content scripts in already-open tabs
 * are orphaned: every runtime call throws "Extension context invalidated".
 * Fail silent — the next page refresh gets a fresh, working script.
 */
async function safeSend<T extends BgRequest["type"]>(
  request: Extract<BgRequest, { type: T }>,
): Promise<BgResponse[T] | null> {
  try {
    return await sendToBackground(request);
  } catch {
    return null;
  }
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  main() {
    const ui = createUiLayer();

    // ---------- field discovery (shadow-DOM aware) ----------
    // Sites like Reddit render login forms inside web components. Plain
    // querySelectorAll can't see into shadow roots and focus events are
    // retargeted at the boundary — so all discovery walks open shadow roots
    // and event handling uses composedPath().

    /** All inputs in flattened document order, descending into open shadow roots. */
    function allInputsDeep(root: ParentNode = document, out: HTMLInputElement[] = []): HTMLInputElement[] {
      for (const element of root.querySelectorAll("*")) {
        if (element instanceof HTMLInputElement) out.push(element);
        if (element.shadowRoot) allInputsDeep(element.shadowRoot, out);
      }
      return out;
    }

    function inputKey(input: HTMLInputElement): string {
      const inputs = allInputsDeep();
      return `field-${inputs.indexOf(input)}`;
    }

    function formKeyFor(input: HTMLInputElement): string | null {
      if (!input.form) return null;
      return `form-${Array.from(document.forms).indexOf(input.form)}`;
    }

    function descriptorFor(input: HTMLInputElement, order: number): FieldDescriptor {
      const rect = input.getBoundingClientRect();
      return {
        key: `field-${order}`,
        order,
        type: input.type,
        name: input.name,
        id: input.id,
        autocomplete: input.autocomplete,
        placeholder: input.placeholder,
        ariaLabel: input.getAttribute("aria-label") ?? "",
        formKey: formKeyFor(input),
        width: rect.width,
        height: rect.height,
        disabled: input.disabled,
        readOnly: input.readOnly,
      };
    }

    function pageDescriptor(): PageDescriptor {
      const inputs = allInputsDeep();
      const buttons: ButtonDescriptor[] = [];
      for (const button of document.querySelectorAll('button, input[type="submit"]')) {
        const form = button instanceof HTMLButtonElement || button instanceof HTMLInputElement ? button.form : null;
        buttons.push({
          text: button.textContent ?? "",
          value: button instanceof HTMLInputElement ? button.value : "",
          type: button instanceof HTMLButtonElement || button instanceof HTMLInputElement ? button.type : "",
          formKey: form ? `form-${Array.from(document.forms).indexOf(form)}` : null,
        });
      }
      return {
        pathname: location.pathname,
        title: document.title,
        fields: inputs.map(descriptorFor),
        buttons,
      };
    }

    function descriptorInput(page: PageDescriptor, descriptor: FieldDescriptor | null): HTMLInputElement | null {
      if (!descriptor) return null;
      return allInputsDeep()[descriptor.order] ?? null;
    }

    function visible(input: HTMLInputElement): boolean {
      return visibleField(descriptorFor(input, allInputsDeep().indexOf(input)));
    }

    function passwordFields(): HTMLInputElement[] {
      return allInputsDeep().filter((input) => input.type === "password" && visible(input));
    }

    /** The text/email input that most plausibly holds the username for a password field. */
    function usernameFieldFor(password: HTMLInputElement): HTMLInputElement | null {
      const page = pageDescriptor();
      const descriptor = page.fields.find((field) => field.key === inputKey(password)) ?? null;
      return descriptorInput(page, descriptor ? usernameDescriptorFor(page, descriptor) : null);
    }

    /** Real event target, piercing open shadow roots. */
    function deepTarget(event: Event): EventTarget | null {
      return event.composedPath()[0] ?? event.target;
    }

    // ---------- form classification ----------
    // Login forms get matches (never a generator); signup/change-password
    // forms get generate + email prefill instead.

    function classifyForm(input: HTMLInputElement): "login" | "signup" | "change-password" {
      const page = pageDescriptor();
      const descriptor = page.fields.find((field) => field.key === inputKey(input));
      return descriptor ? classifyAutofillForm(page, descriptor) : "login";
    }

    function isLoginish(input: HTMLInputElement): boolean {
      return isLoginishField(descriptorFor(input, allInputsDeep().indexOf(input)));
    }

    /** 2FA code inputs (the page after a successful password login). */
    function isOtpField(input: HTMLInputElement): boolean {
      return isAutofillOtpField(descriptorFor(input, allInputsDeep().indexOf(input)));
    }

    // ---------- fill ----------

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    function setValue(input: HTMLInputElement, value: string): void {
      nativeValueSetter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function fillCredential(username: string, password: string, anchor?: HTMLInputElement): void {
      const passwords = passwordFields();
      const passwordInput =
        anchor?.type === "password" ? anchor : (passwords[0] ?? null);
      const usernameInput = passwordInput
        ? usernameFieldFor(passwordInput)
        : (anchor ?? null);
      if (usernameInput && username) setValue(usernameInput, username);
      if (passwordInput && password) setValue(passwordInput, password);
    }

    // ---------- inline menu ----------

    let activeInput: HTMLInputElement | null = null;

    async function maybeShowMenu(input: HTMLInputElement): Promise<void> {
      const state = await safeSend({ type: "menuState", url: location.href });
      if (!state || state.status === "logged-out" || state.disabled) return;
      const { status, matches, suggestions } = state;
      const isPassword = input.type === "password";

      // "Turn off on this site" — wired into every unlocked menu's footer.
      const disableSite = async () => {
        await safeSend({ type: "setSiteDisabled", url: location.href, disabled: true });
        iconStatusCache = null; // force icons to clear on next tick
        ui.syncIcons([], () => {});
        ui.hideMenu();
      };

      if (status === "locked") {
        activeInput = input;
        ui.showMenu(input, {
          matches: [],
          suggestions: [],
          hint: null,
          showGenerate: false,
          unlock: true,
          onPick: () => {},
          onSuggest: () => {},
          onGenerate: () => {},
          onUnlock: () => {
            void safeSend({ type: "openPopup" });
            ui.hideMenu();
          },
        });
        return;
      }

      // 2FA code field: offer to fill the current TOTP code directly.
      if (isOtpField(input) && input.type !== "password") {
        const withTotp = matches.filter((match) => match.totp);
        if (withTotp.length === 0) return;
        activeInput = input;
        ui.showMenu(input, {
          matches: withTotp,
          suggestions: [],
          hint: null,
          showGenerate: false,
          pickLabel: "fill 2FA code",
          onPick: (match) => {
            void (async () => {
              try {
                const { code } = await totpCodeFor(match.totp!, Date.now());
                setValue(input, code);
              } catch {
                // invalid stored secret — nothing to fill
              }
              ui.hideMenu();
            })();
          },
          onSuggest: () => {},
          onGenerate: () => {},
        });
        return;
      }

      const mode = classifyForm(input);
      const options = {
        onPick: (match: CredentialMatch) => {
          fillCredential(match.username, match.password, input);
          ui.hideMenu();
          // LastPass-style: the 2FA code is one paste away after autofill.
          if (match.totp) {
            void (async () => {
              try {
                const { code } = await totpCodeFor(match.totp!, Date.now());
                await navigator.clipboard.writeText(code);
                ui.toast(`2FA code for ${match.name} copied — paste when asked`);
              } catch {
                // clipboard unavailable or bad secret; fill already happened
              }
            })();
          }
        },
        onSuggest: (value: string) => {
          setValue(input, value);
          ui.hideMenu();
        },
        onGenerate: async () => {
          const generatedResult = await safeSend({ type: "generate" });
          if (!generatedResult) return;
          const { password } = generatedResult;
          // Registration forms have password + confirm — fill every visible one.
          for (const field of passwordFields()) setValue(field, password);
          try {
            await navigator.clipboard.writeText(password);
          } catch {
            // clipboard may be unavailable without focus — fill still happened
          }
          ui.hideMenu();
        },
        onDisableSite: disableSite,
      };

      if (mode === "signup") {
        // Register pages don't push existing credentials — prefill + generate
        // is what belongs here. Saved logins stay one click away as a hatch
        // for misclassified pages (and "log in instead" flows).
        const expandMatches = () =>
          ui.showMenu(input, { matches, suggestions: [], hint: null, showGenerate: isPassword, ...options });
        if (isPassword) {
          activeInput = input;
          ui.showMenu(input, {
            matches: [],
            suggestions: [],
            hint: null,
            showGenerate: true,
            collapsedCount: matches.length,
            onExpandMatches: expandMatches,
            ...options,
          });
        } else if (suggestions.length > 0 || matches.length > 0) {
          activeInput = input;
          ui.showMenu(input, {
            matches: [],
            suggestions,
            hint: null,
            showGenerate: false,
            collapsedCount: matches.length,
            onExpandMatches: expandMatches,
            ...options,
          });
        }
        return;
      }

      // Login form with saved matches: offer them directly.
      if (matches.length > 0) {
        activeInput = input;
        ui.showMenu(input, { matches, suggestions: [], hint: null, showGenerate: false, ...options });
        return;
      }

      // Login form, nothing saved: explicit feedback — silence always means
      // "not a login field", never ambiguity. Never a generator here.
      activeInput = input;
      ui.showMenu(input, {
        matches: [],
        suggestions: [],
        hint: "no logins saved for this site",
        showGenerate: false,
        ...options,
      });
    }

    document.addEventListener(
      "focusin",
      (event) => {
        const target = deepTarget(event);
        if (!(target instanceof HTMLInputElement) || !isLoginish(target) || !visible(target)) return;
        void maybeShowMenu(target);
      },
      true,
    );

    document.addEventListener(
      "focusout",
      () => {
        // Delay so clicks inside the menu land before it hides.
        setTimeout(() => {
          if (!ui.menuHasFocus()) ui.hideMenu();
        }, 150);
      },
      true,
    );

    // ---------- background-initiated fill (shortcut / context menu) ----------

    browser.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
      const message = raw as { type: string; username?: string; password?: string };
      if (message.type === "fillCredential") {
        fillCredential(message.username ?? "", message.password ?? "", activeInput ?? undefined);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === "fillBestMatch") {
        void (async () => {
          const result = await safeSend({ type: "credentialsForUrl", url: location.href });
          const best = result?.matches[0];
          if (best) fillCredential(best.username, best.password, activeInput ?? undefined);
          sendResponse({ ok: !!best });
        })();
        return true;
      }
    });

    // ---------- capture submits → save/update prompt ----------

    function captureSubmit(): void {
      const password = passwordFields().find((input) => input.value);
      if (!password) return;
      const username = usernameFieldFor(password)?.value ?? "";
      void safeSend({
        type: "loginSubmitted",
        url: location.href,
        username,
        password: password.value,
      });
    }

    document.addEventListener("submit", captureSubmit, true);
    // SPAs often "submit" via button click without a form submit event.
    document.addEventListener(
      "click",
      (event) => {
        if (ui.ownsEvent(event)) return; // clicks in our own menu aren't submits
        const target = deepTarget(event);
        const element = target instanceof Element ? target : null;
        if (element?.closest('button[type="submit"], input[type="submit"], button')) captureSubmit();
      },
      true,
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && deepTarget(event) instanceof HTMLInputElement) captureSubmit();
    }, true);

    // ---------- in-field pw0d icons ----------
    // Only on FIELDS WE'D ACT ON — like NordPass/1Password, not every input:
    //   · every visible password field
    //   · the username field paired with each password field
    //   · fields explicitly marked autocomplete="username" (username-first flows)
    //   · 2FA code inputs
    // A standalone email/text box (newsletter, search) gets no icon.

    function iconTargets(): HTMLInputElement[] {
      const inputs = allInputsDeep();
      const keys = new Set(iconTargetKeys(pageDescriptor()));
      return inputs.filter((input, order) => keys.has(`field-${order}`));
    }

    let iconStatusCache: { status: string; disabled: boolean; at: number } | null = null;

    async function refreshIcons(): Promise<void> {
      const now = Date.now();
      if (!iconStatusCache || now - iconStatusCache.at > 5000) {
        const state = await safeSend({ type: "siteStatus", url: location.href });
        if (!state) return;
        iconStatusCache = { status: state.status, disabled: state.disabled, at: now };
      }
      // No icons when logged out or when pw0d is turned off for this site.
      if (iconStatusCache.status === "logged-out" || iconStatusCache.disabled) {
        ui.syncIcons([], () => {});
        return;
      }
      ui.syncIcons(iconTargets(), (input) => {
        if (ui.menuAnchor() === input) {
          ui.hideMenu();
          return;
        }
        input.focus();
        void maybeShowMenu(input);
      });
    }

    void refreshIcons();
    let iconDebounce: ReturnType<typeof setTimeout> | undefined;
    new MutationObserver(() => {
      clearTimeout(iconDebounce);
      iconDebounce = setTimeout(() => {
        ui.repositionIcons();
        void refreshIcons();
      }, 350);
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("scroll", () => ui.repositionIcons(), { capture: true, passive: true });
    window.addEventListener("resize", () => ui.repositionIcons(), { passive: true });

    // ---------- offer pending save on page load ----------

    void (async () => {
      const result = await safeSend({ type: "getPendingSave", url: location.href });
      if (result?.pending) {
        ui.showSaveBanner(result.pending, result.candidates, async (accept, fields) => {
          await safeSend({ type: "resolvePendingSave", accept, ...fields });
          ui.hideSaveBanner();
        });
      }
    })();
  },
});

// ============================== UI layer ==============================

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .menu, .banner {
    position: fixed;
    z-index: 2147483647;
    background: #26272b;
    color: #f2f1ee;
    border: 1px solid rgba(255,255,255,0.16);
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
    font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  .menu { min-width: 260px; max-width: 340px; }
  .menu-header {
    padding: 7px 12px 6px;
    font: 600 10px/1 ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9b9a96;
    border-bottom: 1px solid rgba(255,255,255,0.09);
  }
  .menu-header .zero { color: #c8f23f; }
  .row {
    display: flex; align-items: center; gap: 10px;
    width: 100%; padding: 9px 12px;
    background: none; border: none; color: inherit;
    font: inherit; text-align: left; cursor: pointer;
  }
  .row:hover { background: rgba(255,255,255,0.07); }
  .tile {
    width: 26px; height: 26px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(255,255,255,0.14); border-radius: 6px;
    font: 600 12px/1 ui-monospace, monospace;
    color: #9b9a96; text-transform: uppercase;
    background: rgba(255,255,255,0.04);
  }
  .meta { min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .user { font: 11px ui-monospace, monospace; color: #9b9a96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fill { margin-left: auto; font: 11px ui-monospace, monospace; color: #c8f23f; opacity: 0; }
  .row:hover .fill { opacity: 1; }
  .hint { padding: 9px 12px; font-size: 12px; color: #9b9a96; }
  .hintbtn {
    display: block; width: 100%; padding: 8px 12px;
    background: none; border: none; border-top: 1px solid rgba(255,255,255,0.09);
    color: #9b9a96; font: 12px ui-sans-serif, system-ui, sans-serif;
    text-align: left; cursor: pointer;
  }
  .hintbtn:hover { color: #f2f1ee; background: rgba(255,255,255,0.05); }
  .generate .tile { color: #c8f23f; border-color: rgba(200,242,63,0.35); }
  .generate { border-top: 1px solid rgba(255,255,255,0.09); }
  .toastmsg {
    position: fixed; bottom: 16px; right: 16px; z-index: 2147483647;
    max-width: 320px; padding: 10px 14px;
    background: #26272b; color: #f2f1ee;
    border: 1px solid rgba(200,242,63,0.4); border-radius: 9px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
    font: 12.5px ui-sans-serif, system-ui, sans-serif;
    animation: reveal-toast 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    transition: opacity 0.5s ease;
  }
  .toastmsg-out { opacity: 0; }
  @keyframes reveal-toast {
    from { opacity: 0; transform: translateY(8px); }
  }
  .pwicon {
    position: fixed;
    z-index: 2147483646;
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 5px;
    background: rgba(38,39,43,0.94);
    border: 1px solid rgba(255,255,255,0.18);
    padding: 0; cursor: pointer;
    opacity: 0; transform: scale(0.7);
    animation: pwicon-in 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
  }
  .pwicon:hover {
    transform: scale(1.12);
    border-color: rgba(200,242,63,0.65);
    box-shadow: 0 0 10px rgba(200,242,63,0.35);
  }
  .pwicon:active { transform: scale(0.95); }
  @keyframes pwicon-in {
    to { opacity: 0.95; transform: scale(1); }
  }
  .banner { top: 16px; right: 16px; width: 320px; padding: 14px; }
  .banner-title { font-weight: 600; margin-bottom: 2px; }
  .banner-sub { color: #9b9a96; font-size: 12px; word-break: break-all; }
  .banner-actions { display: flex; gap: 8px; margin-top: 12px; }
  .field { margin-top: 8px; }
  .field label {
    display: block; margin-bottom: 3px;
    font: 600 9.5px/1 ui-monospace, monospace;
    letter-spacing: 0.1em; text-transform: uppercase; color: #9b9a96;
  }
  .field input, .field select {
    width: 100%; height: 30px; padding: 0 8px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.16); border-radius: 7px;
    color: #f2f1ee; font: 12.5px ui-sans-serif, system-ui, sans-serif;
    outline: none;
  }
  .field input:focus, .field select:focus { border-color: rgba(200,242,63,0.55); }
  .field select option { background: #26272b; }
  .pwrow { display: flex; gap: 6px; }
  .pwrow input { font-family: ui-monospace, monospace; }
  .reveal {
    flex-shrink: 0; width: 32px; height: 30px; border-radius: 7px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16);
    color: #9b9a96; cursor: pointer; font-size: 12px;
  }
  .btn {
    flex: 1; padding: 7px 0; border-radius: 7px; border: none;
    font: 600 12.5px ui-sans-serif, system-ui, sans-serif; cursor: pointer;
  }
  .btn-primary { background: #c8f23f; color: #1d2705; }
  .btn-primary:hover { background: #d4f95c; }
  .btn-ghost { background: rgba(255,255,255,0.08); color: #f2f1ee; }
  .btn-ghost:hover { background: rgba(255,255,255,0.14); }
`;

interface MenuOptions {
  matches: CredentialMatch[];
  suggestions: string[];
  hint: string | null;
  showGenerate: boolean;
  unlock?: boolean;
  /** Row action label; defaults to "fill". */
  pickLabel?: string;
  /** Saved logins hidden behind a "N saved logins" row (signup pages). */
  collapsedCount?: number;
  onExpandMatches?: () => void;
  onPick: (match: CredentialMatch) => void;
  onSuggest: (value: string) => void;
  onGenerate: () => void;
  onUnlock?: () => void;
  /** When present, the menu shows a "turn off on this site" footer. */
  onDisableSite?: () => void;
}

export interface SaveFields {
  name: string;
  username: string;
  password: string;
  targetItemId: string | null;
}

interface UiLayer {
  showMenu(anchor: HTMLInputElement, options: MenuOptions): void;
  toast(message: string): void;
  hideMenu(): void;
  menuHasFocus(): boolean;
  menuAnchor(): HTMLInputElement | null;
  ownsEvent(event: Event): boolean;
  /** Reconcile in-field pw0d icons with the current set of login inputs. */
  syncIcons(inputs: HTMLInputElement[], onActivate: (input: HTMLInputElement) => void): void;
  repositionIcons(): void;
  showSaveBanner(
    pending: PendingSave,
    candidates: { id: string; name: string; username: string }[],
    onResolve: (accept: boolean, fields: SaveFields) => void,
  ): void;
  hideSaveBanner(): void;
}

function createUiLayer(): UiLayer {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = STYLE;
  root.appendChild(style);
  document.documentElement.appendChild(host);

  let menu: HTMLDivElement | null = null;
  let banner: HTMLDivElement | null = null;
  let currentAnchor: HTMLInputElement | null = null;
  let pointerInMenu = false;
  let reposition: (() => void) | null = null;
  const icons = new Map<HTMLInputElement, HTMLButtonElement>();

  function hideMenu(): void {
    menu?.remove();
    menu = null;
    currentAnchor = null;
    if (reposition) {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      reposition = null;
    }
  }

  // The slashed-zero monogram — pw0d's lit "0".
  const ICON_SVG = `<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <ellipse cx="6" cy="6" rx="3.4" ry="4.5" fill="none" stroke="#c8f23f" stroke-width="1.5"/>
    <line x1="3.6" y1="9.6" x2="8.4" y2="2.4" stroke="#c8f23f" stroke-width="1.2"/>
  </svg>`;

  function placeIcon(input: HTMLInputElement, icon: HTMLButtonElement): void {
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 || rect.bottom < 0 || rect.top > innerHeight) {
      icon.style.display = "none";
      return;
    }
    icon.style.display = "flex";
    icon.style.left = `${rect.right - 26}px`;
    icon.style.top = `${rect.top + (rect.height - 20) / 2}px`;
  }

  return {
    showMenu(anchor, options) {
      hideMenu();
      currentAnchor = anchor;
      menu = document.createElement("div");
      menu.className = "menu";
      menu.addEventListener("pointerenter", () => (pointerInMenu = true));
      menu.addEventListener("pointerleave", () => (pointerInMenu = false));

      const header = document.createElement("div");
      header.className = "menu-header";
      header.innerHTML = `pw<span class="zero">0</span>d`;
      menu.appendChild(header);

      for (const match of options.matches.slice(0, 6)) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row";
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.textContent = (match.name.trim()[0] ?? "?").toUpperCase();
        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = match.name;
        const user = document.createElement("div");
        user.className = "user";
        user.textContent = match.username || "(no username)";
        meta.append(name, user);
        const fill = document.createElement("span");
        fill.className = "fill";
        fill.textContent = `${options.pickLabel ?? "fill"} ↵`;
        row.append(tile, meta, fill);
        row.addEventListener("click", () => options.onPick(match));
        menu.appendChild(row);
      }

      for (const suggestion of options.suggestions) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row";
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.textContent = "@";
        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = suggestion;
        const user = document.createElement("div");
        user.className = "user";
        user.textContent = "fill your usual email";
        meta.append(name, user);
        row.append(tile, meta);
        row.addEventListener("click", () => options.onSuggest(suggestion));
        menu.appendChild(row);
      }

      if (options.hint) {
        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = options.hint;
        menu.appendChild(hint);
      }

      if (options.unlock) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row generate";
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.innerHTML = ICON_SVG;
        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = "Unlock pw0d";
        const user = document.createElement("div");
        user.className = "user";
        user.textContent = "Touch ID or master password";
        meta.append(name, user);
        row.append(tile, meta);
        row.addEventListener("click", () => options.onUnlock?.());
        menu.appendChild(row);
      }

      if (options.showGenerate) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "row generate";
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.textContent = "✦";
        const meta = document.createElement("div");
        meta.className = "meta";
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = "Generate strong password";
        const user = document.createElement("div");
        user.className = "user";
        user.textContent = "fills the field & copies it";
        meta.append(name, user);
        row.append(tile, meta);
        row.addEventListener("click", () => options.onGenerate());
        menu.appendChild(row);
      }

      // Footer escape hatch: saved logins on signup-classified pages.
      if (options.collapsedCount && options.onExpandMatches) {
        const expand = document.createElement("button");
        expand.type = "button";
        expand.className = "hintbtn";
        expand.textContent = `▸ ${options.collapsedCount} saved login${options.collapsedCount === 1 ? "" : "s"} for this site`;
        expand.addEventListener("click", () => options.onExpandMatches?.());
        menu.appendChild(expand);
      }

      // "Turn off on this site" — one-click disable, right where it's annoying you.
      if (options.onDisableSite) {
        const off = document.createElement("button");
        off.type = "button";
        off.className = "hintbtn";
        off.textContent = "⊘ Turn off pw0d on this site";
        off.addEventListener("click", () => options.onDisableSite?.());
        menu.appendChild(off);
      }
      root.appendChild(menu);

      reposition = () => {
        if (!menu) return;
        const rect = anchor.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return hideMenu();
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${rect.bottom + 4}px`;
      };
      reposition();
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
    },

    hideMenu,
    menuHasFocus: () => pointerInMenu,
    menuAnchor: () => currentAnchor,

    toast(message) {
      const el = document.createElement("div");
      el.className = "toastmsg";
      el.textContent = message;
      root.appendChild(el);
      setTimeout(() => el.classList.add("toastmsg-out"), 3600);
      setTimeout(() => el.remove(), 4100);
    },
    ownsEvent: (event) => event.composedPath().includes(host),

    syncIcons(inputs, onActivate) {
      const wanted = new Set(inputs);
      for (const [input, icon] of icons) {
        if (!wanted.has(input) || !input.isConnected) {
          icon.remove();
          icons.delete(input);
        }
      }
      for (const input of inputs) {
        if (icons.has(input)) continue;
        const icon = document.createElement("button");
        icon.type = "button";
        icon.className = "pwicon";
        icon.title = "pw0d";
        icon.innerHTML = ICON_SVG;
        // Don't steal focus from the page input on press.
        icon.addEventListener("mousedown", (event) => event.preventDefault());
        icon.addEventListener("click", () => onActivate(input));
        root.appendChild(icon);
        icons.set(input, icon);
        placeIcon(input, icon);
      }
    },

    repositionIcons() {
      for (const [input, icon] of icons) {
        if (!input.isConnected) {
          icon.remove();
          icons.delete(input);
          continue;
        }
        placeIcon(input, icon);
      }
    },

    showSaveBanner(pending, candidates, onResolve) {
      banner?.remove();
      banner = document.createElement("div");
      banner.className = "banner";

      const title = document.createElement("div");
      title.className = "banner-title";
      title.textContent = pending.kind === "save" ? "Save login to pw0d?" : "Update password in pw0d?";
      const sub = document.createElement("div");
      sub.className = "banner-sub";
      sub.textContent = pending.host;
      banner.append(title, sub);

      const field = (label: string, input: HTMLElement) => {
        const wrap = document.createElement("div");
        wrap.className = "field";
        const labelEl = document.createElement("label");
        labelEl.textContent = label;
        wrap.append(labelEl, input);
        banner!.appendChild(wrap);
        return wrap;
      };

      // Destination: new item, or update an existing login for this site.
      const select = document.createElement("select");
      const newOption = document.createElement("option");
      newOption.value = "";
      newOption.textContent = "Save as new login";
      select.appendChild(newOption);
      for (const candidate of candidates) {
        const option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = `Update “${candidate.name}” (${candidate.username || "no username"})`;
        select.appendChild(option);
      }
      if (pending.kind === "update") select.value = pending.itemId;
      if (candidates.length > 0) field("destination", select);

      const nameInput = document.createElement("input");
      nameInput.value = pending.host;
      const nameField = field("name", nameInput);

      const userInput = document.createElement("input");
      userInput.value = pending.username;
      field("username", userInput);

      const passwordRow = document.createElement("div");
      passwordRow.className = "pwrow";
      const passwordInput = document.createElement("input");
      passwordInput.type = "password";
      passwordInput.value = pending.password;
      const reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "reveal";
      reveal.textContent = "👁";
      reveal.addEventListener("click", () => {
        passwordInput.type = passwordInput.type === "password" ? "text" : "password";
      });
      passwordRow.append(passwordInput, reveal);
      field("password", passwordRow);

      const syncNameVisibility = () => {
        nameField.style.display = select.value ? "none" : "";
      };
      select.addEventListener("change", syncNameVisibility);
      syncNameVisibility();

      const fields = (): SaveFields => ({
        name: nameInput.value,
        username: userInput.value,
        password: passwordInput.value,
        targetItemId: select.value || null,
      });

      const actions = document.createElement("div");
      actions.className = "banner-actions";
      const yes = document.createElement("button");
      yes.className = "btn btn-primary";
      yes.textContent = "Save";
      yes.addEventListener("click", () => onResolve(true, fields()));
      const no = document.createElement("button");
      no.className = "btn btn-ghost";
      no.textContent = "Not now";
      no.addEventListener("click", () => onResolve(false, fields()));
      actions.append(yes, no);
      banner.appendChild(actions);
      root.appendChild(banner);
    },

    hideSaveBanner() {
      banner?.remove();
      banner = null;
    },
  };
}
