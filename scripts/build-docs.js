/**
 * Génère `docs/index.html` — la documentation visuelle.
 *
 * La doc est ENTIÈREMENT dérivée des fichiers de tokens : palettes, mapping brand,
 * contrat de rôle et chaînes de résolution sont lus à la source. Elle ne peut donc
 * pas dériver du code. Et elle est stylée AVEC les tokens qu'elle documente — si le
 * design system casse, la page casse avec, visiblement.
 *
 *   node scripts/build-docs.js
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { hexToOklch } from './oklch.js';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const colors = read('tokens/primitives/color.json').color;
const sizes = read('tokens/primitives/size.json').size;
const brand = read('tokens/brand/default.json').color.brand;
const light = read('tokens/themes/color/light.json').color;
const dark = read('tokens/themes/color/dark.json').color;
const sizeDesktop = read('tokens/themes/size/desktop.json');
const sizeMobile = read('tokens/themes/size/mobile.json');
const typography = read('tokens/themes/typography/default.json').typography;
const button = read('tokens/components/button.json');
const input = read('tokens/components/input.json');
const tokensCss = readFileSync('dist/tokens.css', 'utf8');

/* ---------- résolution des références ---------- */

const isToken = (n) => n && typeof n === 'object' && '$value' in n;

/** Aplatit un arbre DTCG en Map<'a.b.c', valeur brute>. Ignore $type / $description. */
function flatten(obj, prefix = [], out = new Map()) {
  for (const [key, node] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    if (isToken(node)) out.set([...prefix, key].join('.'), node.$value);
    else if (node && typeof node === 'object') flatten(node, [...prefix, key], out);
  }
  return out;
}

// Dictionnaire global (light + desktop), pour dérouler les chaînes de résolution.
const DICT = new Map();
for (const file of [
  'tokens/primitives/color.json', 'tokens/primitives/size.json', 'tokens/primitives/typography.json',
  'tokens/brand/default.json', 'tokens/themes/color/light.json',
  'tokens/themes/typography/default.json', 'tokens/themes/size/desktop.json',
  'tokens/components/button.json', 'tokens/components/input.json',
]) {
  for (const [k, v] of flatten(read(file))) DICT.set(k, v);
}

/** Déroule `a.b.c` jusqu'à la valeur brute. Retourne la chaîne complète. */
function chain(path) {
  const steps = [];
  let cur = path;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const value = DICT.get(cur);
    if (value === undefined) break;
    steps.push({ path: cur, value });
    const ref = /^\{(.+)\}$/.exec(String(value));
    cur = ref ? ref[1] : null;
  }
  return steps;
}

const resolve = (path) => {
  const steps = chain(path);
  return steps.length ? steps[steps.length - 1].value : null;
};

/** `color.role.primary.main` → `--color-role-primary-main` */
const cssVar = (path) =>
  '--' + path.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/\./g, '-').toLowerCase();

/* ---------- vocabulaire ---------- */

const PALETTES = Object.entries(colors)
  .filter(([k, v]) => !k.startsWith('$') && !isToken(v))
  .map(([k]) => k);
const STEPS = Object.keys(colors[PALETTES[0]]).filter((k) => k !== 'alpha' && !k.startsWith('$'));
const ALPHAS = Object.keys(colors[PALETTES[0]].alpha);

const ROLES = Object.keys(light.role);
const SLOTS = Object.keys(light.role[ROLES[0]]);
const CATEGORICAL = Object.keys(light.categorical);

