import { describe, expect, it } from "vitest";
import { EFF_WORDLIST, generatePassphrase, generatePassword } from "../src";

describe("generatePassword", () => {
  it("uses sane defaults (20 chars, all classes)", () => {
    const pw = generatePassword();
    expect(pw).toHaveLength(20);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[!@#$%^&*()\-_=+[\]{};:,.<>?]/);
  });

  it("always includes at least one char from every enabled class", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 4 });
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%^&*()\-_=+[\]{};:,.<>?]/);
    }
  });

  it("respects disabled classes", () => {
    const pw = generatePassword({ length: 32, symbols: false, uppercase: false });
    expect(pw).toMatch(/^[a-z0-9]+$/);
  });

  it("supports digits-only (PIN)", () => {
    const pin = generatePassword({ length: 6, lowercase: false, uppercase: false, symbols: false });
    expect(pin).toMatch(/^[0-9]{6}$/);
  });

  it("never repeats (collision sanity check)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });

  it("rejects impossible options", () => {
    expect(() => generatePassword({ lowercase: false, uppercase: false, digits: false, symbols: false })).toThrow();
    expect(() => generatePassword({ length: 3 })).toThrow();
    expect(() => generatePassword({ length: 129 })).toThrow();
    expect(() => generatePassword({ length: 20.5 })).toThrow();
  });
});

describe("generatePassphrase", () => {
  it("uses sane defaults (5 words, dash-separated)", () => {
    const phrase = generatePassphrase();
    const words = phrase.split("-");
    expect(words).toHaveLength(5);
    for (const word of words) {
      expect(EFF_WORDLIST).toContain(word);
    }
  });

  it("supports capitalize, separator, and number options", () => {
    const phrase = generatePassphrase({ words: 4, separator: ".", capitalize: true, includeNumber: true });
    const words = phrase.split(".");
    expect(words).toHaveLength(4);
    for (const word of words) {
      expect(word).toMatch(/^[A-Z][a-z]+[0-9]?$/);
    }
    expect(phrase).toMatch(/[0-9]/);
  });

  it("has the full wordlist available", () => {
    expect(EFF_WORDLIST).toHaveLength(7776);
    expect(new Set(EFF_WORDLIST).size).toBe(7776);
  });

  it("rejects out-of-range word counts", () => {
    expect(() => generatePassphrase({ words: 2 })).toThrow();
    expect(() => generatePassphrase({ words: 16 })).toThrow();
  });
});
