export type AutofillFormMode = "login" | "signup" | "change-password";

export interface FieldDescriptor {
  key: string;
  order: number;
  type: string;
  name?: string;
  id?: string;
  autocomplete?: string;
  placeholder?: string;
  ariaLabel?: string;
  formKey?: string | null;
  width: number;
  height: number;
  disabled?: boolean;
  readOnly?: boolean;
}

export interface ButtonDescriptor {
  text?: string;
  value?: string;
  type?: string;
  formKey?: string | null;
}

export interface PageDescriptor {
  pathname: string;
  title: string;
  fields: FieldDescriptor[];
  buttons: ButtonDescriptor[];
}

export function visibleField(field: FieldDescriptor): boolean {
  return field.width > 40 && field.height > 10 && !field.disabled && !field.readOnly;
}

export function passwordFields(page: PageDescriptor): FieldDescriptor[] {
  return page.fields.filter((field) => field.type === "password" && visibleField(field));
}

export function isOtpField(field: FieldDescriptor): boolean {
  const autocomplete = (field.autocomplete || "").toLowerCase();
  if (autocomplete.includes("one-time-code")) return true;
  const hint = `${field.name ?? ""} ${field.id ?? ""} ${field.placeholder ?? ""} ${field.ariaLabel ?? ""}`.toLowerCase();
  return /\b(otp|2fa|mfa|totp)\b|one.?time.?(code|password)|verification.?code|security.?code|authenticator/.test(hint);
}

export function isLoginishField(field: FieldDescriptor): boolean {
  if (field.type === "password") return true;
  const autocomplete = (field.autocomplete || "").toLowerCase();
  if (autocomplete === "username" || autocomplete.includes("webauthn")) return true;
  if (isOtpField(field)) return true;
  const hint = `${field.name ?? ""} ${field.id ?? ""} ${field.autocomplete ?? ""} ${field.placeholder ?? ""}`.toLowerCase();
  return /user|email|login|account/.test(hint);
}

export function usernameFieldFor(page: PageDescriptor, password: FieldDescriptor): FieldDescriptor | null {
  const visible = page.fields.filter(visibleField);
  let candidates = visible.filter((field) => ["email", "text", "tel"].includes(field.type));
  if (password.formKey) {
    const sameForm = candidates.filter((field) => field.formKey === password.formKey);
    if (sameForm.length > 0) candidates = sameForm;
  }
  const passwordIndex = visible.findIndex((field) => field.key === password.key);
  let best: FieldDescriptor | null = null;
  for (const candidate of candidates) {
    const candidateIndex = visible.findIndex((field) => field.key === candidate.key);
    if (candidateIndex >= 0 && candidateIndex < passwordIndex) best = candidate;
  }
  return best ?? candidates[0] ?? null;
}

function buttonHaystack(page: PageDescriptor, formKey?: string | null): string {
  const buttons = formKey
    ? page.buttons.filter((button) => !button.formKey || button.formKey === formKey)
    : page.buttons;
  return buttons.map((button) => `${button.text ?? ""} ${button.value ?? ""}`).join(" ");
}

function fieldHint(field: FieldDescriptor): string {
  return `${field.name ?? ""} ${field.id ?? ""} ${field.autocomplete ?? ""} ${field.placeholder ?? ""} ${field.ariaLabel ?? ""}`.toLowerCase();
}

function saysChangePassword(text: string): boolean {
  return /\b(change|update|reset|set)\b.{0,24}\bpassword\b|\bpassword\b.{0,24}\b(change|update|reset)\b/.test(text);
}

function saysSignup(text: string): boolean {
  return /sign\s?up|register|create\b.{0,16}account|join now|get started/.test(text);
}

function saysLogin(text: string): boolean {
  return /\blog\s?-?in\b|\bsign\s?-?in\b/.test(text);
}

export function classifyForm(page: PageDescriptor, field: FieldDescriptor): AutofillFormMode {
  const passwords = passwordFields(page);
  const scopedPasswords = field.formKey
    ? passwords.filter((password) => password.formKey === field.formKey)
    : passwords;
  const relevantPasswords = scopedPasswords.length > 0 ? scopedPasswords : passwords;
  const haystack = `${buttonHaystack(page, field.formKey)} ${page.pathname} ${page.title}`.toLowerCase();
  const passwordHints = relevantPasswords.map(fieldHint);
  const hasCurrent = passwordHints.some((hint) => hint.includes("current-password") || /\b(current|old|existing)\b/.test(hint));
  const hasNew = passwordHints.some((hint) => hint.includes("new-password") || /\b(new|confirm|confirmation)\b/.test(hint));

  if (saysChangePassword(haystack)) return "change-password";
  if (relevantPasswords.length >= 3 && hasCurrent) return "change-password";
  if (relevantPasswords.length >= 2 && hasCurrent && hasNew) return "change-password";
  if (relevantPasswords.length >= 2) return "signup";
  if (passwordHints.some((hint) => hint.includes("current-password"))) return "login";
  if (saysLogin(haystack) && !saysSignup(haystack)) return "login";
  if (saysSignup(haystack)) return "signup";
  if (passwordHints.some((hint) => hint.includes("new-password"))) return "signup";
  return "login";
}

export function iconTargetKeys(page: PageDescriptor): string[] {
  const targets = new Set<string>();
  for (const password of passwordFields(page)) {
    targets.add(password.key);
    const username = usernameFieldFor(page, password);
    if (username) targets.add(username.key);
  }
  for (const field of page.fields) {
    if (!visibleField(field)) continue;
    const autocomplete = (field.autocomplete || "").toLowerCase();
    if (autocomplete === "username" || autocomplete.includes("webauthn")) targets.add(field.key);
    if (isOtpField(field)) targets.add(field.key);
  }
  return [...targets].slice(0, 6);
}
