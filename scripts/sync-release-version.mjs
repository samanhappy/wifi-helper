import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolveVersion() {
  const cliArgs = process.argv.slice(2).filter((value) => value !== "--");
  const rawVersion = cliArgs[0] ?? process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME;

  if (!rawVersion) {
    throw new Error(
      "Missing release version. Pass it as an argument, RELEASE_VERSION, or GITHUB_REF_NAME.",
    );
  }

  const normalizedVersion = rawVersion.trim().replace(/^v/, "");

  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    throw new Error(`Invalid release version: ${rawVersion}`);
  }

  return normalizedVersion;
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(relativePath, value) {
  const filePath = path.join(root, relativePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readText(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.readFileSync(filePath, "utf8");
}

function writeText(relativePath, value) {
  const filePath = path.join(root, relativePath);
  fs.writeFileSync(filePath, value);
}

function updateCargoVersion(tomlText, version) {
  const packageSectionPattern = /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/;

  if (!packageSectionPattern.test(tomlText)) {
    throw new Error("Could not find package version in src-tauri/Cargo.toml");
  }

  return tomlText.replace(packageSectionPattern, `$1${version}$3`);
}

const version = resolveVersion();

const packageJson = readJson("package.json");
packageJson.version = version;
writeJson("package.json", packageJson);

const tauriConfig = readJson("src-tauri/tauri.conf.json");
tauriConfig.version = version;
writeJson("src-tauri/tauri.conf.json", tauriConfig);

const cargoToml = readText("src-tauri/Cargo.toml");
writeText("src-tauri/Cargo.toml", updateCargoVersion(cargoToml, version));

console.log(`Synchronized release version to ${version}.`);