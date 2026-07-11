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

// Wrapper utility para invocar a tauri (opcional usar directamente invoke)
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;
export { invoke, open, listen };