/** Quelle palette joue ce rôle ? (lu depuis la référence du cran 500 de la couche brand) */
const roleSource = (role) => /^\{color\.([^.]+)\./.exec(brand[role]['500'].$value)?.[1] ?? '?';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- sections ---------- */

function sectionArchitecture() {
  return `
<section id="architecture">
  <h2>L'architecture en 4 couches</h2>
  <div class="layers">
    <div class="lyr"><span class="layer-num">1</span><b>Primitives</b><em>le catalogue</em><small>#9500ee</small></div>
    <div class="lyr-arrow">→</div>
    <div class="lyr lyr-key"><span class="layer-num">2</span><b>Brand</b><em>le projet choisit</em><small>primary → violet<br>neutral → slateBlue</small></div>
    <div class="lyr-arrow">→</div>
    <div class="lyr lyr-key"><span class="layer-num">3</span><b>Sémantique</b><em>le contrat de rôle</em><small>role.danger.main<br>light / dark</small></div>
    <div class="lyr-arrow">→</div>
    <div class="lyr"><span class="layer-num">4</span><b>Composant</b><em>l'usage</em><small>button.outlined<br>.danger.hover</small></div>
  </div>
  <div class="callout callout-key">
    <strong>Les deux couches du milieu portent tout le système.</strong>
    <em>Brand</em> rend un projet rebrandable en éditant un seul fichier.
    <em>Sémantique</em> impose un contrat uniforme : les 6 rôles exposent les mêmes 9 slots,
    mappés sur les mêmes crans — c'est ce qui rend <code>&lt;Button color="danger"&gt;</code>
    aussi lisible que <code>&lt;Button color="primary"&gt;</code>, sans le vérifier à la main.
  </div>
</section>`;
}

function sectionQuickstart() {
  const roleList = ROLES.map((r) => `<code>${r}</code>&nbsp;→&nbsp;<code>${roleSource(r)}</code>`).join(' · ');
  return `
<section id="quickstart">
  <h2>Démarrer un projet</h2>
  <ol class="steps">
    <li>
      <h4>Installer et builder</h4>
      <pre><code>npm install
npm run build   <span class="c"># dist/tokens.css + dist/tokens.json + docs/</span></code></pre>
    </li>
    <li>
      <h4>Choisir l'identité du projet</h4>
      <p>Éditer la table <code>BRAND</code> dans <code>scripts/generate-theme.js</code>, puis
      <code>npm run theme</code>. C'est <strong>le seul endroit</strong> à toucher.</p>
      <pre><code>const BRAND = {
  primary: '<b>violet</b>',      <span class="c">// ← change ça…</span>
  neutral: 'slateBlue',
  success: 'green', warning: 'orange', danger: 'red', info: 'blue',
};</code></pre>
      <p class="note">Sélection actuelle : ${roleList}</p>
    </li>
    <li>
      <h4>Consommer les tokens</h4>
      <pre><code>@import '@fred/design-tokens/dist/tokens.css';

<span class="c">/* Un bouton, n'importe quelle couleur de rôle */</span>
.btn-filled {
  background: var(--color-button-filled-<b>primary</b>-default-background);
  color:      var(--color-button-filled-<b>primary</b>-default-text);
}
.btn-filled[data-color="danger"] {
  background: var(--color-button-filled-<b>danger</b>-default-background);
}</code></pre>
    </li>
    <li>
      <h4>Activer le thème sombre</h4>
      <pre><code>&lt;html data-theme="dark"&gt;</code></pre>
      <p class="note">Le responsive est automatique (media query à ${sizes.breakpoint.md.$value}).</p>
    </li>
  </ol>
</section>`;
}

function sectionPrimitives() {
  const rows = PALETTES.map((name) => {
    const swatches = STEPS.map((step) => {
      const hex = colors[name][step].$value;
      const L = hexToOklch(hex)[0] * 100;
      return `<div class="sw" style="background:${hex}" title="${name}.${step} — ${hex} — L*${L.toFixed(0)}%">
        <span class="sw-step" style="color:${L > 60 ? '#000' : '#fff'}">${step}</span>
      </div>`;
    }).join('');
    const alphas = ALPHAS.map((a) => {
      const rgba = colors[name].alpha[a].$value;
      return `<div class="sw sw-alpha" style="background:${rgba}" title="${name}.alpha.${a} — ${rgba}">
        <span class="sw-step">${a}%</span></div>`;
    }).join('');
    return `<div class="ramp">
      <div class="ramp-name">${name}</div>
      <div class="ramp-swatches">${swatches}</div>
      <div class="ramp-alphas">${alphas}</div>
    </div>`;
  }).join('');

  return `
<section id="primitives">
  <h2><span class="layer-num">1</span> Primitives — le catalogue</h2>
  <p>Palette brute, aucune sémantique. <strong>Jamais modifiée par projet.</strong></p>
  <div class="callout callout-warn">
    <strong>Fichier généré</strong> par <code>npm run ramps:write</code> — ne l'édite pas à la main.
    Chaque palette est définie par une <em>teinte</em> + un <em>pic de chroma</em>, et ses 11 crans
    sont calculés en OKLCH sur une <strong>courbe de luminosité commune à toutes les palettes</strong>.
    À cran égal, deux palettes ont la même luminosité perçue — c'est ce qui permet au contrat de
    rôle de garantir le contraste quelle que soit la palette choisie.
  </div>
  <div class="ramps">
    <div class="ramp ramp-head">
      <div></div>
      <div class="ramp-swatches">${STEPS.map((s) => `<span class="hd">${s}</span>`).join('')}</div>
      <div class="ramp-alphas">${ALPHAS.map((a) => `<span class="hd">α${a}</span>`).join('')}</div>
    </div>
    ${rows}
  </div>
  <p class="note">Survole un aplat pour son hex et sa luminosité perçue (L*). Les colonnes α sont
  les voiles translucides (5 % / 10 %), affichés sur damier. Ils vivent <strong>dans</strong> la
  palette : un swap de rôle les emporte avec lui.</p>
</section>`;
}

function sectionBrand() {
  const rows = ROLES.map((role) => {
    const palette = roleSource(role);
    const strip = STEPS.map((s) => `<i style="background:${resolve(`color.brand.${role}.${s}`)}"></i>`).join('');
    return `<div class="brand-row">
      <div class="brand-role">${role}</div>
      <div class="brand-arrow">→</div>
      <div class="brand-palette">${palette}</div>
      <div class="brand-strip">${strip}</div>
    </div>`;
  }).join('');

  const cats = CATEGORICAL.map(
    (n) => `<div class="cat"><i style="background:${resolve(`color.brand.categorical.${n}.main`)}"></i><span>${n}</span></div>`,
  ).join('');

  return `
<section id="brand">
  <h2><span class="layer-num">2</span> Brand — la sélection du projet</h2>
  <p>Quelle palette du catalogue joue quel rôle. <strong>Un seul endroit à éditer pour rebrander.</strong></p>
  <div class="brand-table">${rows}</div>

  <h3>Couleurs catégorielles</h3>
  <p class="note">Teintes distinguables pour graphiques, avatars et tags. Elles ne suivent pas le
  contrat de rôle (seulement <code>main</code> + <code>tint</code>) — ce ne sont pas des rôles
  sémantiques, juste des couleurs qu'on doit pouvoir différencier.</p>
  <div class="cats">${cats}</div>
</section>`;
}

function sectionContract() {
  const head = SLOTS.map((s) => `<th>${s}</th>`).join('');
  const rows = ROLES.map((role) => {
    const cells = SLOTS.map((slot) => {
      const path = `color.role.${role}.${slot}`;
      return `<td><div class="slot ${/tint/.test(slot) ? 'sw-alpha' : ''}" style="background:var(${cssVar(path)})"
        title="${path}"></div></td>`;
    }).join('');
    return `<tr><th class="rh">${role}</th>${cells}</tr>`;
  }).join('');

  const slotDocs = SLOTS.map(
    (s) => `<li><code>${s}</code> — ${esc(light.role.primary[s].$description ?? '')}</li>`,
  ).join('');

  return `
<section id="contract">
  <h2><span class="layer-num">3</span> Le contrat de rôle</h2>
  <p><strong>C'est la pièce maîtresse.</strong> Les ${ROLES.length} rôles exposent
  <strong>exactement les mêmes ${SLOTS.length} slots</strong>, mappés sur
  <strong>exactement les mêmes crans</strong>. Un composant qui sait afficher
  <code>primary</code> sait afficher <code>danger</code> — sans un token de plus.</p>

  <div class="scroll-x">
    <table class="tbl contract">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <ul class="slot-docs">${slotDocs}</ul>

  <div class="callout callout-key">
    <strong>Pourquoi l'uniformité garantit le contraste.</strong> Toutes les palettes sont sur la
    même courbe de luminosité (couche 1). Donc si <code>main</code> = cran 600 et <code>on</code> =
    <code>neutral.25</code> passe AA pour <em>un</em> rôle, ça passe AA pour <em>les six</em>.
    Mesuré : <code>on</code>/<code>main</code> va de 4,56:1 à 5,74:1 en clair, et de 5,72:1 à
    6,66:1 en sombre. <strong>Les 6 rôles passent AA, avec le même mapping.</strong>
  </div>
  <div class="callout callout-warn">
    <strong>Un nom de rôle ne décrit jamais une apparence.</strong> Pas de <code>dark</code> ni
    <code>darker</code> pour dire « survol » et « pressé » : en thème sombre, le survol doit être
    <em>plus clair</em>, et le nom deviendrait un mensonge. D'où <code>hover</code> et
    <code>active</code> — des rôles, pas des couleurs.
  </div>
</section>`;
}

function sectionSemantic() {
  const groups = ['surface', 'text', 'border']
    .map((group) => {
      const items = Object.keys(light[group])
        .filter((k) => !k.startsWith('$'))
        .map((name) => {
          const path = `color.${group}.${name}`;
          return `<div class="role">
            <div class="role-chip ${/transparent/.test(name) ? 'sw-alpha' : ''}" style="background:var(${cssVar(path)})"></div>
            <div class="role-name">${name}</div>
            <code class="role-var">${esc(light[group][name].$description ?? '')}</code>
          </div>`;
        })
        .join('');
      return `<div class="role-group"><h4>${group}</h4><div class="role-list">${items}</div></div>`;
    })
    .join('');

  const sizeRows = ['space', 'radius', 'borderWidth', 'fontSize']
    .flatMap((group) =>
      Object.keys(sizeDesktop[group])
        .filter((k) => !k.startsWith('$'))
        .map((role) => {
          const d = resolve(`${group}.${role}`);
          const mRef = /^\{(.+)\}$/.exec(String(sizeMobile[group][role].$value))?.[1];
          const m = mRef ? resolve(mRef) : sizeMobile[group][role].$value;
          const changed = d !== m;
          return `<tr class="${changed ? 'changed' : ''}">
            <td><code>${group}.${role}</code></td><td class="mono">${d}</td>
            <td class="mono">${m}${changed ? ' <span class="tag">≠</span>' : ''}</td></tr>`;
        }),
    )
    .join('');

  const typoRows = Object.keys(typography)
    .map((role) => {
      const family = resolve(`typography.${role}.family`);
      const weight = resolve(`typography.${role}.weight`);
      const lh = resolve(`typography.${role}.lineHeight`);
      return `<tr><td><code>typography.${role}</code></td>
        <td style="font-family:${family};font-weight:${weight}">Le vif renard brun saute</td>
        <td class="mono">${weight} / ${lh}</td></tr>`;
    })
    .join('');

  return `
<section id="semantic">
  <h2>Le reste de la couche sémantique</h2>
  <p><code>surface</code> est le <strong>seul</strong> groupe qui parle de fonds. Le voile alpha des
  rôles s'appelle <code>tint</code>, jamais <code>surface</code> — un mot, un sens.</p>
  <div class="roles">${groups}</div>

  <h3>Focus &amp; scrim</h3>
  <div class="roles">
    <div class="role-group"><div class="role-list">
      <div class="role"><div class="role-chip" style="background:var(--color-focus-ring)"></div>
        <div class="role-name">focus.ring</div>
        <code class="role-var">${esc(light.focus.ring.$description)}</code></div>
      <div class="role"><div class="role-chip sw-alpha" style="background:var(--color-scrim)"></div>
        <div class="role-name">scrim</div>
        <code class="role-var">${esc(light.scrim.$description)}</code></div>
    </div></div>
  </div>

  <h3>Tailles — desktop vs mobile</h3>
  <p class="note">Seules les lignes <span class="tag">≠</span> sont réémises dans la media query.</p>
  <table class="tbl">
    <thead><tr><th>Rôle</th><th>Desktop</th><th>Mobile (&lt; ${sizes.breakpoint.md.$value})</th></tr></thead>
    <tbody>${sizeRows}</tbody>
  </table>

  <h3>Typographie</h3>
  <table class="tbl">
    <thead><tr><th>Rôle</th><th>Aperçu</th><th>Graisse / interligne</th></tr></thead>
    <tbody>${typoRows}</tbody>
  </table>
</section>`;
}

function renderChain(path) {
  const layerOf = (p) =>
    p.startsWith('color.brand.') ? 'brand'
      : /^color\.(button|input)\./.test(p) ? 'component'
        : /^color\.(role|surface|text|border|focus|scrim|categorical)/.test(p) ? 'semantic'
          : 'primitive';

  const items = chain(path)
    .map((s, i, arr) => {
      const isLast = i === arr.length - 1;
      return `<li class="chain-step chain-${layerOf(s.path)}">
        <span class="chain-layer">${layerOf(s.path)}</span>
        <code>${s.path}</code>
        ${isLast ? `<span class="chain-final"><i class="sw-alpha" style="background:${s.value}"></i>${s.value}</span>` : ''}
      </li>`;
    })
    .join('');
  return `<ol class="chain">${items}</ol>`;
}

function sectionComponents() {
  const VARIANTS = Object.keys(button.color.button);
  const STATES = Object.keys(button.color.button[VARIANTS[0]][ROLES[0]]);

  const grids = VARIANTS.map((variant) => {
    const rows = ROLES.map((role) => {
      const btns = STATES.map((state) => {
        const v = (p) => `var(${cssVar(`color.button.${variant}.${role}.${state}.${p}`)})`;
        return `<td><button class="demo-btn" style="
          background:${v('background')}; color:${v('text')};
          border: var(--border-width-button) solid ${v('border')};
          border-radius: var(--radius-button);
          padding: var(--space-button-padding-y) var(--space-button-padding-x);
          font-size: var(--font-size-button);
          font-family: var(--typography-button-family);
          font-weight: var(--typography-button-weight);
        ">Button CTA</button></td>`;
      }).join('');
      return `<tr><th class="rh">${role}</th>${btns}</tr>`;
    }).join('');
    return `
      <h4 class="variant-title">${variant}</h4>
      <div class="scroll-x">
        <table class="tbl btn-grid ${variant !== 'filled' ? 'checker' : ''}">
          <thead><tr><th></th>${STATES.map((s) => `<th>${s}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  const inputStates = Object.keys(input.color.input);
  const inputs = inputStates
    .map((state) => {
      const v = (p) => `var(${cssVar(`color.input.${state}.${p}`)})`;
      const bw = state === 'focus' ? 'focus' : 'default';
      return `<div class="demo-item">
      <input class="demo-input" value="Saisie" readonly style="
        background:${v('background')}; color:${v('text')};
        border: var(--border-width-input-${bw}) solid ${v('border')};
        border-radius: var(--radius-input);
        padding: var(--space-input-padding-y) var(--space-input-padding-x);
        font-size: var(--font-size-input);
        font-family: var(--typography-input-family);">
      <span class="demo-label">${state}</span></div>`;
    })
    .join('');

  return `
<section id="components">
  <h2><span class="layer-num">4</span> Composants — l'usage</h2>
  <p>Rendus <strong>uniquement avec les variables CSS générées</strong>, aucune valeur en dur.
  ${VARIANTS.length} variantes × ${ROLES.length} rôles × ${STATES.length} états — et
  <strong>zéro token écrit à la main</strong> : la variante déclare quels slots du rôle elle
  consomme, le reste est mécanique.</p>
  ${grids}

  <h3>Input</h3>
  <div class="demo">${inputs}</div>

  <h3>La chaîne de résolution</h3>
  <p>Un token de composant ne connaît ni les palettes ni les hex : il ne connaît qu'un rôle.
  Chaque flèche traverse une couche.</p>
  ${renderChain('color.button.filled.primary.default.background')}
  ${renderChain('color.button.outlined.danger.hover.background')}
  <div class="callout">
    <strong>Les 3 règles, mécaniquement vérifiables.</strong>
    Un composant référence un rôle sémantique, jamais plus bas.
    Un rôle sémantique de couleur référence la couche <em>brand</em>, jamais un primitive.
    Un token <em>brand</em> référence un primitive, jamais une valeur brute.
  </div>
</section>`;
}

/* ---------- page ---------- */

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>@fred/design-tokens — documentation</title>
<style>
${tokensCss}
</style>
<style>
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; background: var(--color-surface-base); color: var(--color-text-body);
  font-family: var(--typography-body-family); font-size: var(--font-size-body);
  line-height: var(--typography-body-line-height);
}
.wrap { max-width: 1140px; margin: 0 auto; padding: var(--space-xl); }
h1,h2,h3,h4 { font-family: var(--typography-heading-family); font-weight: var(--typography-heading-weight); line-height: var(--typography-heading-line-height); }
h1 { font-size: var(--font-size-h1); margin: 0 0 var(--space-sm); }
h2 { font-size: var(--font-size-h2); margin: 0 0 var(--space-md); display: flex; align-items: center; gap: var(--space-sm); }
h3 { font-size: var(--font-size-h3); margin: var(--space-xl) 0 var(--space-sm); }
h4 { font-size: var(--font-size-body); margin: 0 0 var(--space-xs); }
p { margin: 0 0 var(--space-md); }
code { font-family: var(--typography-code-family); font-size: 0.875em; background: var(--color-surface-raised); padding: 0.1em 0.35em; border-radius: var(--radius-sm); }
pre { background: var(--color-surface-raised); border: var(--border-width-default) solid var(--color-border-default); border-radius: var(--radius-md); padding: var(--space-md); overflow-x: auto; }
pre code { background: none; padding: 0; font-size: 0.8125rem; line-height: 1.6; }
pre .c { color: var(--color-text-muted); }
.note { color: var(--color-text-muted); font-size: var(--font-size-small); }
.mono { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.scroll-x { overflow-x: auto; }

/* Damier : rend visible la transparence. */
.checker, .sw-alpha, .demo-checker {
  background-image:
    linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%),
    linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%);
  background-size: 12px 12px; background-position: 0 0, 6px 6px;
}
.sw-alpha { background-size: 8px 8px; background-position: 0 0, 4px 4px; }

header.top { border-bottom: var(--border-width-default) solid var(--color-border-default); position: sticky; top: 0; background: var(--color-surface-base); z-index: 10; }
.top-inner { max-width: 1140px; margin: 0 auto; padding: var(--space-sm) var(--space-xl); display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); }
.top-title { font-family: var(--typography-code-family); font-weight: 600; }
nav.toc { display: flex; gap: var(--space-md); flex-wrap: wrap; }
nav.toc a { color: var(--color-text-muted); text-decoration: none; font-size: var(--font-size-small); }
nav.toc a:hover { color: var(--color-role-primary-text); }
.theme-toggle { cursor: pointer; background: var(--color-role-primary-main); color: var(--color-role-primary-on); border: 0; border-radius: var(--radius-full); padding: var(--space-xs) var(--space-md); font-family: inherit; font-size: var(--font-size-small); font-weight: 600; white-space: nowrap; }
.theme-toggle:hover { background: var(--color-role-primary-hover); }

