const { execFile } = require("child_process");

let cachedGpuInfo = null;

function detectNvidiaGpu() {
  if (cachedGpuInfo) return Promise.resolve(cachedGpuInfo);

  if (process.platform === "darwin") {
    cachedGpuInfo = { hasNvidiaGpu: false };
    return Promise.resolve(cachedGpuInfo);
  }

  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=name,driver_version,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          cachedGpuInfo = { hasNvidiaGpu: false };
          resolve(cachedGpuInfo);
          return;
        }

        const parts = stdout
          .trim()
          .split(",")
          .map((s) => s.trim());
        if (parts.length < 3) {
          cachedGpuInfo = { hasNvidiaGpu: false };
          resolve(cachedGpuInfo);
          return;
        }

        cachedGpuInfo = {
          hasNvidiaGpu: true,
          gpuName: parts[0],
          driverVersion: parts[1],
          vramMb: parseInt(parts[2], 10) || undefined,
        };
        resolve(cachedGpuInfo);
      }
    );
  });
}

function parseFreeVramMb(csvOutput) {
  const trimmed = (csvOutput || "").trim();
  if (!trimmed) return null;
  const value = parseInt(trimmed.split(",")[0].trim(), 10);
  return Number.isFinite(value) ? value : null;
}

// Not cached like detectNvidiaGpu's memory.total — free VRAM changes with
// every model load/unload, so a stale cache here would defeat the guard.
function getFreeVramMb() {
  if (process.platform === "darwin") return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=memory.free", "--format=csv,noheader,nounits"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        resolve(parseFreeVramMb(stdout));
      }
    );
  });
}

let cachedGpuList = null;

function listNvidiaGpus() {
  if (cachedGpuList) return Promise.resolve(cachedGpuList);

  if (process.platform === "darwin") {
    cachedGpuList = [];
    return Promise.resolve(cachedGpuList);
  }

  return new Promise((resolve) => {
    execFile(
      "nvidia-smi",
      ["--query-gpu=index,uuid,name,memory.total", "--format=csv,noheader,nounits"],
      { timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout) {
          cachedGpuList = [];
          resolve(cachedGpuList);
          return;
        }

        const gpus = stdout
          .trim()
          .split("\n")
          .map((line) => {
            const parts = line.split(",").map((s) => s.trim());
            return {
              index: parseInt(parts[0], 10),
              uuid: parts[1] || "",
              name: parts[2] || "Unknown GPU",
              vramMb: parseInt(parts[3], 10) || 0,
            };
          })
          .filter((g) => !isNaN(g.index));

        if (gpus.length > 0) cachedGpuList = gpus;
        resolve(gpus);
      }
    );
  });
}

module.exports = { detectNvidiaGpu, listNvidiaGpus, parseFreeVramMb, getFreeVramMb };
