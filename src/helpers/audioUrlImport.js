const path = require("path");
const { net } = require("electron");
const { downloadFile } = require("./downloadUtils");
const { getSafeTempDir } = require("./safeTempDir");
const debugLogger = require("./debugLogger");

const USER_AGENT = "Dhwani/1.0";
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB, matches the existing cloud-pro upload cap
const PROBE_TIMEOUT_MS = 15000;

// Content-Type -> extension the rest of the upload pipeline already accepts
// (SUPPORTED_EXTENSIONS in UploadAudioView.tsx). Only audio/* is allowed —
// this is a direct-audio-URL importer, not a video/YouTube extractor.
const CONTENT_TYPE_EXTENSIONS = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/aac": "aac",
};

function isHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function inferExtension(contentType, url) {
  const normalized = (contentType || "").split(";")[0].trim().toLowerCase();
  if (CONTENT_TYPE_EXTENSIONS[normalized]) return CONTENT_TYPE_EXTENSIONS[normalized];

  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).slice(1).toLowerCase();
    if (Object.values(CONTENT_TYPE_EXTENSIONS).includes(ext)) return ext;
  } catch {
    // ignore
  }
  return null;
}

// HEAD request (falling back to a GET that's aborted after headers arrive,
// for servers that don't support HEAD) to learn Content-Type/Content-Length
// before committing to a full download.
function probeUrl(url) {
  return new Promise((resolve, reject) => {
    const attempt = (method) => {
      const request = net.request({ url, method });
      request.setHeader("User-Agent", USER_AGENT);

      const timeoutId = setTimeout(() => {
        request.abort();
        reject(new Error("Request to server timed out"));
      }, PROBE_TIMEOUT_MS);

      request.on("response", (response) => {
        clearTimeout(timeoutId);
        response.resume();
        if (method === "HEAD" && (response.statusCode === 405 || response.statusCode === 501)) {
          attempt("GET");
          return;
        }
        if (response.statusCode >= 400) {
          reject(new Error(`Server returned HTTP ${response.statusCode}`));
          return;
        }
        const contentType = response.headers["content-type"];
        const contentLength = response.headers["content-length"];
        resolve({
          contentType: Array.isArray(contentType) ? contentType[0] : contentType,
          contentLength: contentLength
            ? parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength, 10)
            : 0,
        });
      });

      request.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      request.end();
    };

    attempt("HEAD");
  });
}

// Downloads a direct audio URL to a temp file for the upload-transcription
// pipeline. Rejects non-http(s) schemes, non-audio content types, and files
// over MAX_BYTES. Returns the local file path on success; throws a
// user-facing Error message otherwise.
async function downloadAudioFromUrl(url, onProgress) {
  if (!isHttpUrl(url)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  const { contentType, contentLength } = await probeUrl(url);

  const normalizedType = (contentType || "").split(";")[0].trim().toLowerCase();
  if (normalizedType && !normalizedType.startsWith("audio/")) {
    throw new Error(
      `This URL points to "${normalizedType || "unknown"}" content, not audio. ` +
        "Direct audio file URLs only (YouTube and other video pages aren't supported)."
    );
  }

  if (contentLength > MAX_BYTES) {
    throw new Error(
      `File is ${Math.round(contentLength / (1024 * 1024))} MB, over the 500 MB limit.`
    );
  }

  const extension = inferExtension(contentType, url) || "mp3";
  const fileName = `dhwani-url-import-${Date.now()}.${extension}`;
  const destPath = path.join(getSafeTempDir(), fileName);

  debugLogger.info("Downloading audio from URL", { url, destPath, contentType });

  await downloadFile(url, destPath, {
    expectedSize: contentLength || 0,
    onProgress,
  });

  return { filePath: destPath, fileName };
}

module.exports = { downloadAudioFromUrl, isHttpUrl, inferExtension };
