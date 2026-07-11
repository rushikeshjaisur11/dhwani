const { spawn } = require("child_process");

// Process names that mean the foreground window is Dhwani itself.
const OWN_PROCESS_NAMES = ["electron", "dhwani"];

// ponytail: PowerShell one-shot costs ~0.5-1s per call (Add-Type compile), but the
// caller fires it concurrently with Whisper transcription so nothing waits on it.
// Upgrade path if it ever matters: emit foreground info from the long-running
// windows-key-listener native binary instead.
const PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder t, int c);
}
"@
$h=[FG]::GetForegroundWindow(); $procId=0; [FG]::GetWindowThreadProcessId($h,[ref]$procId) | Out-Null
$sb=New-Object System.Text.StringBuilder 512; [FG]::GetWindowText($h,$sb,512) | Out-Null
$p=Get-Process -Id $procId -ErrorAction SilentlyContinue
Write-Output ($p.ProcessName + [char]9 + $sb.ToString())
`;

function parseForegroundOutput(stdout, ownProcessNames = OWN_PROCESS_NAMES) {
  const line = (stdout || "").trim();
  const tab = line.indexOf("\t");
  if (tab < 1) return null;
  const app = line.slice(0, tab).trim();
  const title = line.slice(tab + 1).trim();
  if (!app) return null;
  if (ownProcessNames.some((n) => app.toLowerCase().includes(n))) return null;
  return { app, title };
}

function getForegroundApp() {
  if (process.platform !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 5000 }
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(parseForegroundOutput(out)));
  });
}

module.exports = { getForegroundApp, parseForegroundOutput };
