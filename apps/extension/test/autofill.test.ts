import { describe, expect, it } from "vitest";
import {
  classifyForm,
  iconTargetKeys,
  isLoginishField,
  isOtpField,
  usernameFieldFor,
  visibleField,
  type FieldDescriptor,
  type PageDescriptor,
} from "../lib/autofill";

function field(overrides: Partial<FieldDescriptor> & Pick<FieldDescriptor, "key" | "order" | "type">): FieldDescriptor {
  return {
    width: 240,
    height: 36,
    formKey: "form-0",
    ...overrides,
  };
}

function page(fields: FieldDescriptor[], options: Partial<PageDescriptor> = {}): PageDescriptor {
  return {
    pathname: "/login",
    title: "Sign in",
    buttons: [{ text: "Sign in", type: "submit", formKey: "form-0" }],
    fields,
    ...options,
  };
}

describe("autofill field visibility", () => {
  it("accepts usable fields and rejects hidden, tiny, disabled, and readonly fields", () => {
    expect(visibleField(field({ key: "email", order: 0, type: "email" }))).toBe(true);
    expect(visibleField(field({ key: "tiny", order: 0, type: "email", width: 32 }))).toBe(false);
    expect(visibleField(field({ key: "short", order: 0, type: "email", height: 8 }))).toBe(false);
    expect(visibleField(field({ key: "disabled", order: 0, type: "email", disabled: true }))).toBe(false);
    expect(visibleField(field({ key: "readonly", order: 0, type: "email", readOnly: true }))).toBe(false);
  });
});

describe("autofill loginish fields", () => {
  it.each([
    field({ key: "password", order: 0, type: "password" }),
    field({ key: "email", order: 0, type: "email", autocomplete: "username" }),
    field({ key: "user", order: 0, type: "text", name: "user_name" }),
    field({ key: "account", order: 0, type: "text", placeholder: "Account ID" }),
    field({ key: "phone", order: 0, type: "tel", id: "login-phone" }),
    field({ key: "otp", order: 0, type: "text", autocomplete: "one-time-code" }),
  ])("marks $key as login-related", (candidate) => {
    expect(isLoginishField(candidate)).toBe(true);
  });

  it.each([
    field({ key: "search", order: 0, type: "search", placeholder: "Search" }),
    field({ key: "newsletter", order: 0, type: "email", name: "newsletter" }),
    field({ key: "coupon", order: 0, type: "text", placeholder: "Coupon code" }),
  ])("does not mark unrelated $key fields as login-related", (candidate) => {
    expect(isLoginishField(candidate)).toBe(false);
  });
});

describe("autofill username pairing", () => {
  it("pairs the closest username-like field above the password", () => {
    const model = page([
      field({ key: "email", order: 0, type: "email", autocomplete: "username" }),
      field({ key: "password", order: 1, type: "password", autocomplete: "current-password" }),
    ]);

    const password = model.fields[1];
    expect(password).toBeDefined();
    expect(usernameFieldFor(model, password!)?.key).toBe("email");
  });

  it("uses same-form fields before unrelated page-level fields", () => {
    const model = page([
      field({ key: "marketing-email", order: 0, type: "email", formKey: "form-0" }),
      field({ key: "login-email", order: 1, type: "email", formKey: "form-1" }),
      field({ key: "login-password", order: 2, type: "password", formKey: "form-1" }),
    ]);

    const password = model.fields[2];
    expect(password).toBeDefined();
    expect(usernameFieldFor(model, password!)?.key).toBe("login-email");
  });

  it("supports phone-number usernames", () => {
    const model = page([
      field({ key: "phone", order: 0, type: "tel", autocomplete: "username" }),
      field({ key: "password", order: 1, type: "password" }),
    ]);

    const password = model.fields[1];
    expect(password).toBeDefined();
    expect(usernameFieldFor(model, password!)?.key).toBe("phone");
  });
});

