/**
 * Universal importer — proves one column-mapper handles every major manager's
 * export without per-product code.
 */

import { describe, expect, it } from "vitest";
import { parseCsv, parseImport, parseJson } from "../src/lib/importers";

describe("parseCsv — column auto-detection across managers", () => {
  it("NordPass", () => {
    const csv = "name,url,username,password,note,folder\nGitHub,https://github.com,mike,hunter2,my note,Work";
    const result = parseCsv(csv);
    expect(result.source).toBe("NordPass");
    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.folderName).toBe("Work");
    expect(item.data.type).toBe("login");
    if (item.data.type === "login") {
      expect(item.data.username).toBe("mike");
      expect(item.data.password).toBe("hunter2");
      expect(item.data.urls).toEqual(["https://github.com"]);
    }
  });

  it("LastPass (url,username,password,totp,extra,name,grouping)", () => {
    const csv =
      "url,username,password,totp,extra,name,grouping,fav\nhttps://x.com,bob,pw1,JBSWY3DPEHPK3PXP,notes,X Account,Personal,0";
    const result = parseCsv(csv);
    expect(result.source).toBe("LastPass");
    const item = result.items[0]!;
    expect(item.data.type).toBe("login");
    if (item.data.type === "login") {
      expect(item.data.username).toBe("bob");
      expect(item.data.totp).toBe("JBSWY3DPEHPK3PXP");
      expect(item.data.name).toBe("X Account");
    }
    expect(item.folderName).toBe("Personal");
  });

  it("Bitwarden CSV (login_uri, login_username, login_password)", () => {
    const csv =
      "folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp\n" +
      "Social,0,login,Reddit,,,https://reddit.com,alice,secret,";
    const result = parseCsv(csv);
    expect(result.source).toBe("Bitwarden");
    const item = result.items[0]!;
    if (item.data.type === "login") {
      expect(item.data.username).toBe("alice");
      expect(item.data.urls).toEqual(["https://reddit.com"]);
    }
  });

  it("Chrome/Edge/Safari (name,url,username,password)", () => {
    const csv = "name,url,username,password\nGmail,https://mail.google.com,me@gmail.com,pw";
    const result = parseCsv(csv);
    const item = result.items[0]!;
    if (item.data.type === "login") {
      expect(item.data.username).toBe("me@gmail.com");
      expect(item.data.urls).toEqual(["https://mail.google.com"]);
    }
  });

  it("skips cards/identities, keeps a count", () => {
    const csv =
      "name,url,username,password,cardnumber,type\n" +
      "Login A,https://a.com,u,p,,login\n" +
      "Visa,,,,4111111111111111,credit_card";
    const result = parseCsv(csv);
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("rows with only a note become secure notes", () => {
    const csv = "name,note\nWifi,the password is hunter2";
    const result = parseCsv(csv);
    expect(result.items[0]!.data.type).toBe("note");
  });
});

describe("parseJson", () => {
  it("Bitwarden JSON export", () => {
    const json = JSON.stringify({
      folders: [{ id: "f1", name: "Work" }],
      items: [
        {
          type: 1,
          name: "GitHub",
          folderId: "f1",
          notes: "n",
          login: { username: "mike", password: "pw", uris: [{ uri: "https://github.com" }], totp: "ABC" },
        },
        { type: 2, name: "A note", notes: "body" },
        { type: 3, name: "A card" }, // skipped
      ],
    });
    const result = parseJson(json);
    expect(result.source).toBe("Bitwarden");
    expect(result.items).toHaveLength(2);
    expect(result.skipped).toBe(1);
    const login = result.items[0]!;
    expect(login.folderName).toBe("Work");
    if (login.data.type === "login") {
      expect(login.data.totp).toBe("ABC");
      expect(login.data.urls).toEqual(["https://github.com"]);
    }
  });

  it("pw0d's own JSON export round-trips", () => {
    const json = JSON.stringify({
      format: "pw0d/v1",
      items: [{ type: "login", name: "X", username: "u", password: "p", urls: [], notes: "", customFields: [], folder: "F" }],
    });
    const result = parseJson(json);
    expect(result.source).toBe("pw0d");
    expect(result.items[0]!.folderName).toBe("F");
  });
});

describe("parseImport dispatch", () => {
  it("routes by extension and content", () => {
    expect(parseImport("name,username\nX,u", "export.csv").items).toHaveLength(1);
    expect(parseImport('{"format":"pw0d/v1","items":[]}', "x.json").items).toHaveLength(0);
  });
});