section { padding: var(--space-xl) 0; border-top: var(--border-width-default) solid var(--color-border-divider); }
section:first-of-type { border-top: 0; }
.layer-num { display: inline-grid; place-items: center; width: 1.6em; height: 1.6em; border-radius: var(--radius-full); background: var(--color-role-primary-main); color: var(--color-role-primary-on); font-size: 0.7em; flex: none; }

.callout { border-left: 4px solid var(--color-border-strong); background: var(--color-surface-raised); padding: var(--space-md); border-radius: var(--radius-md); margin: var(--space-md) 0; }
.callout-key { border-left-color: var(--color-role-primary-main); }
.callout-warn { border-left-color: var(--color-role-warning-main); }

.layers { display: flex; gap: var(--space-xs); flex-wrap: wrap; margin-bottom: var(--space-md); }
.lyr { flex: 1 1 170px; border: var(--border-width-default) solid var(--color-border-default); border-radius: var(--radius-md); padding: var(--space-md); background: var(--color-surface-raised); }
.lyr b { display: block; margin-top: var(--space-xs); }
.lyr em { display: block; color: var(--color-text-muted); font-size: var(--font-size-small); font-style: normal; }
.lyr small { display: block; margin-top: var(--space-sm); font-family: var(--typography-code-family); font-size: 0.75rem; color: var(--color-text-muted); }
.lyr-key { border-color: var(--color-role-primary-main); border-width: var(--border-width-strong); }
.lyr-arrow { display: grid; place-items: center; color: var(--color-text-muted); }

