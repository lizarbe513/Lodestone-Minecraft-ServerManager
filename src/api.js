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

// Wrapper utility para invocar a tauri (opcional usar directamente invoke)
const { open, ask } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;
export { invoke, open, ask, listen };
