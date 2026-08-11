const fs = require("fs");
const { promises: fsPromises } = require("fs");
const path = require("path");
const { app } = require("electron");
const debugLogger = require("./debugLogger");
const {
  downloadFile,
  fetchJson,
  createDownloadSignal,
  checkDiskSpace,
  cleanupStaleDownloads,
  extractArchive,
  findFile,
  findFiles,
} = require("./downloadUtils");
const { getSafeTempDir } = require("./safeTempDir");

// Same repo/release as whisperCudaManager.js (OpenWhispr's whisper.cpp fork
// ships cpu/cuda/vulkan variants of whisper-server from one release) --
// verified live: the latest release includes whisper-server-{linux,win32}-
// x64-vulkan.zip alongside the cpu/cuda assets.
const GITHUB_RELEASE_URL = "https://api.github.com/repos/OpenWhispr/whisper.cpp/releases/latest";

const PLATFORM_BINARY_NAMES = {
  linux: "whisper-server-linux-x64-vulkan",
  win32: "whisper-server-win32-x64-vulkan.exe",
};

const PLATFORM_ASSET_NAMES = {
  linux: "whisper-server-linux-x64-vulkan.zip",
  win32: "whisper-server-win32-x64-vulkan.zip",
};

const COMPANION_PATTERNS = {
  linux: /\.so(\.\d+)*$/,
  win32: /\.dll$/i,
};

function isSupportedPlatform() {
  return process.platform === "linux" || process.platform === "win32";
}

// Mirrors WhisperCudaManager's shape exactly (same binDir, same download/
// extract/delete flow) so the two can share ipcHandlers/UI patterns with
// minimal duplication -- only the release asset names and the resulting
// binary suffix (-vulkan vs -cuda) differ.
class WhisperVulkanManager {
  constructor() {
    this._binDir = null;
    this._downloadSignal = null;
    this._downloading = false;
  }

  getVulkanBinaryDir() {
    if (!this._binDir) {
      this._binDir = path.join(app.getPath("userData"), "bin");
      fs.mkdirSync(this._binDir, { recursive: true });
    }
    return this._binDir;
  }

  getVulkanBinaryPath() {
    if (!isSupportedPlatform()) return null;

    const binaryName = PLATFORM_BINARY_NAMES[process.platform];
    const binaryPath = path.join(this.getVulkanBinaryDir(), binaryName);
    return fs.existsSync(binaryPath) ? binaryPath : null;
  }

  isDownloaded() {
    return !!this.getVulkanBinaryPath();
  }

  isDownloading() {
    return this._downloading;
  }

  async fetchReleaseInfo() {
    if (!isSupportedPlatform()) {
      throw new Error(`Vulkan binaries not available for ${process.platform}`);
    }

    const release = await fetchJson(GITHUB_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    const assetName = PLATFORM_ASSET_NAMES[process.platform];
    const asset = release.assets?.find((a) => a.name === assetName);

    if (!asset) {
      throw new Error(`No Vulkan asset found for ${process.platform} (expected ${assetName})`);
    }

    return {
      url: asset.browser_download_url,
      size: asset.size,
      version: release.tag_name,
    };
  }

  async download(progressCallback) {
    if (this._downloading) throw new Error("Download already in progress");
    if (!isSupportedPlatform()) {
      throw new Error(`Vulkan binaries not available for ${process.platform}`);
    }

    this._downloading = true;

    let zipPath = null;
    let extractDir = null;

    try {
      const releaseInfo = await this.fetchReleaseInfo();
      debugLogger.info("Vulkan binary download starting", {
        version: releaseInfo.version,
        size: releaseInfo.size,
      });

      const binDir = this.getVulkanBinaryDir();

      const spaceCheck = await checkDiskSpace(binDir, releaseInfo.size * 2);
      if (!spaceCheck.ok) {
        throw new Error(
          `Not enough disk space. Need ~${Math.round((releaseInfo.size * 2) / 1_000_000)}MB, ` +
            `only ${Math.round(spaceCheck.availableBytes / 1_000_000)}MB available.`
        );
      }

      await cleanupStaleDownloads(binDir);

      const { signal, abort } = createDownloadSignal();
      this._downloadSignal = { abort };

      const tempDir = getSafeTempDir();
      zipPath = path.join(tempDir, `vulkan-download-${Date.now()}.zip`);
      extractDir = path.join(tempDir, `temp-extract-${Date.now()}`);

      await downloadFile(releaseInfo.url, zipPath, {
        timeout: 600000,
        signal,
        expectedSize: releaseInfo.size,
        onProgress: (downloaded, total) => {
          if (progressCallback) {
            progressCallback({
              type: "progress",
              downloaded_bytes: downloaded,
              total_bytes: total,
              percentage: total > 0 ? Math.round((downloaded / total) * 100) : 0,
            });
          }
        },
      });

      await fsPromises.mkdir(extractDir, { recursive: true });
      await extractArchive(zipPath, extractDir);

      const binaryName = PLATFORM_BINARY_NAMES[process.platform];
      const companionPattern = COMPANION_PATTERNS[process.platform];

      const binaryPath = await findFile(extractDir, binaryName);
      if (!binaryPath) {
        throw new Error(`Extraction completed but binary "${binaryName}" not found in archive`);
      }

      const dest = path.join(binDir, binaryName);
      await fsPromises.copyFile(binaryPath, dest);
      if (process.platform === "linux") {
        await fsPromises.chmod(dest, 0o755);
      }

      const libs = await findFiles(extractDir, companionPattern);
      for (const lib of libs) {
        const libDest = path.join(binDir, path.basename(lib));
        await fsPromises.copyFile(lib, libDest);
        if (process.platform === "linux") {
          await fsPromises.chmod(libDest, 0o755);
        }
      }

      debugLogger.info("Vulkan binary download complete", {
        version: releaseInfo.version,
        path: this.getVulkanBinaryPath(),
      });

      if (progressCallback) {
        progressCallback({ type: "complete", percentage: 100 });
      }
    } catch (error) {
      if (error.isAbort) {
        throw new Error("Download cancelled by user");
      }
      throw error;
    } finally {
      this._downloading = false;
      this._downloadSignal = null;
      if (zipPath) await fsPromises.unlink(zipPath).catch(() => {});
      if (extractDir)
        await fsPromises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async cancelDownload() {
    if (this._downloadSignal) {
      this._downloadSignal.abort();
      this._downloadSignal = null;
      return { success: true, message: "Download cancelled" };
    }
    return { success: false, error: "No active download to cancel" };
  }

  async delete() {
    if (!isSupportedPlatform()) {
      return { success: false, error: "Not supported on this platform" };
    }

    const binDir = this.getVulkanBinaryDir();
    const binaryName = PLATFORM_BINARY_NAMES[process.platform];
    const companionPattern = COMPANION_PATTERNS[process.platform];

    let deletedCount = 0;
    let freedBytes = 0;

    try {
      const entries = await fsPromises.readdir(binDir);

      for (const entry of entries) {
        if (entry === binaryName || companionPattern.test(entry)) {
          const filePath = path.join(binDir, entry);
          try {
            const stats = await fsPromises.stat(filePath);
            await fsPromises.unlink(filePath);
            freedBytes += stats.size;
            deletedCount++;
          } catch {
            // Continue with remaining files
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    debugLogger.info("Vulkan binary deleted", { deletedCount, freedBytes });

    return {
      success: deletedCount > 0,
      deleted_count: deletedCount,
      freed_bytes: freedBytes,
      freed_mb: Math.round(freedBytes / (1024 * 1024)),
    };
  }
}

module.exports = WhisperVulkanManager;