.ramps { display: grid; gap: var(--space-xs); }
.ramp { display: grid; grid-template-columns: 90px 1fr 110px; align-items: center; gap: var(--space-sm); }
.ramp-head .hd { font-size: 0.625rem; font-family: var(--typography-code-family); color: var(--color-text-muted); text-align: center; }
.ramp-name { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.ramp-swatches { display: grid; grid-template-columns: repeat(11, 1fr); gap: 2px; }
.ramp-alphas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; }
.sw { aspect-ratio: 1.6; border-radius: var(--radius-sm); display: grid; place-items: center; cursor: help; }
.sw-alpha { border: var(--border-width-default) solid var(--color-border-default); }
.sw-alpha .sw-step { color: var(--color-text-muted); }
.sw-step { font-size: 0.625rem; font-family: var(--typography-code-family); opacity: .75; }

.brand-table { display: grid; gap: var(--space-xs); }
.brand-row { display: grid; grid-template-columns: 90px 20px 90px 1fr; align-items: center; gap: var(--space-sm); padding: var(--space-xs); border-radius: var(--radius-sm); }
.brand-row:hover { background: var(--color-role-primary-tint); }
.brand-role, .brand-palette { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.brand-palette { color: var(--color-role-primary-text); font-weight: 600; }
.brand-arrow { color: var(--color-text-muted); }
.brand-strip { display: flex; gap: 2px; }
.brand-strip i { flex: 1; height: 22px; border-radius: 2px; }
.cats { display: flex; gap: var(--space-md); flex-wrap: wrap; }
.cat { display: grid; justify-items: center; gap: 4px; }
.cat i { display: block; width: 48px; height: 48px; border-radius: var(--radius-md); }
.cat span { font-size: 0.6875rem; font-family: var(--typography-code-family); color: var(--color-text-muted); }

.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: var(--space-lg); }
.role-group h4 { color: var(--color-text-muted); text-transform: uppercase; font-size: 0.6875rem; letter-spacing: .06em; }
.role-list { display: grid; gap: var(--space-sm); }
.role { display: grid; grid-template-columns: 28px 1fr; column-gap: var(--space-sm); align-items: start; }
.role-chip { grid-row: 1 / 3; width: 28px; height: 28px; border-radius: var(--radius-sm); border: var(--border-width-default) solid var(--color-border-default); }
.role-name { font-size: var(--font-size-small); font-family: var(--typography-code-family); }
.role-var { background: none; padding: 0; font-size: 0.6875rem; color: var(--color-text-muted); font-family: var(--typography-body-family); }

