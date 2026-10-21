"use strict";

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawnSync } = require("child_process");

const sourceRoot = path.resolve(__dirname, "..");
const distRoot = path.join(sourceRoot, "dist");
const packageMetadata = require(path.join(sourceRoot, "package.json"));
const defaults = {
  version: packageMetadata.version,
  winswVersion: "2.12.0",
  winswAsset: "WinSW.NET461.exe",
  winswSha256: "B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F",
  winswPath: "",
  outputDirectory: "",
  keepExpandedPackage: false,
};

function parseArguments(argv) {
  const options = { ...defaults };
  const mappings = {
    "--version": "version",
    "--winsw-version": "winswVersion",
    "--winsw-asset": "winswAsset",
    "--winsw-sha256": "winswSha256",
    "--winsw-path": "winswPath",
    "--output": "outputDirectory",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--keep-expanded") {
      options.keepExpandedPackage = true;
      continue;
    }
    const property = mappings[argument];
    if (!property || index + 1 >= argv.length) {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
    options[property] = argv[index + 1];
    index += 1;
  }
  return options;
}

function assertPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Output directory must be a child of ${parentPath}`);
  }
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex").toUpperCase();
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: sourceRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}.`);
  }
}

function downloadOnce(url, destination, redirectsRemaining = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "CustomReportServiceBuilder/1.0" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (redirectsRemaining <= 0) {
          reject(new Error(`Too many redirects while downloading ${url}`));
          return;
        }
        const redirectedUrl = new URL(response.headers.location, url).toString();
        downloadOnce(redirectedUrl, destination, redirectsRemaining - 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} while downloading ${url}`));
        return;
      }

      const temporaryPath = `${destination}.download`;
      const output = fs.createWriteStream(temporaryPath);
      response.pipe(output);
      output.on("finish", () => {
        output.close(() => {
          try {
            if (fs.statSync(temporaryPath).size === 0) {
              throw new Error("The downloaded file is empty.");
            }
            fs.renameSync(temporaryPath, destination);
            resolve();
          } catch (error) {
            fs.rmSync(temporaryPath, { force: true });
            reject(error);
          }
        });
      });
      output.on("error", (error) => {
        fs.rmSync(temporaryPath, { force: true });
        reject(error);
      });
    });
    request.setTimeout(30_000, () => request.destroy(new Error("Download timed out.")));
    request.on("error", reject);
  });
}

async function downloadWithRetry(url, destination, maxAttempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.rmSync(destination, { force: true });
      fs.rmSync(`${destination}.download`, { force: true });
      await downloadOnce(url, destination);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.warn(`Download attempt ${attempt} of ${maxAttempts} failed. Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }
  throw new Error(
    `Failed to download ${url} after ${maxAttempts} attempts. Check outbound HTTPS, DNS, and proxy settings. Last error: ${lastError.message}`,
  );
}

function installProductionDependencies(payloadApp) {
  const npmCliCandidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "npm", "node_modules", "npm", "bin", "npm-cli.js")
      : "",
  ].filter(Boolean);
  const npmCli = npmCliCandidates.find((candidate) => fs.existsSync(candidate));
  if (!npmCli) {
    throw new Error(
      "Unable to locate npm-cli.js. Install the 64-bit Node.js distribution with npm, then retry.",
    );
  }
  run(process.execPath, [npmCli, "ci", "--omit=dev", "--prefix", payloadApp]);
}

function createArchive(outputDirectory, archivePath) {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "Compress-Archive -Path (Join-Path $env:CR_PACKAGE_SOURCE '*') -DestinationPath $env:CR_PACKAGE_ARCHIVE -CompressionLevel Optimal",
  ].join("; ");
  run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: {
      ...process.env,
      CR_PACKAGE_SOURCE: outputDirectory,
      CR_PACKAGE_ARCHIVE: archivePath,
    },
  });
}

async function main() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("Build the Windows service package with 64-bit Node.js on Windows.");
  }

  const options = parseArguments(process.argv.slice(2));
  if (!/^[A-Fa-f0-9]{64}$/.test(options.winswSha256)) {
    throw new Error("--winsw-sha256 must be a 64-character SHA-256 hash.");
  }

  const outputDirectory = path.resolve(
    options.outputDirectory || path.join(distRoot, `CustomReportService-${options.version}`),
  );
  assertPathInside(distRoot, outputDirectory);
  const archivePath = `${outputDirectory}.zip`;
  const payloadApp = path.join(outputDirectory, "payload", "app");
  const payloadRuntime = path.join(outputDirectory, "payload", "runtime");

  fs.rmSync(outputDirectory, { recursive: true, force: true });
  fs.rmSync(archivePath, { force: true });
  fs.mkdirSync(payloadApp, { recursive: true });
  fs.mkdirSync(payloadRuntime, { recursive: true });

  try {
    const appFiles = [
      "server.js",
      "app.js",
      "index.html",
      "styles.css",
      "login.html",
      "login.css",
      "login.js",
      "package.json",
      "package-lock.json",
      "README.md",
    ];
    for (const fileName of appFiles) {
      copyFile(path.join(sourceRoot, fileName), path.join(payloadApp, fileName));
    }
    copyFile(path.join(sourceRoot, "db", "schema.sql"), path.join(payloadApp, "db", "schema.sql"));

    copyFile(process.execPath, path.join(payloadRuntime, "node.exe"));
    run(process.execPath, ["--check", path.join(payloadApp, "server.js")]);
    run(process.execPath, ["--check", path.join(payloadApp, "app.js")]);
    installProductionDependencies(payloadApp);

    const winSwUrl = `https://github.com/winsw/winsw/releases/download/v${options.winswVersion}/${options.winswAsset}`;
    const winSwDestination = path.join(outputDirectory, "CustomReportService.exe");
    if (options.winswPath) {
      const localWinSwPath = path.resolve(options.winswPath);
      if (!fs.existsSync(localWinSwPath)) {
        throw new Error(`The supplied WinSW file does not exist: ${localWinSwPath}`);
      }
      copyFile(localWinSwPath, winSwDestination);
    } else {
      await downloadWithRetry(winSwUrl, winSwDestination);
    }
    const actualWinSwHash = sha256(winSwDestination);
    if (actualWinSwHash !== options.winswSha256.toUpperCase()) {
      throw new Error(
        `WinSW checksum verification failed for ${options.winswAsset}. Expected ${options.winswSha256} but received ${actualWinSwHash}.`,
      );
    }

    const serviceFiles = [
      "CustomReportService.xml",
      "service.env.example",
      "service-common.ps1",
      "install-service.ps1",
      "update-service.ps1",
      "status-service.ps1",
      "uninstall-service.ps1",
      "set-report-password.ps1",
      "hash-password.js",
    ];
    for (const fileName of serviceFiles) {
      copyFile(path.join(__dirname, fileName), path.join(outputDirectory, fileName));
    }
    copyFile(path.join(__dirname, "README.md"), path.join(outputDirectory, "README.md"));
    fs.writeFileSync(path.join(outputDirectory, "VERSION"), `${options.version}\n`, "utf8");

    createArchive(outputDirectory, archivePath);
    console.log(`Service package created: ${archivePath}`);
    console.log(`SHA-256: ${sha256(archivePath)}`);
  } catch (error) {
    fs.rmSync(archivePath, { force: true });
    throw error;
  } finally {
    if (!options.keepExpandedPackage) {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
