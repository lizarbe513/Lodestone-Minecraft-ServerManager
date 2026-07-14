import { globals, PROPERTY_GROUPS, EXCLUDED_PROPERTIES } from "./state.js";
import { els } from "./dom.js";

export function parsePropertiesContent(content) {
  globals.rawPropertiesLines = content.split('\n');
  globals.parsedProperties = {};

  for (let i = 0; i < globals.rawPropertiesLines.length; i++) {
    const line = globals.rawPropertiesLines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const key = line.substring(0, eqIdx).trim();
      const val = line.substring(eqIdx + 1).trim();
      globals.parsedProperties[key] = { value: val, lineIndex: i };
    }
  }
}

export function buildPropertiesPayload() {
  const newLines = [...globals.rawPropertiesLines];

  for (const key of Object.keys(globals.parsedProperties)) {
    const prop = globals.parsedProperties[key];
    const newLine = `${key}=${prop.value}`;
    if (prop.lineIndex !== -1) {
      newLines[prop.lineIndex] = newLine;
    } else {
      newLines.push(newLine);
    }
  }

  return newLines.join('\n');
}

export function renderPropertiesUI() {
  if (!els.propContainerGame || !els.propContainerServer) return;
  els.propContainerGame.innerHTML = '';
  els.propContainerServer.innerHTML = '';

  const groupsToRender = Object.assign({}, PROPERTY_GROUPS);
  const renderedKeys = new Set();
  
  const gameGroups = ["Mundo y Generación", "Reglas del Juego", "Generación de Entidades", "Mundo (Avanzado)", "Paquetes de Recursos"];

  for (const [groupName, keys] of Object.entries(groupsToRender)) {
    const validKeys = keys.filter(k => !EXCLUDED_PROPERTIES.includes(k));
    if (validKeys.length === 0) continue;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginBottom = '0';

    const heading = document.createElement('h3');
    heading.textContent = groupName;
    heading.style.marginTop = '0';
    panel.appendChild(heading);

    const formGrid = document.createElement('div');
    formGrid.className = 'grid-form';
    panel.appendChild(formGrid);

    let hasFields = false;
    for (const key of validKeys) {
      const val = globals.parsedProperties[key] ? globals.parsedProperties[key].value : "";
      const field = createPropertyField(key, val);
      if (field) {
        formGrid.appendChild(field);
        hasFields = true;
      }
      renderedKeys.add(key);
    }

    if (hasFields) {
      if (gameGroups.includes(groupName)) {
        els.propContainerGame.appendChild(panel);
      } else {
        els.propContainerServer.appendChild(panel);
      }
    }
  }

  const otherKeys = Object.keys(globals.parsedProperties).filter(k => !EXCLUDED_PROPERTIES.includes(k) && !renderedKeys.has(k));
  if (otherKeys.length > 0) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.marginBottom = '0';
    const heading = document.createElement('h3');
    heading.textContent = 'Otras configuraciones';
    heading.style.marginTop = '0';
    panel.appendChild(heading);

    const formGrid = document.createElement('div');
    formGrid.className = 'grid-form';
    panel.appendChild(formGrid);

    for (const key of otherKeys) {
      const val = globals.parsedProperties[key].value;
      const field = createPropertyField(key, val);
      if (field) {
        formGrid.appendChild(field);
      }
    }
    els.propContainerServer.appendChild(panel);
  }
}

export function createPropertyField(key, initialValue) {
  const container = document.createElement('div');
  container.className = 'field-group';

  const label = document.createElement('label');
  label.textContent = key;

  if (initialValue === 'true' || initialValue === 'false' || key === 'hardcore' || key === 'pvp' || key === 'allow-flight' || key === 'allow-nether' || key === 'spawn-monsters' || key === 'spawn-animals' || key === 'spawn-npcs' || key === 'enforce-whitelist' || key === 'online-mode' || key === 'hide-online-players' || key === 'enable-command-block' || key === 'enable-rcon' || key === 'enable-query' || key === 'sync-chunk-writes' || key === 'enable-status' || key === 'generate-structures' || key === 'require-resource-pack' || key === 'management-server-enabled' || key === 'management-server-tls-enabled') {
    container.className = 'switch-label-wrapper';
    const wrapperLabel = document.createElement('label');
    wrapperLabel.textContent = key;

    const labelSwitch = document.createElement('label');
    labelSwitch.className = 'switch';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = initialValue === 'true';
    checkbox.addEventListener('change', () => {
      if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
      globals.parsedProperties[key].value = checkbox.checked ? 'true' : 'false';
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    labelSwitch.appendChild(checkbox);
    labelSwitch.appendChild(slider);

    container.appendChild(wrapperLabel);
    container.appendChild(labelSwitch);
    return container;
  }

  if (key === 'difficulty') {
    const select = document.createElement('select');
    ['peaceful', 'easy', 'normal', 'hard'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (initialValue === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
      globals.parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }

  if (key === 'gamemode') {
    const select = document.createElement('select');
    ['survival', 'creative', 'adventure', 'spectator'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (initialValue === opt) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
      globals.parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }

  if (key === 'function-permission-level' || key === 'op-permission-level') {
    const select = document.createElement('select');
    const levels = [
      { val: '1', text: 'Moderador (=1)' },
      { val: '2', text: 'Default (=2)' },
      { val: '3', text: 'Administrador (=3)' },
      { val: '4', text: 'Dueño (=4)' }
    ];
    levels.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.val;
      o.textContent = opt.text;
      if (initialValue === opt.val) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
      globals.parsedProperties[key].value = select.value;
    });
    container.appendChild(label);
    container.appendChild(select);
    return container;
  }

  if (key === 'entity-broadcast-range-percentage') {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '10';
    input.value = initialValue || '100';
    input.addEventListener('input', () => {
      if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
      globals.parsedProperties[key].value = input.value;
    });
    container.appendChild(label);
    container.appendChild(input);
    return container;
  }

  const isNumber = !isNaN(Number(initialValue)) && initialValue !== "";
  const input = document.createElement('input');
  input.type = isNumber && key !== 'motd' && key !== 'server-ip' ? 'number' : 'text';
  input.value = initialValue;
  input.addEventListener('input', () => {
    if (!globals.parsedProperties[key]) globals.parsedProperties[key] = { value: "", lineIndex: -1 };
    globals.parsedProperties[key].value = input.value;
  });
  container.appendChild(label);
  container.appendChild(input);
  return container;
}
