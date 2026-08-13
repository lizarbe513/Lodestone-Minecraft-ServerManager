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
  let data = null;
  const targetUrl = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";

  try {
    const res = await fetch(targetUrl);
    if (res.ok) data = await res.json();
  } catch (e) {
    console.warn("Direct Forge fetch failed (likely CORS)", e);
  }

  const defaultPromos = {
    "1.21.4-recommended": "54.1.14",
    "1.21.3-recommended": "53.1.0",
    "1.21.1-recommended": "52.1.0",
    "1.21-latest": "51.0.33",
    "1.20.6-recommended": "50.2.0",
    "1.20.4-recommended": "49.2.0",
    "1.20.3-latest": "49.0.2",
    "1.20.2-recommended": "48.1.0",
    "1.20.1-recommended": "47.4.10",
    "1.20-latest": "46.0.14",
    "1.19.4-recommended": "45.4.0",
    "1.19.3-recommended": "44.1.0",
    "1.19.2-recommended": "43.5.0",
    "1.19.1-latest": "42.0.9",
    "1.19-recommended": "41.1.0",
    "1.18.2-recommended": "40.3.0",
    "1.18.1-recommended": "39.1.0",
    "1.17.1-recommended": "37.1.1",
    "1.16.5-recommended": "36.2.34",
    "1.16.4-recommended": "35.1.4",
    "1.16.3-recommended": "34.1.0",
    "1.15.2-recommended": "31.2.57",
    "1.14.4-recommended": "28.2.26",
    "1.12.2-recommended": "14.23.5.2859",
    "1.12.1-recommended": "14.22.1.2478",
    "1.12-recommended": "14.21.1.2387",
    "1.11.2-recommended": "13.20.1.2588",
    "1.10.2-recommended": "12.18.3.2511",
    "1.9.4-recommended": "12.17.0.2317",
    "1.8.9-recommended": "11.15.1.2318",
    "1.7.10-recommended": "10.13.4.1614"
  };

  const versionsMap = new Map();
  const promos = (data && data.promos && Object.keys(data.promos).length > 0) ? data.promos : defaultPromos;

  for (const key of Object.keys(promos)) {
    if (key.endsWith("-latest")) {
      const mcVersion = key.replace("-latest", "");
      versionsMap.set(mcVersion, promos[key]);
    }
  }

  for (const key of Object.keys(promos)) {
    if (key.endsWith("-recommended")) {
      const mcVersion = key.replace("-recommended", "");
      versionsMap.set(mcVersion, promos[key]);
    }
  }

  const versions = [];
  for (const [mcVersion, forgeVersion] of versionsMap.entries()) {
    versions.push({ mcVersion, forgeVersion });
  }

  return versions.reverse();
}

export async function getForgeDownloadUrl(mcVersion, forgeVersion) {
  let mc = mcVersion ? mcVersion.trim() : "";
  let forge = forgeVersion ? forgeVersion.trim() : "";

  if (forge.includes("|")) {
    const parts = forge.split("|");
    mc = parts[0];
    forge = parts[1];
  }

  if (mc && forge.startsWith(`${mc}-`)) {
    forge = forge.substring(mc.length + 1);
  }

  if (!mc && forge.includes("-")) {
    const dashIdx = forge.indexOf("-");
    mc = forge.substring(0, dashIdx);
    forge = forge.substring(dashIdx + 1);
  }

  const primaryUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${forge}/forge-${mc}-${forge}-installer.jar`;
  const fallbackUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${forge}-${mc}/forge-${mc}-${forge}-${mc}-installer.jar`;
  return `${primaryUrl},${fallbackUrl}`;
}

export async function getNeoForgeDownloadUrl(neoVersion) {
  let ver = neoVersion ? neoVersion.trim() : "";
  if (ver.includes("|")) {
    ver = ver.split("|")[1] || ver.split("|")[0];
  }
  if (ver.startsWith("neoforge-")) {
    ver = ver.substring(9);
  }
  return `https://maven.neoforged.net/releases/net/neoforged/neoforge/${ver}/neoforge-${ver}-installer.jar`;
}

export async function fetchNeoForgeVersions() {
  const res = await fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge");
  const data = await res.json();
  const versions = data.versions || [];

  const mapped = versions.map(v => {
    let clean = v.replace(/-(alpha|beta).*/, "");
    let parts = clean.split(".");
    let mc = "";
    if (parts[0] === "47" && parts[1] === "1") mc = "1.20.1";
    else if (parts[0] === "20") {
      mc = "1.20." + (parts[1] || "0");
    } else if (parts[0] === "21") {
      if (!parts[1] || parts[1] === "0") mc = "1.21";
      else mc = "1.21." + parts[1];
    } else if (parts[0] === "26") {
      mc = "1.26." + (parts[1] || "0");
    } else {
      mc = "1." + parts[0];
    }
    return { mcVersion: mc, neoVersion: v };
  });

  const unique = [];
  const seen = new Set();
  for (let i = mapped.length - 1; i >= 0; i--) {
    if (!seen.has(mapped[i].mcVersion)) {
      seen.add(mapped[i].mcVersion);
      unique.push(mapped[i]);
    }
  }
  return unique;
}

// Wrapper utility para invocar a tauri (opcional usar directamente invoke)
const { open, ask } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;
export { invoke, open, ask, listen };
