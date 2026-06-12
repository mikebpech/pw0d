import { describe, expect, it } from "vitest";
import { itemDataSchema, parseItemData, scorePassword, serializeItemData } from "../src";

describe("item models", () => {
  it("parses a login with defaults applied", () => {
    const item = itemDataSchema.parse({ type: "login", name: "GitHub" });
    expect(item).toEqual({
      type: "login",
      name: "GitHub",
      username: "",
      password: "",
      urls: [],
      notes: "",
      customFields: [],
    });
  });

  it("round-trips through serialize/parse", () => {
    const item = itemDataSchema.parse({
      type: "login",
      name: "GitHub",
      username: "mike",
      password: "hunter2",
      urls: ["https://github.com"],
      customFields: [{ name: "PIN", value: "1234", hidden: true }],
    });
    expect(parseItemData(serializeItemData(item))).toEqual(item);
  });

  it("parses notes", () => {
    const note = itemDataSchema.parse({ type: "note", name: "Wifi", content: "pw is hunter2" });
    expect(note.type).toBe("note");
  });

  it("parses SSH keys with defaults applied", () => {
    const key = itemDataSchema.parse({ type: "ssh", name: "deploy key" });
    expect(key).toEqual({
      type: "ssh",
      name: "deploy key",
      host: "",
      username: "",
      publicKey: "",
      privateKey: "",
      passphrase: "",
      notes: "",
    });
  });

  it("rejects unknown types, missing names, and garbage", () => {
    expect(() => itemDataSchema.parse({ type: "card", name: "Visa" })).toThrow();
    expect(() => itemDataSchema.parse({ type: "login", name: "" })).toThrow();
    expect(() => parseItemData("not json")).toThrow();
  });
});

describe("scorePassword", () => {
  it("flags weak passwords", () => {
    expect(scorePassword("password123").score).toBeLessThanOrEqual(1);
  });

  it("rates long random passwords highly", () => {
    expect(scorePassword("kV9#mQ2$xL7@pR4&wN8!").score).toBe(4);
  });
});
