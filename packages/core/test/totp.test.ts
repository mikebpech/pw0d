import { describe, expect, it } from "vitest";
import { base32Decode, generateTotp, isValidTotpInput, parseTotpInput } from "../src/totp";

// RFC 6238 Appendix B test vectors (8-digit codes, ASCII "12345678901234567890" keys).
const RFC_SECRET_SHA1 = new TextEncoder().encode("12345678901234567890");
const RFC_SECRET_SHA256 = new TextEncoder().encode("12345678901234567890123456789012");

describe("generateTotp (RFC 6238 vectors)", () => {
  const config = (secret: Uint8Array, algorithm: "SHA-1" | "SHA-256") => ({
    secret,
    algorithm,
    digits: 8,
    period: 30,
    issuer: null,
    account: null,
  });

  it.each([
    [59_000, "94287082"],
    [1_111_111_109_000, "07081804"],
    [1_234_567_890_000, "89005924"],
    [20_000_000_000_000, "65353130"],
  ])("SHA-1 at t=%d → %s", async (timestampMs, expected) => {
    expect(await generateTotp(config(RFC_SECRET_SHA1, "SHA-1"), timestampMs)).toBe(expected);
  });

  it.each([
    [59_000, "46119246"],
    [1_111_111_109_000, "68084774"],
  ])("SHA-256 at t=%d → %s", async (timestampMs, expected) => {
    expect(await generateTotp(config(RFC_SECRET_SHA256, "SHA-256"), timestampMs)).toBe(expected);
  });
});

describe("base32Decode", () => {
  it("decodes RFC 4648 vectors", () => {
    expect(new TextDecoder().decode(base32Decode("MZXW6YTBOI======"))).toBe("foobar");
    expect(new TextDecoder().decode(base32Decode("mzxw6ytboi"))).toBe("foobar");
    expect(new TextDecoder().decode(base32Decode("MZXW 6YTB OI"))).toBe("foobar");
  });

  it("rejects garbage", () => {
    expect(() => base32Decode("not!base32")).toThrow();
    expect(() => base32Decode("")).toThrow();
  });
});

describe("parseTotpInput", () => {
  it("parses a full otpauth URI", () => {
    const config = parseTotpInput(
      "otpauth://totp/GitHub:mike?secret=MZXW6YTBOI&issuer=GitHub&digits=6&period=30&algorithm=SHA1",
    );
    expect(config.issuer).toBe("GitHub");
    expect(config.account).toBe("mike");
    expect(config.digits).toBe(6);
    expect(config.algorithm).toBe("SHA-1");
  });

  it("accepts a bare base32 secret with sane defaults", () => {
    const config = parseTotpInput("mzxw 6ytb oi");
    expect(config.digits).toBe(6);
    expect(config.period).toBe(30);
    expect(config.algorithm).toBe("SHA-1");
  });

  it("rejects HOTP URIs and junk", () => {
    expect(() => parseTotpInput("otpauth://hotp/x?secret=MZXW6YTBOI")).toThrow();
    expect(isValidTotpInput("!!!!")).toBe(false);
    expect(isValidTotpInput("otpauth://totp/x?secret=MZXW6YTBOI")).toBe(true);
  });
});
