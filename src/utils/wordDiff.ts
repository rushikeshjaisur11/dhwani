export interface DiffOp {
  type: "same" | "del" | "ins";
  text: string;
}

// ponytail: O(n*m) LCS DP; beyond this cap fall back to whole-text del+ins.
const MAX_WORDS = 500;

// Word-level diff between two texts. Returns ops in reading order plus the
// number of changes (contiguous del/ins runs), for the "N Changes" header.
export function wordDiff(before: string, after: string): { ops: DiffOp[]; changeCount: number } {
  const a = before.trim() ? before.trim().split(/\s+/) : [];
  const b = after.trim() ? after.trim().split(/\s+/) : [];

  let ops: DiffOp[];
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) {
    ops = [
      ...(a.length ? [{ type: "del" as const, text: a.join(" ") }] : []),
      ...(b.length ? [{ type: "ins" as const, text: b.join(" ") }] : []),
    ];
  } else {
    // LCS length table
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0)
    );
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    // Walk the table, merging consecutive words of the same op type
    const raw: DiffOp[] = [];
    let i = 0;
    let j = 0;
    const push = (type: DiffOp["type"], word: string) => {
      const last = raw[raw.length - 1];
      if (last && last.type === type) last.text += ` ${word}`;
      else raw.push({ type, text: word });
    };
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        push("same", a[i]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        push("del", a[i]);
        i++;
      } else {
        push("ins", b[j]);
        j++;
      }
    }
    while (i < a.length) push("del", a[i++]);
    while (j < b.length) push("ins", b[j++]);
    ops = raw;
  }

  // A change = a contiguous run of del/ins ops (a del immediately followed by
  // an ins counts as one replacement).
  let changeCount = 0;
  let inChange = false;
  for (const op of ops) {
    if (op.type === "same") inChange = false;
    else if (!inChange) {
      changeCount++;
      inChange = true;
    }
  }

  return { ops, changeCount };
}
