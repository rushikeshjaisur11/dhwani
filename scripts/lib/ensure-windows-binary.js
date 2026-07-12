/**
 * Shared logic for the Windows native-binary build scripts
 * (windows-key-listener, windows-fast-paste, windows-text-monitor).
 *
 * Strategy is either compile-then-download or download-then-compile,
 * per binary (see `order` option) — both are supported dev-machine paths.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isBinaryUpToDate(outputBinary, cSource) {
  if (!fs.existsSync(outputBinary)) {
    return false;
  }

  // If source doesn't exist, can't check if rebuild needed - assume binary is good
  if (!fs.existsSync(cSource)) {
    return true;
  }

  try {
    const binaryStat = fs.statSync(outputBinary);
    const sourceStat = fs.statSync(cSource);
    return binaryStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

async function tryDownload({ log, downloadScript, outputBinary, projectRoot }) {
  log("Attempting to download prebuilt binary...");

  if (!fs.existsSync(downloadScript)) {
    log("Download script not found, skipping download");
    return false;
  }

  const result = spawnSync(process.execPath, [downloadScript, "--force"], {
    stdio: "inherit",
    cwd: projectRoot,
  });

  if (result.status === 0 && fs.existsSync(outputBinary)) {
    log("Successfully downloaded prebuilt binary");
    return true;
  }

  log("Download failed or binary not found after download");
  return false;
}

function tryCompile({ log, cSource, outputBinary, projectRoot, libs }) {
  if (!fs.existsSync(cSource)) {
    log("C source not found, cannot compile locally");
    return false;
  }

  log("Attempting local compilation...");

  const compilers = [
    {
      name: "MSVC",
      check: { command: "cl", args: [] },
      command: "cl",
      args: ["/O2", "/nologo", cSource, `/Fe:${outputBinary}`, ...libs.msvc],
    },
    {
      name: "MinGW-w64",
      check: { command: "gcc", args: ["--version"] },
      command: "gcc",
      // Keep the console subsystem so stdout/stderr remain attached to the parent process.
      args: ["-O2", cSource, "-o", outputBinary, ...libs.gnu],
    },
    {
      name: "Clang",
      check: { command: "clang", args: ["--version"] },
      command: "clang",
      args: ["-O2", cSource, "-o", outputBinary, ...libs.gnu],
    },
  ];

  for (const compiler of compilers) {
    log(`Trying ${compiler.name}...`);

    // Check if compiler is available
    const checkResult = spawnSync(compiler.check.command, compiler.check.args, {
      stdio: "pipe",
      shell: true,
    });

    if (checkResult.status !== 0 && checkResult.error) {
      log(`${compiler.name} not found, trying next...`);
      continue;
    }

    log(`Compiling with: ${compiler.command} ${compiler.args.join(" ")}`);
    const result = spawnSync(compiler.command, compiler.args, {
      stdio: "inherit",
      cwd: projectRoot,
      shell: false,
    });

    if (result.status === 0 && fs.existsSync(outputBinary)) {
      log(`Successfully built with ${compiler.name}`);
      return true;
    }

    log(`${compiler.name} compilation failed, trying next...`);
  }

  return false;
}

/**
 * @param {object} opts
 * @param {string} opts.name - binary base name, e.g. "windows-key-listener"
 * @param {"compile-first"|"download-first"} opts.order
 * @param {string[]} opts.msvcLibs - e.g. ["user32.lib"]
 * @param {string[]} opts.gnuLibs - e.g. ["-luser32"]
 * @param {string} opts.fallbackMessage - shown if neither compile nor download works
 */
async function ensureWindowsBinary({ name, order, msvcLibs, gnuLibs, fallbackMessage }) {
  const isWindows = process.platform === "win32";
  if (!isWindows) {
    // Only needed on Windows
    process.exit(0);
  }

  const projectRoot = path.resolve(__dirname, "..", "..");
  const cSource = path.join(projectRoot, "resources", `${name}.c`);
  const outputDir = path.join(projectRoot, "resources", "bin");
  const outputBinary = path.join(outputDir, `${name}.exe`);
  const downloadScript = path.join(projectRoot, "scripts", `download-${name}.js`);

  const log = (message) => console.log(`[${name}] ${message}`);
  const libs = { msvc: msvcLibs, gnu: gnuLibs };

  ensureDir(outputDir);

  if (isBinaryUpToDate(outputBinary, cSource)) {
    log("Binary is up to date, skipping build");
    return;
  }

  const attempts =
    order === "compile-first"
      ? [
          () => tryCompile({ log, cSource, outputBinary, projectRoot, libs }),
          () => tryDownload({ log, downloadScript, outputBinary, projectRoot }),
        ]
      : [
          () => tryDownload({ log, downloadScript, outputBinary, projectRoot }),
          () => tryCompile({ log, cSource, outputBinary, projectRoot, libs }),
        ];

  for (const attempt of attempts) {
    if (await attempt()) {
      return;
    }
  }

  // Neither worked - warn but don't fail
  console.warn(`[${name}] Could not obtain ${name} binary.`);
  console.warn(`[${name}] ${fallbackMessage}`);
  console.warn(`[${name}] To compile locally, install Visual Studio Build Tools or MinGW-w64.`);
}

module.exports = { ensureWindowsBinary };