.tbl { width: 100%; border-collapse: collapse; font-size: var(--font-size-small); }
.tbl th { text-align: left; padding: var(--space-xs) var(--space-sm); border-bottom: var(--border-width-strong) solid var(--color-border-default); color: var(--color-text-muted); font-weight: 600; font-size: 0.6875rem; font-family: var(--typography-code-family); }
.tbl td { padding: var(--space-xs) var(--space-sm); border-bottom: var(--border-width-default) solid var(--color-border-divider); }
.tbl tr.changed { background: var(--color-role-primary-tint); }
.tbl .rh { color: var(--color-text-body); font-size: var(--font-size-small); white-space: nowrap; }
.tag { display: inline-block; background: var(--color-role-primary-main); color: var(--color-role-primary-on); border-radius: var(--radius-sm); padding: 0 .35em; font-size: 0.6875rem; }

.contract td { padding: 3px; }
.slot { width: 100%; min-width: 54px; height: 32px; border-radius: var(--radius-sm); border: var(--border-width-default) solid var(--color-border-divider); }
.slot-docs { list-style: none; padding: 0; display: grid; gap: var(--space-xs); font-size: var(--font-size-small); color: var(--color-text-muted); margin: var(--space-md) 0; }
.slot-docs code { color: var(--color-text-body); }

