/**
 * NordPass CSV import. NordPass exports columns like:
 *   name,url,username,password,note,cardholdername,cardnumber,cvc,expirydate,
 *   zipcode,folder,full_name,phone_number,address1,address2,city,country,state[,type]
 * We map logins and notes; cards/identities are counted and skipped (no such
 * item types yet). Also tolerates generic name/url/username/password/note CSVs.
 */

import type { ItemData } from "@pw0d/core";
import Papa from "papaparse";

export interface ParsedImport {
  items: { data: ItemData; folderName: string | null }[];
  skipped: number;
}

type Row = Record<string, string | undefined>;

function field(row: Row, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

export function parseNordpassCsv(csv: string): ParsedImport {
  const parsed = Papa.parse<Row>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  const items: ParsedImport["items"] = [];
  let skipped = 0;

  for (const row of parsed.data) {
    const name = field(row, "name", "title");
    const username = field(row, "username", "login", "email");
    const password = field(row, "password");
    const url = field(row, "url", "website");
    const note = field(row, "note", "notes");
    const folderName = field(row, "folder") || null;
    const explicitType = field(row, "type").toLowerCase();

    if (field(row, "cardnumber") || explicitType === "credit_card" || explicitType === "identity") {
      skipped += 1;
      continue;
    }

    if (username || password || url || explicitType === "password") {
      items.push({
        folderName,
        data: {
          type: "login",
          name: name || url || username || "Imported login",
          username,
          password,
          urls: url ? [url] : [],
          notes: note,
          customFields: [],
        },
      });
    } else if (note || explicitType === "note") {
      items.push({
        folderName,
        data: { type: "note", name: name || "Imported note", content: note },
      });
    } else if (name) {
      skipped += 1;
    }
  }

  return { items, skipped };
}
