// Load the control catalogue: src/kit/spec.json (version, base controls, transitions)
// merged with every src/controls/*.spec.json group file (sorted by name).
// Shared by render.mjs and pack-template.mjs so the page, validator and schema agree.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadSpec(srcRoot) {
  const spec = JSON.parse(fs.readFileSync(path.join(srcRoot, 'kit', 'spec.json'), 'utf8'));
  const dir = path.join(srcRoot, 'controls');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.spec.json')).sort()) {
    const group = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [id, c] of Object.entries(group.controls || {})) {
      if (spec.controls[id]) throw Error(`控件 ${id} 在 ${f} 中重复定义`);
      spec.controls[id] = { ...c, group: f.replace(/\.spec\.json$/, '') };
    }
  }
  spec.transitions = spec.transitions || ['cut', 'flash', 'wipe', 'blur'];
  spec.icons = loadIcons(srcRoot);
  return spec;
}

/* 图标名单来自 src/kit/icons.js 本身（页面用同一份），不另存副本 */
export function loadIcons(srcRoot) {
  const file = path.join(srcRoot, 'kit', 'icons.js');
  if (!fs.existsSync(file)) return [];
  const window = { MK: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window, MK: window.MK });
  return Object.keys(window.MK.ICONS || {});
}

export const layerOf = c => c.layer || 'segment';