.btn-grid td { padding: var(--space-xs); }
.variant-title { margin: var(--space-lg) 0 var(--space-sm); font-family: var(--typography-code-family); color: var(--color-text-muted); }
.demo { display: flex; flex-wrap: wrap; gap: var(--space-lg); align-items: flex-end; padding: var(--space-lg); background: var(--color-surface-raised); border-radius: var(--radius-md); border: var(--border-width-default) solid var(--color-border-default); }
.demo-item { display: grid; gap: var(--space-xs); justify-items: center; }
.demo-btn, .demo-input { cursor: default; white-space: nowrap; }
.demo-label { font-size: 0.6875rem; color: var(--color-text-muted); font-family: var(--typography-code-family); }

.chain { list-style: none; padding: 0; margin: 0 0 var(--space-md); display: grid; gap: 2px; }
.chain-step { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); background: var(--color-surface-raised); border-left: 4px solid var(--color-border-strong); }
.chain-step code { background: none; padding: 0; }
.chain-step + .chain-step { margin-left: var(--space-lg); }
.chain-layer { font-size: 0.625rem; text-transform: uppercase; letter-spacing: .06em; color: var(--color-text-muted); min-width: 72px; }
.chain-component { border-left-color: var(--color-role-primary-main); }
.chain-semantic  { border-left-color: var(--color-role-info-main); }
.chain-brand     { border-left-color: var(--color-role-warning-main); }
.chain-primitive { border-left-color: var(--color-role-success-main); }
.chain-final { margin-left: auto; display: flex; align-items: center; gap: var(--space-xs); font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.chain-final i { width: 16px; height: 16px; border-radius: 3px; }

.steps { padding-left: var(--space-lg); display: grid; gap: var(--space-lg); }
.steps > li::marker { color: var(--color-role-primary-main); font-weight: 700; }
footer { padding: var(--space-xl) 0; color: var(--color-text-muted); font-size: var(--font-size-small); border-top: var(--border-width-default) solid var(--color-border-default); }

@media (max-width: 768px) {
  .ramp { grid-template-columns: 1fr; }
  .lyr-arrow, nav.toc { display: none; }
}
</style>
</head>
<body>
<header class="top">
  <div class="top-inner">
    <span class="top-title">@fred/design-tokens</span>
    <nav class="toc">
      <a href="#architecture">Architecture</a>
      <a href="#quickstart">Démarrer</a>
      <a href="#primitives">1 · Primitives</a>
      <a href="#brand">2 · Brand</a>
      <a href="#contract">3 · Contrat de rôle</a>
      <a href="#components">4 · Composants</a>
    </nav>
    <button class="theme-toggle" id="toggle">◐ Thème</button>
  </div>
</header>

<div class="wrap">
  <section>
    <h1>Design tokens</h1>
    <p>Librairie de tokens agnostique de tout framework, au format
    <strong>DTCG</strong> (<code>$value</code> / <code>$type</code> / <code>$description</code>).
    Ce repo ne contient <strong>que les tokens</strong> — pas de composants UI.</p>
    <p class="note">Cette page est <strong>générée depuis les fichiers de tokens</strong> et
    <strong>stylée avec les tokens qu'elle documente</strong>. Elle ne peut pas dériver du code :
    si le système casse, la page casse avec.</p>
  </section>

  ${sectionArchitecture()}
  ${sectionQuickstart()}
  ${sectionPrimitives()}
  ${sectionBrand()}
  ${sectionContract()}
  ${sectionSemantic()}
  ${sectionComponents()}

  <footer>Généré par <code>scripts/build-docs.js</code> — ne pas éditer <code>docs/index.html</code>.</footer>
</div>

<script>
  const root = document.documentElement;
  const btn = document.getElementById('toggle');
  if (localStorage.getItem('theme') === 'dark') root.setAttribute('data-theme', 'dark');
  btn.addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    if (dark) { root.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); }
    else { root.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); }
  });
</script>
</body>
</html>
`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', html);
console.log('  ✔ docs/index.html');
