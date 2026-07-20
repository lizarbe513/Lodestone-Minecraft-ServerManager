import { globals } from "./state.js";

const { invoke } = window.__TAURI__.core;

export async function getPaperDownloadUrl(version) {
  const res = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${version}`);
  const data = await res.json();
  const build = data.builds[0];
  const buildRes = await fetch(`https://fill.papermc.io/v3/projects/paper/versions/${version}/builds/${build}`);
  const buildData = await buildRes.json();
  return buildData.downloads["server:default"].url;
}

export async function getVanillaDownloadUrl(versionId) {
  if (!globals.cachedVanillaVersions) return null;
  const version = globals.cachedVanillaVersions.find(v => v.id === versionId);
  if (!version) return null;
  const res = await fetch(version.url);
  const data = await res.json();
  return data.downloads.server.url;
}

export async function getPurpurDownloadUrl(version) {
  return `https://api.purpurmc.org/v2/purpur/${version}/latest/download`;
}

export async function getFabricDownloadUrl(version) {
  const loaderRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}`);
  const loaderData = await loaderRes.json();
  if (!loaderData || loaderData.length === 0) {
    throw new Error("No se encontró ningún loader de Fabric compatible.");
  }
  const loaderVersion = loaderData[0].loader.version;

  const installerRes = await fetch("https://meta.fabricmc.net/v2/versions/installer");
  const installerData = await installerRes.json();
  if (!installerData || installerData.length === 0) {
    throw new Error("No se encontró ningún instalador de Fabric.");
  }
  const installerVersion = installerData[0].version;

  return `https://meta.fabricmc.net/v2/versions/loader/${version}/${loaderVersion}/${installerVersion}/server/jar`;
}

export async function fetchForgeVersions() {
  const res = await fetch("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
  const data = await res.json();
  const versions = [];
  // promotions_slim tiene "promos": { "1.20.1-recommended": "47.2.0", ... }
  for (const key of Object.keys(data.promos)) {
    if (key.endsWith("-recommended")) {
      const mcVersion = key.replace("-recommended", "");
      versions.push({ mcVersion, forgeVersion: data.promos[key] });
    }
  }
  // Reverse sort to show latest first
  return versions.reverse();
}

export async function getForgeDownloadUrl(mcVersion, forgeVersion) {
  return `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-installer.jar`;
}

export async function fetchNeoForgeVersions() {
  const res = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
  const data = await res.json();
  const versions = data.versions.filter(v => !v.includes("alpha") && !v.includes("beta"));
  // Agrupar por versión de MC inferida (21.x -> 1.21, 20.4.x -> 1.20.4)
  const mapped = versions.map(v => {
    let mc = "1." + v.split(".")[0];
    if (v.startsWith("20.4")) mc = "1.20.4";
    if (v.startsWith("20.3")) mc = "1.20.3";
    if (v.startsWith("20.2")) mc = "1.20.2";
    return { mcVersion: mc, neoVersion: v };
  });
  // Filtrar duplicados de mcVersion para dejar solo la más reciente
  const unique = [];
  const seen = new Set();
  for (let i = mapped.length - 1; i >= 0; i--) {
    if (!seen.has(mapped[i].mcVersion)) {
      seen.add(mapped[i].mcVersion);
      unique.push(mapped[i]);
    }
  }
  return unique; // Descending order usually from Maven, so end of array is latest
}

export async function getNeoForgeDownloadUrl(neoVersion) {
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;
}

// Wrapper utility para invocar a tauri (opcional usar directamente invoke)
const { open, ask } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;
export { invoke, open, ask, listen };
