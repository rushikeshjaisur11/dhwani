const { execFile } = require("child_process");
const { promisify } = require("util");
const debugLogger = require("./debugLogger");
const sidecarPidFile = require("./sidecarPidFile");

const execFileAsync = promisify(execFile);

const EXPECTED_BINARY_FRAGMENTS = {
  parakeet: "sherpa-onnx-ws",
  whisper: "whisper-server",
  llama: "llama-server",
  qdrant: "qdrant",
  diarization: "sherpa-onnx-diarize",
};

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

async function processCommand(pid) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { windowsHide: true }
      );
      const match = stdout.match(/^"([^"]+)"/);
      return match ? match[1] : "";
    }
    const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function reapStaleSidecars() {
  const entries = sidecarPidFile.readAll();
  await Promise.all(
    entries.map(async ({ name, pid }) => {
      const fragment = EXPECTED_BINARY_FRAGMENTS[name];
      if (fragment && isProcessAlive(pid) && (await processCommand(pid)).includes(fragment)) {
        debugLogger.warn("Reaping stale sidecar", { name, pid });
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // Already dead.
        }
      }
      sidecarPidFile.clear(name);
    })
  );
}

module.exports = { reapStaleSidecars };
