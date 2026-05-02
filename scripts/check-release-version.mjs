import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolveExpectedVersion() {
  const cliArgs = process.argv.slice(2).filter((value) => value !== "--");
  const rawVersion = cliArgs[0] ?? process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME;

  if (!rawVersion) {
    return null;
  }

  return rawVersion.trim().replace(/^v/, "");
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(relativePath) {
  const filePath = path.join(root, relativePath);
  return fs.readFileSync(filePath, "utf8");
}

function parseCargoVersion(tomlText) {
  const match = tomlText.match(/^version\s*=\s*"([^"]+)"/m);

  if (!match) {
    throw new Error("Could not find version in src-tauri/Cargo.toml");
  }

  return match[1];
}

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const expectedVersion = resolveExpectedVersion();

const packageVersion = packageJson.version;
const tauriVersion = tauriConfig.version;
const cargoVersion = parseCargoVersion(cargoToml);

const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
  "src-tauri/Cargo.toml": cargoVersion,
};

const uniqueVersions = [...new Set(Object.values(versions))];

if (uniqueVersions.length !== 1) {
  console.error("Release version mismatch detected:\n");

  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version}`);
  }

  process.exit(1);
}

if (expectedVersion && uniqueVersions[0] !== expectedVersion) {
  console.error(
    `Release version ${uniqueVersions[0]} does not match expected version ${expectedVersion}.`,
  );
  process.exit(1);
}

console.log(`Release versions are aligned at ${uniqueVersions[0]}.`);
