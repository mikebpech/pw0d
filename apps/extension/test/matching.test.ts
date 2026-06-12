import { describe, expect, it } from "vitest";
import { hostnameOf, urlMatchScore } from "../lib/matching";

describe("urlMatchScore (phishing resistance)", () => {
  const github = ["https://github.com/login"];

  it("exact host scores 2", () => {
    expect(urlMatchScore(github, "https://github.com/session")).toBe(2);
  });

  it("same registrable domain scores 1", () => {
    expect(urlMatchScore(github, "https://gist.github.com/x")).toBe(1);
    expect(urlMatchScore(["https://accounts.google.com"], "https://mail.google.com")).toBe(1);
  });

  it("lookalike domains NEVER match", () => {
    expect(urlMatchScore(github, "https://evil-github.com/login")).toBe(0);
    expect(urlMatchScore(github, "https://github.com.evil.io/login")).toBe(0);
    expect(urlMatchScore(github, "https://githubb.com/login")).toBe(0);
  });

  it("public suffixes are not shared domains", () => {
    expect(urlMatchScore(["https://foo.co.uk"], "https://bar.co.uk")).toBe(0);
    expect(urlMatchScore(["https://foo.github.io"], "https://bar.github.io")).toBe(1);
  });

  it("bare hostnames in items still match", () => {
    expect(urlMatchScore(["github.com"], "https://github.com/login")).toBe(2);
  });

  it("garbage urls never match", () => {
    expect(urlMatchScore(["not a url"], "https://github.com")).toBe(0);
    expect(urlMatchScore(github, "chrome://extensions")).toBe(0);
  });
});

describe("hostnameOf", () => {
  it("parses with and without scheme", () => {
    expect(hostnameOf("https://Github.com/login")).toBe("github.com");
    expect(hostnameOf("github.com")).toBe("github.com");
    expect(hostnameOf("::::")).toBeNull();
  });
});