describe("autofill form classification", () => {
  it.each([
    {
      name: "plain email and password login",
      model: page([
        field({ key: "email", order: 0, type: "email" }),
        field({ key: "password", order: 1, type: "password" }),
      ]),
      key: "password",
      mode: "login",
    },
    {
      name: "username-first login step",
      model: page([field({ key: "identifier", order: 0, type: "email", autocomplete: "username" })]),
      key: "identifier",
      mode: "login",
    },
    {
      name: "autocomplete current-password login",
      model: page([
        field({ key: "username", order: 0, type: "text", autocomplete: "username" }),
        field({ key: "password", order: 1, type: "password", autocomplete: "current-password" }),
      ]),
      key: "password",
      mode: "login",
    },
    {
      name: "signup with password confirmation",
      model: page(
        [
          field({ key: "email", order: 0, type: "email" }),
          field({ key: "password", order: 1, type: "password", autocomplete: "new-password" }),
          field({ key: "confirm", order: 2, type: "password", placeholder: "Confirm password" }),
        ],
        { pathname: "/register", title: "Create account", buttons: [{ text: "Create account", formKey: "form-0" }] },
      ),
      key: "password",
      mode: "signup",
    },
    {
      name: "signup with one new-password field",
      model: page(
        [
          field({ key: "email", order: 0, type: "email" }),
          field({ key: "password", order: 1, type: "password", autocomplete: "new-password" }),
        ],
        { pathname: "/signup", title: "Join now", buttons: [{ text: "Sign up", formKey: "form-0" }] },
      ),
      key: "password",
      mode: "signup",
    },
    {
      name: "change password with current and new fields",
      model: page(
        [
          field({ key: "current", order: 0, type: "password", autocomplete: "current-password" }),
          field({ key: "new", order: 1, type: "password", autocomplete: "new-password" }),
          field({ key: "confirm", order: 2, type: "password", placeholder: "Confirm new password" }),
        ],
        { pathname: "/settings/password", title: "Change password", buttons: [{ text: "Update password", formKey: "form-0" }] },
      ),
      key: "new",
      mode: "change-password",
    },
    {
      name: "reset password with one field",
      model: page(
        [field({ key: "new", order: 0, type: "password", autocomplete: "new-password" })],
        { pathname: "/reset-password", title: "Reset password", buttons: [{ text: "Reset password", formKey: "form-0" }] },
      ),
      key: "new",
      mode: "change-password",
    },
  ])("classifies $name as $mode", ({ model, key, mode }) => {
    const target = model.fields.find((candidate) => candidate.key === key)!;
    expect(classifyForm(model, target)).toBe(mode);
  });
});

describe("autofill OTP detection", () => {
  it.each([
    field({ key: "autocomplete", order: 0, type: "text", autocomplete: "one-time-code" }),
    field({ key: "otp-name", order: 0, type: "text", name: "otp" }),
    field({ key: "mfa-id", order: 0, type: "text", id: "mfa-code" }),
    field({ key: "aria", order: 0, type: "text", ariaLabel: "Authenticator code" }),
    field({ key: "placeholder", order: 0, type: "text", placeholder: "Security code" }),
  ])("detects $key as an OTP field", (candidate) => {
    expect(isOtpField(candidate)).toBe(true);
  });
});

describe("autofill icon targets", () => {
  it("targets password, paired username, explicit username-first, webauthn, and OTP fields", () => {
    const model = page([
      field({ key: "email", order: 0, type: "email" }),
      field({ key: "password", order: 1, type: "password" }),
      field({ key: "username-first", order: 2, type: "text", autocomplete: "username" }),
      field({ key: "passkey", order: 3, type: "text", autocomplete: "username webauthn" }),
      field({ key: "otp", order: 4, type: "text", autocomplete: "one-time-code" }),
      field({ key: "search", order: 5, type: "search", placeholder: "Search" }),
    ]);

    expect(iconTargetKeys(model)).toEqual(["password", "email", "username-first", "passkey", "otp"]);
  });

  it("limits icon targets so noisy pages do not get flooded", () => {
    const model = page(
      Array.from({ length: 8 }, (_, index) =>
        field({ key: `password-${index}`, order: index, type: "password", formKey: `form-${index}` }),
      ),
    );

    expect(iconTargetKeys(model)).toHaveLength(6);
  });
});
