/**
 * Password strength scoring (zxcvbn). Runs client-side only, post-decryption —
 * never send passwords anywhere to score them.
 */

import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";

zxcvbnOptions.setOptions({
  dictionary: common.dictionary,
  graphs: common.adjacencyGraphs,
});

export interface StrengthResult {
  /** 0 (terrible) … 4 (great) */
  score: 0 | 1 | 2 | 3 | 4;
  crackTimeDisplay: string;
  warning: string | null;
  suggestions: string[];
}

export function scorePassword(password: string): StrengthResult {
  const result = zxcvbn(password);
  return {
    score: result.score,
    crackTimeDisplay: String(result.crackTimesDisplay.offlineSlowHashing1e4PerSecond),
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions,
  };
}
