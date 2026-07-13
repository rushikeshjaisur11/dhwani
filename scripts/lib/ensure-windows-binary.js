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

/**
 * Locate vcvars64.bat for the newest installed MSVC toolchain, so `cl` can be
 * invoked from a plain shell (not just a VS Developer Command Prompt).
 */
function findVcvars() {
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const vswhere = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe");

  if (fs.existsSync(vswhere)) {
    const result = spawnSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property",
        "installationPath",
      ],
      { encoding: "utf8" }
    );
    const installPath = result.stdout && result.stdout.trim();
    if (installPath) {
      const candidate = path.join(installPath, "VC", "Auxiliary", "Build", "vcvars64.bat");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback: known fixed install locations (BuildTools/Community, VS 18/17).
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  for (const base of [programFiles, programFilesX86]) {
    for (const version of ["18", "2022", "17"]) {
      for (const edition of ["BuildTools", "Community", "Professional", "Enterprise"]) {
        const candidate = path.join(
          base,
          "Microsoft Visual Studio",
          version,
          edition,
          "VC",
          "Auxiliary",
          "Build",
          "vcvars64.bat"
        );
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
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
      name: "MSVC (via vcvars64.bat)",
      // Only tried if bare `cl` isn't already on PATH — see the check below.
      viaVcvars: true,
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
    if (compiler.viaVcvars) {
      // Bare `cl` already on PATH means the plain MSVC entry above already
      // covered this case (or will have failed for a real reason, not PATH).
      // `where` (unlike a shell-executed `cl`) exits non-zero cleanly when
      // the command isn't found, so it reliably answers "is cl on PATH?".
      const whereCl = spawnSync("where", ["cl"], { stdio: "pipe", shell: false });
      if (whereCl.status === 0) {
        continue;
      }

      const vcvars = findVcvars();
      if (!vcvars) {
        log(`${compiler.name}: no Visual Studio installation found, trying next...`);
        continue;
      }

      log(`Trying ${compiler.name}...`);
      log(`Compiling with: ${compiler.command} ${compiler.args.join(" ")} (via ${vcvars})`);
      const cmdLine = `call "${vcvars}" >nul && ${compiler.command} ${compiler.args
        .map((a) => (/[\s"]/.test(a) ? `"${a}"` : a))
        .join(" ")}`;
      // shell:true already runs this through `cmd.exe /d /s /c`, so pass the
      // compile line directly rather than wrapping it in another cmd /c.
      const result = spawnSync(cmdLine, {
        stdio: "inherit",
        cwd: projectRoot,
        shell: true,
      });

      if (result.status === 0 && fs.existsSync(outputBinary)) {
        log(`Successfully built with ${compiler.name}`);
        return true;
      }

      log(`${compiler.name} compilation failed, trying next...`);
      continue;
    }

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
 * @param {boolean} [opts.noDownloadFallback] - never fall back to the prebuilt
 *   download (used when the downloaded binary is known to lag local source
 *   changes — shipping it would be worse than shipping nothing).
 */
async function ensureWindowsBinary({
  name,
  order,
  msvcLibs,
  gnuLibs,
  fallbackMessage,
  noDownloadFallback,
}) {
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

  const compileAttempt = () => tryCompile({ log, cSource, outputBinary, projectRoot, libs });
  const downloadAttempt = () => tryDownload({ log, downloadScript, outputBinary, projectRoot });

  const attempts = noDownloadFallback
    ? [compileAttempt]
    : order === "compile-first"
      ? [compileAttempt, downloadAttempt]
      : [downloadAttempt, compileAttempt];

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
