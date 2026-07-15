/**
 * Génère la documentation visuelle dans `docs/` — une page par couche, plus une
 * vue d'ensemble, avec une navigation latérale.
 *
 * La doc est ENTIÈREMENT dérivée des fichiers de tokens : palettes, mapping brand,
 * contrat de rôle et chaînes de résolution sont lus à la source. Elle ne peut donc
 * pas dériver du code. Et elle est stylée AVEC les tokens qu'elle documente — si le
 * design system casse, la page casse avec, visiblement.
 *
 *   node scripts/build-docs.js
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { hexToOklch } from './oklch.js';

const OUT = 'docs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const colors = read('tokens/primitives/color.json').color;
const sizes = read('tokens/primitives/size.json').size;
const fonts = read('tokens/primitives/typography.json').font;
const brand = read('tokens/brand/default.json').color.brand;
const fontBrand = read('tokens/brand/default.json').font.brand;
const light = read('tokens/themes/mode/light.json').color;
const sizeDesktop = read('tokens/themes/size/desktop.json');
const sizeMobile = read('tokens/themes/size/mobile.json');
const typography = read('tokens/themes/typography/default.json').typography;
const effects = read('tokens/primitives/effect.json');
const effectTheme = read('tokens/themes/effect/default.json');
const shadow = read('tokens/themes/mode/light.json').shadow;
import { readdirSync } from 'node:fs';
const COMP = Object.fromEntries(
  readdirSync('tokens/components')
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace('.json', ''), read(`tokens/components/${f}`)]),
);

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

const DICT = new Map();
for (const file of [
  'tokens/primitives/color.json', 'tokens/primitives/size.json', 'tokens/primitives/typography.json',
  'tokens/brand/default.json', 'tokens/themes/mode/light.json',
  'tokens/primitives/effect.json', 'tokens/themes/effect/default.json',
  'tokens/themes/typography/default.json', 'tokens/themes/size/desktop.json',
  ...readdirSync('tokens/components').map((f) => `tokens/components/${f}`),
]) {
  for (const [k, v] of flatten(read(file))) DICT.set(k, v);
}

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

// `alpha` est un groupe de voiles absolus, pas une rampe. `white`/`black`/`transparent`
// sont des tokens isolés.
const PALETTES = Object.entries(colors)
  .filter(([k, v]) => !k.startsWith('$') && !isToken(v) && k !== 'alpha')
  .map(([k]) => k);
const STEPS = Object.keys(colors[PALETTES[0]]).filter((k) => k !== 'alpha' && !k.startsWith('$'));
const ALPHAS = Object.keys(colors[PALETTES[0]].alpha);

// Réglages de la doc : le sélecteur de couleur « primary ». On expose chaque
// palette primitive comme choix ; le nom CSS (kebab) sert à remapper les vars
// `--color-brand-primary-*` à la volée. La primary par défaut est lue dans le
// brand (le reste de la chaîne — rôle, composants — suit sans qu'on y touche).
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const PRIMARY_OPTIONS = PALETTES.map((name) => ({ name, css: kebab(name) }));
const DEFAULT_PRIMARY = kebab(
  /\{color\.([A-Za-z]+)\./.exec(read('tokens/brand/default.json').color.brand.primary['500'].$value)?.[1] ?? 'violet',
);

// Même idée pour les polices : deux sélecteurs (titres / corps), chacun remappe
// une var brand — `--font-brand-heading` ou `--font-brand-body` — vers une pile du
// catalogue ; les rôles typo suivent. On offre TOUT le catalogue, mono comprises :
// le corps par défaut EST une mono, curer serait se contredire.
const pretty = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const FONT_OPTIONS = Object.keys(fonts.stack)
  .filter((k) => !k.startsWith('$'))
  .map((name) => ({ css: kebab(name), label: pretty(name) }));
const stackOf = (ref) => kebab(/\{font\.stack\.([A-Za-z]+)\}/.exec(String(ref))?.[1] ?? 'inter');
const DEFAULT_HEADING = stackOf(fontBrand.heading.$value);
const DEFAULT_BODY = stackOf(fontBrand.body.$value);
const ROLES = Object.keys(light.role);
const SLOTS = Object.keys(light.role[ROLES[0]]);
const CATEGORICAL = Object.keys(light.categorical);
const VARIANTS = Object.keys(COMP.button.color.button).filter((k) => !k.startsWith('$'));
const STATES = Object.keys(COMP.button.color.button[VARIANTS[0]][ROLES[0]]);

const roleSource = (role) => /^\{color\.([^.]+)\./.exec(brand[role]['500'].$value)?.[1] ?? '?';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- navigation ---------- */

const NAV = [
  {
    group: 'Comprendre',
    items: [
      { id: 'index', file: 'index.html', label: 'Architecture' },
      { id: 'start', file: 'demarrer.html', label: 'Démarrer un projet' },
    ],
  },
  {
    group: 'Le système',
    items: [
      { id: 'primitives', file: 'primitives.html', label: 'Primitives' },
      { id: 'brand', file: 'brand.html', label: 'Brand' },
      { id: 'roles', file: 'roles.html', label: 'Contrat de rôle' },
      { id: 'semantic', file: 'semantique.html', label: 'Sémantique (reste)' },
      { id: 'effects', file: 'effets.html', label: 'Effets & mouvement' },
    ],
  },
  {
    group: 'Composants',
    // Seules ces trois pages ont un sous-menu (elles passent `sections` à layout) :
    // ce sont donc les seuls items dépliables, marqués pour afficher un caret.
    items: [
      { id: 'form', file: 'composants-formulaire.html', label: 'Formulaire', expandable: true },
      { id: 'display', file: 'composants-affichage.html', label: 'Affichage', expandable: true },
      { id: 'structure', file: 'composants-structure.html', label: 'Structure', expandable: true },
    ],
  },
];

const FLAT_NAV = NAV.flatMap((g) => g.items);

/**
 * Une section de page. Les `sections` d'une page servent À LA FOIS à rendre les
 * titres (avec leur ancre) et à construire le sous-menu — même source, donc le
 * menu ne peut pas dériver du contenu.
 */
/**
 * Une section de doc. Si l'id est un composant, sa TABLE DE CONSOMMATION est
 * ajoutée automatiquement — on ne peut pas documenter un composant en oubliant
 * ses tokens. C'était le cas : `tokenTable()` n'était appelée que pour `button`
 * et `input`, et les 15 autres composants n'exposaient aucun token.
 * (`tokenTable` est défini plus bas — la fonction n'est appelée qu'au rendu.)
 */
const section = (id, label, html) => ({
  id,
  label,
  html: COMP[id] ? `${html}${tokenTable(id)}` : html,
});
const renderSections = (secs) =>
  secs.map((s) => `<h2 id="${s.id}">${s.label}</h2>${s.html}`).join('\n');

function layout({ id, title, lead, body, sections = [] }) {
  const i = FLAT_NAV.findIndex((p) => p.id === id);
  const prev = FLAT_NAV[i - 1];
  const next = FLAT_NAV[i + 1];

  // Le sous-menu ne se déploie que sous la page courante : afficher les ancres de
  // toutes les pages produirait une colonne de 40 liens inutilisables.
  const subNav = (itemId) =>
    itemId === id && sections.length
      ? `<ul class="sub">${sections
          .map((s) => `<li><a href="#${s.id}" data-anchor="${s.id}">${s.label}</a></li>`)
          .join('')}</ul>`
      : '';

  const nav = NAV.map(
    (g) => `
    <div class="nav-group">
      <h5>${g.group}</h5>
      <ul>${g.items
        .map(
          (it) => `<li><a href="${it.file}" class="${it.id === id ? 'on' : ''}">
            ${it.label}${it.expandable ? '<span class="nav-caret" aria-hidden="true">▸</span>' : ''}</a>${subNav(it.id)}</li>`,
        )
        .join('')}</ul>
    </div>`,
  ).join('');

  const pager = `
    <nav class="pager">
      ${prev ? `<a href="${prev.file}" class="pg pg-prev"><span>← Précédent</span><b>${prev.label}</b></a>` : '<span></span>'}
      ${next ? `<a href="${next.file}" class="pg pg-next"><span>Suivant →</span><b>${next.label}</b></a>` : '<span></span>'}
    </nav>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — @fred/design-tokens</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="components.css">
<link rel="stylesheet" href="docs.css">
<script>
  // Avant le premier rendu, pour éviter un flash (thème ET couleur « primary »).
  (function () {
    var root = document.documentElement;
    if (localStorage.getItem('theme') === 'dark') root.setAttribute('data-theme', 'dark');
    // Remappe toute la chaîne primary en surchargeant les vars brand.primary.* :
    // le rôle et les composants suivent, ils pointent déjà dessus.
    var STEPS = ${JSON.stringify(STEPS)}, ALPHAS = ${JSON.stringify(ALPHAS)};
    window.__setPrimary = function (css) {
      STEPS.forEach(function (s) { root.style.setProperty('--color-brand-primary-' + s, 'var(--color-' + css + '-' + s + ')'); });
      ALPHAS.forEach(function (a) { root.style.setProperty('--color-brand-primary-alpha-' + a, 'var(--color-' + css + '-alpha-' + a + ')'); });
    };
    var p = localStorage.getItem('primary');
    if (p) window.__setPrimary(p);
    // Polices : on surcharge --font-brand-heading (titres) et --font-brand-body (corps),
    // les rôles typo suivent. Le code garde --font-brand-mono, non touché.
    window.__setHeading = function (css) { root.style.setProperty('--font-brand-heading', 'var(--font-stack-' + css + ')'); };
    window.__setBody = function (css) { root.style.setProperty('--font-brand-body', 'var(--font-stack-' + css + ')'); };
    var fh = localStorage.getItem('fontHeading'); if (fh) window.__setHeading(fh);
    var fb = localStorage.getItem('fontBody'); if (fb) window.__setBody(fb);
  })();
</script>
</head>
<body>
<button class="burger" id="burger" aria-label="Menu">☰</button>

<aside class="sidebar" id="sidebar">
  <a class="brand" href="index.html">@fred/design-tokens</a>
  ${nav}
  <div class="settings">
    <button class="settings-btn" id="settingsBtn" aria-haspopup="dialog">⚙ Réglages</button>
  </div>
</aside>

<dialog class="settings-modal" id="settingsModal" aria-labelledby="settingsTitle">
  <div class="settings-modal-head">
    <span class="settings-modal-title" id="settingsTitle">Réglages</span>
    <button type="button" class="settings-close" id="settingsClose" aria-label="Fermer">✕</button>
  </div>
  <div class="settings-group">
    <span class="settings-label">Thème</span>
    <div class="seg">
      <button type="button" data-theme-choice="light">◐ Clair</button>
      <button type="button" data-theme-choice="dark">◑ Sombre</button>
    </div>
  </div>
  <div class="settings-group">
    <span class="settings-label">Couleur « primary »</span>
    <div class="swatch-grid">
      ${PRIMARY_OPTIONS.map((o) => `<button type="button" class="swatch-pick" data-palette="${o.css}" title="${o.name}"><span class="swatch-dot" style="background: var(--color-${o.css}-500)"></span>${o.name}</button>`).join('')}
    </div>
  </div>
  <div class="settings-group">
    <span class="settings-label">Police des titres</span>
    <div class="font-grid">
      ${FONT_OPTIONS.map((o) => `<button type="button" class="font-pick" data-font-heading="${o.css}" style="font-family: var(--font-stack-${o.css})">${o.label}</button>`).join('')}
    </div>
  </div>
  <div class="settings-group">
    <span class="settings-label">Police du corps</span>
    <div class="font-grid">
      ${FONT_OPTIONS.map((o) => `<button type="button" class="font-pick" data-font-body="${o.css}" style="font-family: var(--font-stack-${o.css})">${o.label}</button>`).join('')}
    </div>
  </div>
</dialog>

<main class="main">
  <div class="page">
    <h1>${title}</h1>
    ${lead ? `<p class="lead">${lead}</p>` : ''}
    ${body}
    ${pager}
  </div>
</main>

<script>
  const root = document.documentElement;

  // Réglages : modale (thème + couleur « primary »). <dialog> natif → piège de
  // focus, Escape et inertage du fond sont gratuits. Reste à gérer le clic sur le
  // fond (le backdrop ne déclenche pas de close natif).
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  settingsBtn.addEventListener('click', () => settingsModal.showModal());
  document.getElementById('settingsClose').addEventListener('click', () => settingsModal.close());
  settingsModal.addEventListener('click', (e) => {
    const r = settingsModal.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) settingsModal.close();
  });

  const syncTheme = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    document.querySelectorAll('[data-theme-choice]').forEach((b) =>
      b.classList.toggle('active', b.dataset.themeChoice === (dark ? 'dark' : 'light')));
  };
  document.querySelectorAll('[data-theme-choice]').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.themeChoice === 'dark') { root.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); }
      else { root.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); }
      syncTheme();
    }));
  syncTheme();

  let currentPrimary = localStorage.getItem('primary') || '${DEFAULT_PRIMARY}';
  const syncPrimary = () =>
    document.querySelectorAll('.swatch-pick').forEach((b) =>
      b.classList.toggle('active', b.dataset.palette === currentPrimary));
  document.querySelectorAll('.swatch-pick').forEach((b) =>
    b.addEventListener('click', () => {
      currentPrimary = b.dataset.palette;
      window.__setPrimary(currentPrimary);
      localStorage.setItem('primary', currentPrimary);
      syncPrimary();
    }));
  syncPrimary();

  // Deux sélecteurs de police : titres (data-font-heading) et corps (data-font-body).
  const wireFont = (attr, storeKey, def, apply) => {
    let current = localStorage.getItem(storeKey) || def;
    const picks = document.querySelectorAll('[' + attr + ']');
    const sync = () => picks.forEach((b) => b.classList.toggle('active', b.getAttribute(attr) === current));
    picks.forEach((b) =>
      b.addEventListener('click', () => {
        current = b.getAttribute(attr);
        apply(current);
        localStorage.setItem(storeKey, current);
        sync();
      }));
    sync();
  };
  wireFont('data-font-heading', 'fontHeading', '${DEFAULT_HEADING}', window.__setHeading);
  wireFont('data-font-body', 'fontBody', '${DEFAULT_BODY}', window.__setBody);

  document.getElementById('burger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Surligne dans le sous-menu la section actuellement à l'écran.
  const anchors = [...document.querySelectorAll('[data-anchor]')];
  if (anchors.length) {
    const byId = new Map(anchors.map((a) => [a.dataset.anchor, a]));
    const seen = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id);
        anchors.forEach((a) => a.classList.remove('here'));
        // La première section visible dans l'ordre du document gagne.
        const first = anchors.find((a) => seen.has(a.dataset.anchor));
        if (first) first.classList.add('here');
      },
      { rootMargin: '-10% 0px -70% 0px' },
    );
    byId.forEach((_, id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
</script>
</body>
</html>
`;
}

/* ---------- fragments ---------- */

function renderChain(path) {
  const layerOf = (p) =>
    p.startsWith('color.brand.') ? 'brand'
      : /^color\.(button|input)\./.test(p) ? 'component'
        : /^(color\.(role|surface|text|border|focus|scrim|state|categorical)|shadow|motion|opacity\.[a-z])/.test(p) ? 'semantic'
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

/* ---------- pages ---------- */

const pageIndex = () =>
  layout({
    id: 'index',
    title: 'Architecture',
    lead: `Librairie de design tokens agnostique de tout framework, au format <strong>DTCG</strong>
      (<code>$value</code> / <code>$type</code> / <code>$description</code>). Ce repo ne contient
      <strong>que les tokens</strong> — pas de composants UI.`,
    body: `
  <div class="layers">
    <a class="lyr" href="primitives.html"><span class="layer-num">1</span><b>Primitives</b><em>le catalogue</em><small>#9500ee</small></a>
    <div class="lyr-arrow">→</div>
    <a class="lyr lyr-key" href="brand.html"><span class="layer-num">2</span><b>Brand</b><em>le projet choisit</em><small>primary → violet</small></a>
    <div class="lyr-arrow">→</div>
    <a class="lyr lyr-key" href="roles.html"><span class="layer-num">3</span><b>Sémantique</b><em>le contrat de rôle</em><small>role.danger.main</small></a>
    <div class="lyr-arrow">→</div>
    <a class="lyr" href="composants-formulaire.html"><span class="layer-num">4</span><b>Composant</b><em>l'usage</em><small>button.outlined<br>.danger.hover</small></a>
  </div>

  <div class="callout callout-key">
    <strong>Les deux couches du milieu portent tout le système.</strong>
    <em>Brand</em> rend un projet rebrandable en éditant une ligne.
    <em>Sémantique</em> impose un contrat uniforme : les 6 rôles exposent les mêmes 9 slots,
    mappés sur les mêmes crans — c'est ce qui rend <code>&lt;Button color="danger"&gt;</code>
    aussi lisible que <code>&lt;Button color="primary"&gt;</code>, sans le vérifier à la main.
  </div>

  <h2>Les 3 règles de layering</h2>
  <ul class="rules">
    <li>Un token de <b>composant</b> référence un rôle <b>sémantique</b>, jamais une couche plus basse.</li>
    <li>Un rôle <b>sémantique</b> de couleur référence la couche <b>brand</b>, jamais un primitive.</li>
    <li>Un token <b>brand</b> référence un <b>primitive</b>, jamais une valeur brute.</li>
  </ul>
  <p>Elles sont mécaniquement vérifiables : un <code>grep</code> suffit à prouver qu'aucun
  composant ne pointe sur une palette.</p>

  <h2>La chaîne de résolution</h2>
  <p>C'est <em>la</em> chose à comprendre. Un token de composant ne connaît ni les palettes ni les
  hex : il ne connaît qu'un rôle. Chaque cran descend d'une couche.</p>
  ${renderChain('color.button.filled.primary.default.background')}

  <h2>Ce que le build produit</h2>
  <table class="tbl">
    <thead><tr><th>Fichier</th><th>Contenu</th></tr></thead>
    <tbody>
      <tr><td><code>dist/tokens.css</code></td><td>Custom properties : <code>:root</code> + <code>[data-theme="dark"]</code> + media query mobile. Les blocs de surcharge ne réémettent <strong>que</strong> les tokens qui changent réellement.</td></tr>
      <tr><td><code>dist/tokens.json</code></td><td>Le dictionnaire à plat, valeurs résolues, pour inspection.</td></tr>
      <tr><td><code>docs/</code></td><td>Cette documentation — générée depuis les tokens, stylée avec les tokens.</td></tr>
    </tbody>
  </table>`,
  });

const pageStart = () => {
  const roleList = ROLES.map((r) => `<code>${r}</code>&nbsp;→&nbsp;<code>${roleSource(r)}</code>`).join(' · ');
  return layout({
    id: 'start',
    title: 'Démarrer un projet',
    lead: 'Quatre étapes. La seule décision réelle est à l\'étape 2.',
    body: `
  <ol class="steps">
    <li>
      <h3>Installer et builder</h3>
      <pre><code>npm install
npm run build   <span class="c"># dist/tokens.css + dist/tokens.json + docs/</span></code></pre>
    </li>
    <li>
      <h3>Choisir l'identité du projet</h3>
      <p>Éditer la table <code>BRAND</code> dans <code>scripts/generate-theme.js</code>, puis
      lancer <code>npm run theme</code>. C'est <strong>le seul endroit</strong> à toucher.</p>
      <pre><code>const BRAND = {
  primary: '<b>violet</b>',      <span class="c">// ← change ça, tout suit</span>
  neutral: 'slateBlue',
  success: 'green', warning: 'orange', danger: 'red', info: 'blue',
};</code></pre>
      <p class="note">Sélection actuelle : ${roleList}</p>
      <div class="callout">
        N'importe quelle palette peut jouer n'importe quel rôle : elles exposent toutes les
        mêmes 11 crans sur la <strong>même courbe de luminosité</strong>. Un swap ne casse ni le
        build, ni les contrastes.
      </div>
    </li>
    <li>
      <h3>Consommer les tokens</h3>
      <pre><code>@import '@fred/design-tokens/dist/tokens.css';

<span class="c">/* tokens.css = le système. components.css = les tokens de composant. */</span>
@import '@fred/design-tokens/dist/components.css';

<span class="c">/* Un bouton : variante · rôle · état, et une taille */</span>
.btn-filled {
  background: var(--color-button-filled-<b>primary</b>-default-background);
  color:      var(--color-button-filled-<b>primary</b>-default-text);
  height:     var(--size-button-<b>md</b>-height);
  padding:    0 var(--space-button-<b>md</b>-padding-x);
  border-radius: var(--radius-button-<b>md</b>);
  font-size:  var(--font-size-button-<b>md</b>);
}
<span class="c">/* Changer de couleur = changer le rôle. Aucun token nouveau. */</span>
.btn-filled[data-color="danger"] {
  background: var(--color-button-filled-<b>danger</b>-default-background);
}</code></pre>
    </li>
    <li>
      <h3>Activer le thème sombre</h3>
      <pre><code>&lt;html data-theme="dark"&gt;</code></pre>
      <p class="note">Rien d'autre à faire : seuls les rôles sémantiques sont redéfinis sous ce
      sélecteur, les composants suivent via <code>var()</code>. Le responsive est automatique
      (media query à ${sizes.breakpoint.md.$value}).</p>
    </li>
  </ol>

  <h2>Les commandes</h2>
  <table class="tbl">
    <thead><tr><th>Commande</th><th>Effet</th></tr></thead>
    <tbody>
      <tr><td><code>npm run build</code></td><td>Génère <code>dist/</code> et <code>docs/</code>.</td></tr>
      <tr><td><code>npm run theme</code></td><td>Régénère brand + rôles + composants depuis les tables de mapping, puis build.</td></tr>
      <tr><td><code>npm run ramps</code></td><td>Aperçu des rampes de couleur (n'écrit rien).</td></tr>
      <tr><td><code>npm run ramps:write</code></td><td>Régénère <code>tokens/primitives/color.json</code>.</td></tr>
      <tr><td><code>npm run watch</code></td><td>Rebuild à chaque modification.</td></tr>
    </tbody>
  </table>`,
  });
};

const pagePrimitives = () => {
  const rows = PALETTES.map((name) => {
    const swatches = STEPS.map((step) => {
      const hex = colors[name][step].$value;
      const L = hexToOklch(hex)[0] * 100;
      return `<div class="sw" style="background:${hex}" title="${name}.${step} — ${hex} — L*${L.toFixed(0)}%">
        <span class="sw-step" style="color:${L > 60 ? '#000' : '#fff'}">${step}</span></div>`;
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

  const sizeGroups = ['spacing', 'radius', 'border', 'breakpoint']
    .map((g) => {
      const items = Object.keys(sizes[g])
        .filter((k) => !k.startsWith('$'))
        .map((k) => `<tr><td><code>size.${g}.${k}</code></td><td class="mono">${sizes[g][k].$value}</td></tr>`)
        .join('');
      return `<h3><code>size.${g}</code></h3>
        <p class="note">${esc(sizes[g].$description ?? '')}</p>
        <table class="tbl"><tbody>${items}</tbody></table>`;
    })
    .join('');

  const fontGroups = ['stack', 'weight', 'lineHeight', 'letterSpacing']
    .map((g) => {
      const items = Object.keys(fonts[g])
        .filter((k) => !k.startsWith('$'))
        .map((k) => `<tr><td><code>font.${g}.${k}</code></td><td class="mono">${esc(fonts[g][k].$value)}</td></tr>`)
        .join('');
      return `<h3><code>font.${g}</code></h3>
        <p class="note">${esc(fonts[g].$description ?? '')}</p>
        <table class="tbl"><tbody>${items}</tbody></table>`;
    })
    .join('');

  return layout({
    id: 'primitives',
    title: '1 · Primitives',
    lead: 'Le catalogue brut. Aucune sémantique, aucune référence. <strong>Jamais modifié par projet.</strong>',
    body: `
  <div class="callout callout-warn">
    <strong>Fichier généré.</strong> <code>tokens/primitives/color.json</code> est produit par
    <code>npm run ramps:write</code> — ne l'édite pas à la main, il serait écrasé.
  </div>

  <h2 id="rampes">Les rampes de couleur</h2>
  <p>Chaque palette est définie par une <em>teinte</em> + un <em>pic de chroma</em>. Ses 11 crans
  sont calculés en <strong>OKLCH</strong> sur une <strong>courbe de luminosité commune à toutes
  les palettes</strong>.</p>
  <div class="ramps">
    <div class="ramp ramp-head">
      <div></div>
      <div class="ramp-swatches">${STEPS.map((s) => `<span class="hd">${s}</span>`).join('')}</div>
      <div class="ramp-alphas">${ALPHAS.map((a) => `<span class="hd">α${a}</span>`).join('')}</div>
    </div>
    ${rows}
  </div>
  <p class="note">Survole un aplat pour son hex et sa luminosité perçue (L*).</p>

  <div class="callout callout-key">
    <strong>Pourquoi une courbe commune.</strong> Des rampes dessinées à la main dérivent : le cran
    500 valait 55 % de luminosité en <code>gray</code> et 89 % en <code>turquoise</code> (un néon).
    Un bouton primaire en turquoise donnait alors un contraste de <strong>1,85:1 — illisible</strong>.
    Comme les rôles sont interchangeables, un rôle sémantique ne peut tenir sa promesse de contraste
    que si toutes les palettes partagent la même courbe. Après régénération : <strong>4,60:1</strong>.
  </div>
  <p class="note"><strong>OKLCH et pas HSL</strong> : la luminosité HSL n'est pas perceptuelle — un
  jaune et un bleu à <code>L=50 %</code> n'ont rien à voir à l'œil. OKLCH, si.</p>

  <h2>Les voiles alpha</h2>
  <p>Chaque teinte expose un voile translucide à <strong>5 %</strong> et <strong>10 %</strong>
  (colonnes α ci-dessus, sur damier), calculé sur son cran 500. Ils servent aux fonds d'états :
  survol et état actif d'un bouton <em>outlined</em> ou <em>ghost</em>, ligne de tableau sélectionnée.</p>
  <div class="callout">
    <strong>L'alpha vit DANS la palette</strong>, pas dans un groupe <code>color.alpha.*</code>
    séparé. Le rôle <code>brand.primary</code> alias la palette <em>entière</em> : changer la tonique
    emporte donc l'alpha avec elle. Un groupe séparé obligerait à swapper deux fois — et un oubli
    donnerait un bouton violet au survol turquoise.
  </div>
  <p class="note">Un voile se compose sur le fond qui est dessous : il s'adapte tout seul au thème
  sombre. Les tokens alpha sont donc <strong>identiques en light et dark</strong>.</p>

  <h2 id="echelles">Les échelles de taille</h2>
  ${sizeGroups}

  <h2 id="polices">Les polices</h2>
  <p>Le catalogue typographique brut : piles de polices, graisses, interlignes, approches. Comme
  les couleurs, <strong>rien n'est choisi ici</strong> — c'est le <a href="brand.html#polices">brand</a>
  qui désigne la pile qui joue <code>heading</code>, <code>body</code> et <code>mono</code>. C'est ici
  qu'un rôle typo trouve sa <code>weight</code>, sa <code>lineHeight</code> et son <code>letterSpacing</code>.</p>
  ${fontGroups}`,
  });
};

const pageBrand = () => {
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

  // Même mécanique que les couleurs : le brand désigne quelle pile joue chaque usage.
  const fontRows = Object.keys(fontBrand)
    .filter((k) => !k.startsWith('$'))
    .map((role) => {
      const stack = /\{font\.stack\.([A-Za-z]+)\}/.exec(String(fontBrand[role].$value))?.[1] ?? '—';
      return `<div class="brand-row">
        <div class="brand-role">${role}</div>
        <div class="brand-arrow">→</div>
        <div class="brand-palette">${stack}</div>
        <div class="brand-specimen" style="font-family: var(--font-brand-${role})">Le vif renard brun saute — 0123</div>
      </div>`;
    })
    .join('');

  return layout({
    id: 'brand',
    title: '2 · Brand',
    lead: 'Quelle palette du catalogue joue quel rôle. <strong>Le seul endroit à éditer pour rebrander un projet.</strong>',
    body: `
  <div class="brand-table">${rows}</div>

  <div class="callout callout-key">
    <strong>Le cœur du système.</strong> Changer la tonique = éditer une ligne dans
    <code>scripts/generate-theme.js</code>, puis <code>npm run theme</code>.
    <pre><code>const BRAND = {
  primary: '<b>turquoise</b>',   <span class="c">// était 'violet'</span>
  neutral: 'slateBlue', success: 'green', …
};</code></pre>
    Ni le contrat de rôle, ni les composants ne bougent. Tous les boutons, liens et états actifs
    de l'app suivent.
  </div>

  <h2 id="polices">Les polices</h2>
  <p>Même principe que les couleurs : le brand désigne quelle pile du
  <a href="primitives.html#polices">catalogue</a> joue les <strong>titres</strong> (<code>heading</code>),
  le <strong>corps</strong> (<code>body</code>) et le <strong>code</strong> (<code>mono</code>). Titres et
  corps portent volontairement deux polices distinctes. Changer l'une, c'est une ligne —
  <code>BRAND_FONT</code> dans <code>scripts/generate-theme.js</code>.</p>
  <div class="brand-table">${fontRows}</div>

  <h2>Sans cette couche</h2>
  <p>Si un rôle sémantique pointait directement sur une palette
  (<code>role.primary.main → {color.violet.600}</code>), rebrander obligerait à réécrire
  <strong>chaque rôle, en light ET en dark</strong>. Des dizaines d'éditions à la main, avec la
  certitude d'en oublier une.</p>

  <h2>Couleurs catégorielles</h2>
  <p>Teintes distinguables pour graphiques, avatars et tags.</p>
  <div class="cats">${cats}</div>
  <p class="note">Elles ne suivent volontairement <strong>pas</strong> le contrat de rôle (seulement
  <code>main</code> + <code>tint</code>) : ce ne sont pas des rôles sémantiques, juste des couleurs
  qu'on doit pouvoir différencier les unes des autres.</p>`,
  });
};

const pageRoles = () => {
  const head = SLOTS.map((s) => `<th>${s}</th>`).join('');
  const rows = ROLES.map((role) => {
    const cells = SLOTS.map((slot) => {
      const path = `color.role.${role}.${slot}`;
      return `<td><div class="slot ${/tint/.test(slot) ? 'sw-alpha' : ''}"
        style="background:var(${cssVar(path)})" title="${path}"></div></td>`;
    }).join('');
    return `<tr><th class="rh">${role}</th>${cells}</tr>`;
  }).join('');

  const slotDocs = SLOTS.map(
    (s) => `<tr><td><code>${s}</code></td><td>${esc(light.role.primary[s].$description ?? '')}</td></tr>`,
  ).join('');

  return layout({
    id: 'roles',
    title: '3 · Le contrat de rôle',
    lead: `La pièce maîtresse. Les ${ROLES.length} rôles exposent <strong>exactement les mêmes
      ${SLOTS.length} slots</strong>, mappés sur <strong>exactement les mêmes crans</strong>.`,
    body: `
  <div class="scroll-x">
    <table class="tbl contract">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p class="note">Bascule le thème : les couleurs changent, <strong>les noms ne changent pas</strong>.</p>

  <h2>À quoi sert chaque slot</h2>
  <table class="tbl">
    <thead><tr><th>Slot</th><th>Usage</th></tr></thead>
    <tbody>${slotDocs}</tbody>
  </table>

  <h2>Pourquoi l'uniformité garantit le contraste</h2>
  <p>Toutes les palettes sont sur la même courbe de luminosité (couche 1). Donc si
  <code>main</code> = cran 600 et <code>on</code> = <code>neutral.25</code> passe AA pour
  <em>un</em> rôle, ça passe AA pour <em>les six</em>.</p>
  <div class="callout callout-key">
    <strong>Mesuré sur le CSS généré</strong> — texte sur fond, pour les 6 rôles :
    <br>bouton plein, thème clair : <strong>4,56:1 → 5,74:1</strong> ·
    thème sombre : <strong>5,72:1 → 6,66:1</strong>.
    <br>Les 12 combinaisons passent <strong>WCAG AA</strong>, sans un seul token écrit à la main.
  </div>
  <p>Conséquence directe : <code>&lt;Button color="danger"&gt;</code> fonctionne
  <strong>sans un token de plus</strong>. Un composant qui sait afficher <code>primary</code> sait
  afficher les cinq autres.</p>

  <h2>Deux règles de nommage non négociables</h2>
  <div class="callout callout-warn">
    <strong>Un nom de rôle décrit un usage, jamais une apparence.</strong>
    Pas de <code>dark</code> / <code>darker</code> pour dire « survol » et « pressé » : en thème
    sombre, le survol doit être <em>plus clair</em> — le nom deviendrait un mensonge. D'où
    <code>hover</code> et <code>active</code>.
  </div>
  <div class="callout callout-warn">
    <strong>Un mot, un sens.</strong> <code>surface</code> désigne <em>uniquement</em> les fonds
    (<code>surface.base</code>, <code>surface.raised</code>…). Le voile alpha d'un rôle s'appelle
    <code>tint</code> — jamais <code>surface</code>.
  </div>`,
  });
};

const pageSemantic = () => {
  const groups = ['surface', 'text', 'border']
    .map((group) => {
      const items = Object.keys(light[group])
        .filter((k) => !k.startsWith('$'))
        .map((name) => {
          const path = `color.${group}.${name}`;
          return `<div class="role">
            <div class="role-chip ${/transparent/.test(name) ? 'sw-alpha' : ''}" style="background:var(${cssVar(path)})"></div>
            <div class="role-name">${name}</div>
            <span class="role-desc">${esc(light[group][name].$description ?? '')}</span>
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

  // L'aperçu applique les 6 slots du rôle, et RIEN d'autre. Si le spécimen ne
  // ressemble pas à ce qu'il doit être, c'est que le rôle est incomplet.
  const typoRows = Object.keys(typography)
    .filter((k) => !k.startsWith('$'))
    .map((role) => {
      const v = (slot) => resolve(`typography.${role}.${slot}`);
      const specimen = [
        `font-family:${v('family')}`,
        `font-size:${v('size')}`,
        `font-weight:${v('weight')}`,
        `line-height:${v('lineHeight')}`,
        `letter-spacing:${v('letterSpacing')}`,
        `text-transform:${v('textCase')}`,
      ].join(';');
      return `<tr>
        <td><code>typography.${role}</code></td>
        <td style="${specimen}">Le vif renard brun saute</td>
        <td class="mono">${v('size')} · ${v('weight')} · ${v('lineHeight')} · ${v('letterSpacing')}</td></tr>`;
    })
    .join('');

  // Le détail : les 6 slots de CHAQUE rôle, avec le token sémantique consommé et
  // la valeur résolue. Même lecture que les tables de consommation des composants.
  const typoSlots = Object.keys(typography[Object.keys(typography).find((k) => !k.startsWith('$'))]).filter(
    (k) => !k.startsWith('$'),
  );
  const typoTokenRows = Object.keys(typography)
    .filter((k) => !k.startsWith('$'))
    .flatMap((role) =>
      typoSlots.map((slot) => {
        const ref = /^\{(.+)\}$/.exec(String(typography[role][slot].$value))?.[1] ?? null;
        const [href, page] = ref ? pageFor(ref) : [null, null];
        const consume = ref
          ? href
            ? `<a href="${href}" title="${esc(ref)} — défini dans « ${page} »"><code>${esc(cssVar(ref))}</code></a>`
            : `<code>${esc(cssVar(ref))}</code>`
          : `<span class="note">valeur directe</span>`;
        return `<tr>
          <td class="mono tiny">${esc(cssVar(`typography.${role}.${slot}`))}</td>
          <td class="tiny">${consume}</td>
          <td class="mono tiny note">${esc(String(resolve(`typography.${role}.${slot}`) ?? '—'))}</td></tr>`;
      }),
    )
    .join('');

  return layout({
    id: 'semantic',
    title: '3 · Sémantique (le reste)',
    lead: 'Au-delà du contrat de rôle : les fonds, le texte, les bordures, le focus, les tailles et la typo.',
    body: `
  <h2 id="couleur">Couleur</h2>
  <p><code>surface</code> est le <strong>seul</strong> groupe qui parle de fonds.</p>
  <div class="roles">${groups}</div>

  <h3>Focus &amp; scrim</h3>
  <div class="roles">
    <div class="role-group"><div class="role-list">
      <div class="role"><div class="role-chip" style="background:var(--color-focus-ring)"></div>
        <div class="role-name">focus.ring</div>
        <span class="role-desc">${esc(light.focus.ring.$description)}</span></div>
      <div class="role"><div class="role-chip sw-alpha" style="background:var(--color-scrim)"></div>
        <div class="role-name">scrim</div>
        <span class="role-desc">${esc(light.scrim.$description)}</span></div>
    </div></div>
  </div>

  <h2 id="tailles">Tailles — desktop vs mobile</h2>
  <p class="note">Seules les lignes <span class="tag">≠</span> sont réémises dans la media query du
  CSS généré. Les autres sont identiques : aucune ligne inutile.</p>
  <table class="tbl">
    <thead><tr><th>Rôle</th><th>Desktop</th><th>Mobile (&lt; ${sizes.breakpoint.md.$value})</th></tr></thead>
    <tbody>${sizeRows}</tbody>
  </table>
  <div class="callout callout-warn">
    <strong>Breakpoints.</strong> Une media query CSS <em>ne peut pas</em> lire une custom property
    — <code>@media (max-width: var(--size-breakpoint-md))</code> ne fonctionne pas. Le build lit
    donc <code>size.breakpoint.md</code> dans les tokens et inline sa valeur. Une seule source de
    vérité.
  </div>

  <h2 id="typographie">Typographie</h2>
  <p>Chaque rôle porte <strong>6 slots</strong> — famille, taille, graisse, interligne, crénage, casse —
    et se suffit donc à lui-même : <code>font: var(--typography-h1-*)</code> et rien d'autre. La
    <strong>taille</strong> est une référence à <code>fontSize.*</code> (ci-dessus), pas une valeur :
    le rôle hérite de la bascule mobile sans la connaître.</p>
  <table class="tbl">
    <thead><tr><th>Rôle</th><th>Aperçu</th><th>Taille · graisse · interligne · crénage</th></tr></thead>
    <tbody>${typoRows}</tbody>
  </table>

  <h3>Tous les tokens de chaque rôle</h3>
  <p class="note">Les <strong>6 slots</strong> de chaque rôle — famille, taille, graisse, interligne,
    crénage, casse — le token sémantique que chacun consomme (cliquable, vers la page qui le définit),
    et la valeur résolue. C'est ici que se voient <code>font-family</code>, <code>font-weight</code>, etc.</p>
  <div class="tok-body"><table class="tbl">
    <thead><tr><th>Token</th><th>Consomme (sémantique)</th><th>Valeur résolue</th></tr></thead>
    <tbody>${typoTokenRows}</tbody>
  </table></div>
  <div class="callout">
    <strong>La police est dans le brand, pas dans la primitive.</strong> Un rôle pointe sur
    <code>font.brand.heading|body|mono</code>, qui désigne une pile du catalogue
    <code>font.stack.*</code>. Les titres (<code>heading</code>) et le corps (<code>body</code>)
    portent deux polices distinctes ; changer l'une, c'est une ligne — <code>BRAND_FONT</code> dans
    <code>scripts/generate-theme.js</code> — exactement comme changer la couleur d'un rôle.
  </div>`,
  });
};

const pageEffects = () => {
  const shadowDemo = Object.keys(shadow)
    .filter((k) => !k.startsWith('$'))
    .map(
      (name) => `<div class="demo-item">
        <div class="shadow-box" style="box-shadow: var(--shadow-${name})"></div>
        <span class="demo-label">shadow.${name}</span>
      </div>`,
    )
    .join('');

  const shadowDocs = Object.keys(shadow)
    .filter((k) => !k.startsWith('$'))
    .map((n) => `<tr><td><code>shadow.${n}</code></td><td>${esc(shadow[n].$description ?? '')}</td></tr>`)
    .join('');

  const stateSwatches = Object.keys(light.state)
    .filter((k) => !k.startsWith('$'))
    .map(
      (name) => `<div class="role">
        <div class="role-chip sw-alpha" style="background:var(--color-state-${name})"></div>
        <div class="role-name">state.${name}</div>
        <span class="role-desc">${esc(light.state[name].$description ?? '')}</span>
      </div>`,
    )
    .join('');

  const alphaLadder = (family) =>
    Object.keys(colors.alpha[family])
      .filter((k) => !k.startsWith('$'))
      .map(
        (a) => `<div class="cat">
          <i class="sw-alpha" style="background:${colors.alpha[family][a].$value}"></i>
          <span>${a}%</span></div>`,
      )
      .join('');

  const durations = Object.keys(effectTheme.motion.duration)
    .filter((k) => !k.startsWith('$'))
    .map(
      (n) => `<tr>
        <td><code>motion.duration.${n}</code></td>
        <td class="mono">${resolve(`motion.duration.${n}`)}</td>
        <td><div class="motion-demo" style="animation-duration: var(--motion-duration-${n})"></div></td>
        <td>${esc(effectTheme.motion.duration[n].$description ?? '')}</td>
      </tr>`,
    )
    .join('');

  const easings = Object.keys(effects.easing)
    .filter((k) => !k.startsWith('$'))
    .map(
      (n) => `<tr><td><code>easing.${n}</code></td>
        <td class="mono">cubic-bezier(${effects.easing[n].$value.join(', ')})</td>
        <td>${esc(effects.easing[n].$description ?? '')}</td></tr>`,
    )
    .join('');

  return layout({
    id: 'effects',
    title: '3 · Effets & mouvement',
    lead: `Ombres, voiles d'état neutres, durées et courbes. <strong>Trois familles qui n'existaient
      pas</strong> — et dont l'absence cachait un bug.`,
    body: `
  <h2>Les voiles neutres — et le bug qu'ils corrigent</h2>
  <p>Les voiles <code>role.X.tint</code> teintent à la couleur d'un rôle. Mais une ligne de tableau
  survolée ne doit <em>pas</em> virer au violet, et un scrim de modale doit <em>assombrir</em>.
  D'où des voiles <strong>blanc et noir absolus</strong>, indépendants de toute palette.</p>

  <h3><code>color.alpha.black</code></h3>
  <div class="cats">${alphaLadder('black')}</div>
  <h3><code>color.alpha.white</code></h3>
  <div class="cats">${alphaLadder('white')}</div>

  <div class="callout callout-warn">
    <strong>Le bug.</strong> <code>scrim</code> pointait sur <code>brand.neutral.alpha.10</code>,
    c'est-à-dire un <em>slateBlue translucide</em>. Sous ce voile, la luminance de la page ne
    passait que de <strong>0,96 à 0,86</strong> : une modale ne se serait jamais détachée. Il pointe
    maintenant sur <code>alpha.black.60</code> → <strong>0,96 → 0,13</strong>.
  </div>

  <h3>Voiles d'état</h3>
  <p>C'est le <strong>seul groupe qui s'inverse</strong> entre les modes : en clair on assombrit
  (noir), en sombre on éclaircit (blanc). Bascule le thème pour le voir.</p>
  <div class="roles"><div class="role-group"><div class="role-list">${stateSwatches}</div></div></div>

  <h2 id="ombres">Ombres</h2>
  <div class="demo">${shadowDemo}</div>
  <table class="tbl"><tbody>${shadowDocs}</tbody></table>
  <div class="callout">
    <strong>Géométrie et couleur sont séparées.</strong> Le décalage, le flou et l'étalement viennent
    des primitives (<code>elevation.*</code>) ; la <em>couleur</em> est choisie par le mode — sur fond
    sombre, une ombre doit être bien plus opaque pour rester lisible
    (<code>black.8</code> en clair, <code>black.40</code> en sombre pour <code>shadow.raised</code>).
  </div>
  <p class="note">Les ombres sont émises en valeurs <strong>résolues</strong>, pas en
  <code>var()</code>. Style Dictionary réinjecte les <code>var()</code> dans une valeur courte par
  recherche de chaîne : quand <code>offsetX</code> vaut <code>0</code> et que le
  <code>spread</code> vaut <code>0</code> aussi, il intervertit les deux positions. Un spread non
  nul se serait retrouvé dans l'offset horizontal.</p>

  <h2 id="mouvement">Mouvement</h2>
  <table class="tbl">
    <thead><tr><th>Token</th><th>Valeur</th><th>Aperçu</th><th>Usage</th></tr></thead>
    <tbody>${durations}</tbody>
  </table>
  <h3>Courbes</h3>
  <table class="tbl">
    <thead><tr><th>Token</th><th>Valeur</th><th>Usage</th></tr></thead>
    <tbody>${easings}</tbody>
  </table>

  <h2 id="opacite">Opacité</h2>
  <table class="tbl">
    <tbody>
      <tr><td><code>opacity.disabled</code></td><td class="mono">${resolve('opacity.disabled')}</td>
      <td>${esc(effectTheme.opacity.disabled.$description)}</td></tr>
    </tbody>
  </table>
  <p class="note">Deux façons de traiter le désactivé coexistent : les couleurs dédiées
  (<code>surface.disabled</code>, <code>text.disabled</code>, <code>border.disabled</code>) —
  plus contrôlables — ou cette opacité globale, qui atténue un composant entier d'un coup.
  Choisis-en <strong>une</strong> par composant, pas les deux.</p>`,
  });
};


/* ---------- pages composants ---------- */

/* ---------- « ça se trouve où ? » : router un token vers sa page ---------- *
 *
 * Un token de composant ne dit rien tout seul — `--typography-button-family` ne
 * devient intéressant que quand on voit qu'il pointe sur `typography.label`, qui
 * est documenté ailleurs. La doc doit donc faire le lien, littéralement.
 * L'ordre compte : les motifs les plus spécifiques d'abord.
 */
const TOKEN_PAGES = [
  [/^color\.role\./,                                    'roles.html',                'Contrat de rôle'],
  [/^font\.brand\./,                                    'brand.html#polices',        'Brand · polices'],
  [/^color\.brand\./,                                   'brand.html',                'Brand'],
  [/^color\.(surface|text|border|state|categorical)\.|^(focus|scrim)\b/, 'semantique.html#couleur',     'Sémantique · couleur'],
  [/^typography\./,                                     'semantique.html#typographie', 'Sémantique · typo'],
  [/^(fontSize|space|radius|borderWidth|controlHeight|glyphSize|trackWidth|trackHeight)\./, 'semantique.html#tailles',  'Sémantique · tailles'],
  [/^shadow\./,                                         'effets.html#ombres',        'Effets · ombres'],
  [/^(duration|easing)\./,                              'effets.html#mouvement',     'Effets · mouvement'],
  [/^opacity\./,                                        'effets.html#opacite',       'Effets · opacité'],
  [/^size\./,                                           'primitives.html#echelles',  'Primitives'],
  [/^font\.(stack|weight|lineHeight|letterSpacing)\./,  'primitives.html#polices',   'Primitives · polices'],
  [/^(color|font)\./,                                   'primitives.html#rampes',    'Primitives'],
];

const pageFor = (path) => TOKEN_PAGES.find(([re]) => re.test(path))?.slice(1) ?? [null, null];

/** Le GROUPE d'une référence — ce qui est utile à lire, pas le chemin entier.
 *  `typography.label.family` → `typography.label` (le rôle compte)
 *  `color.role.primary.main` → `color.role`       (le rôle est un paramètre) */
const refGroup = (ref) => {
  const s = ref.split('.');
  return (s[0] === 'color' || s[0] === 'typography') && s.length > 2 ? `${s[0]}.${s[1]}` : s[0];
};

const refLink = (ref, label = ref) => {
  const [href, page] = pageFor(ref);
  return href
    ? `<a href="${href}" title="Défini dans « ${page} »"><code>${esc(label)}</code></a>`
    : `<code>${esc(label)}</code>`;
};

/**
 * La table de consommation d'un composant : TOUS ses tokens, et pour chacun le
 * token SÉMANTIQUE qu'il consomme — avec le lien vers la page qui le définit.
 *
 * Rien n'est tronqué ni replié. Un token de composant ne veut rien dire seul :
 * `--typography-button-family` ne devient lisible qu'une fois qu'on voit qu'il
 * consomme `--typography-label-family`, et qu'on peut aller lire ce rôle.
 * Masquer la colonne de droite, c'était masquer la seule chose intéressante.
 *
 * Les grosses familles (la couleur d'un bouton : 216 tokens) défilent dans leur
 * propre cadre — tout est là, la page reste navigable.
 */
function tokenTable(name) {
  const byGroup = {};
  for (const [group, node] of Object.entries(COMP[name])) {
    for (const [path, value] of flatten({ [group]: node })) (byGroup[group] ??= []).push([path, value]);
  }

  const refOf = (value) => /^\{(.+)\}$/.exec(String(value))?.[1] ?? null;
  const total = Object.values(byGroup).reduce((n, e) => n + e.length, 0);

  const blocks = Object.entries(byGroup)
    .map(([group, entries]) => {
      // Vers quelle(s) couche(s) cette famille pointe-t-elle ?
      const targets = [...new Set(entries.map(([, v]) => refOf(v)).filter(Boolean).map(refGroup))];

      const rows = entries
        .map(([path, value]) => {
          const ref = refOf(value);
          const [href, page] = ref ? pageFor(ref) : [null, null];
          // La colonne du milieu montre la VARIABLE sémantique — celle qu'on lit
          // dans le CSS — et pointe sur la page qui la documente.
          const semantic = ref
            ? href
              ? `<a href="${href}" title="${esc(ref)} — défini dans « ${page} »"><code>${esc(cssVar(ref))}</code></a>`
              : `<code>${esc(cssVar(ref))}</code>`
            : `<span class="note">valeur directe</span>`;
          return `<tr>
            <td class="mono tiny">${esc(cssVar(path))}</td>
            <td class="tiny">${semantic}</td>
            <td class="mono tiny note">${esc(String(resolve(path) ?? '—'))}</td></tr>`;
        })
        .join('');

      return `<div class="tok">
        <div class="tok-head">
          <code>${group}</code>
          <span class="note">${entries.length} token${entries.length > 1 ? 's' : ''}</span>
          <span class="tok-to">consomme ${targets.map((t) => refLink(t)).join(' ')}</span>
        </div>
        <div class="tok-body"><table class="tbl">
          <thead><tr><th>Token du composant</th><th>Consomme (sémantique)</th><th>Valeur résolue</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;
    })
    .join('');

  return `<p class="note">Les <strong>${total} tokens</strong> de <code>${name}</code>, et le token
    sémantique que chacun consomme. <strong>Aucun ne nomme jamais une palette ni une police</strong> —
    suivre un lien mène à la page où ce rôle est défini.</p>${blocks}`;
}

const btnStyle = (name, variant, role, state, size = 'md') => `
  background: var(${cssVar(`color.${name}.${variant}.${role}.${state}.background`)});
  color: var(${cssVar(`color.${name}.${variant}.${role}.${state}.text`)});
  border: var(${cssVar(`border-width.${name}.${size}`)}) solid var(${cssVar(`color.${name}.${variant}.${role}.${state}.border`)});
  border-radius: var(${cssVar(`radius.${name}.${size}`)});
  padding: 0 var(${cssVar(`space.${name}.${size}.paddingX`)});
  height: var(${cssVar(`size.${name}.${size}.height`)});
  font-size: var(${cssVar(`font-size.${name}.${size}`)});
  font-family: var(${cssVar(`typography.${name}.family`)});
  font-weight: var(${cssVar(`typography.${name}.weight`)});
  line-height: var(${cssVar(`typography.${name}.lineHeight`)});
  letter-spacing: var(${cssVar(`typography.${name}.letterSpacing`)});`;

/** Grille rôles × états pour un composant role-aware. */
function roleGrid(name, variant, states, render) {
  const head = states.map((st) => `<th>${st}</th>`).join('');
  const rows = ROLES.map(
    (role) =>
      `<tr><th class="rh">${role}</th>${states.map((st) => `<td>${render(role, st)}</td>`).join('')}</tr>`,
  ).join('');
  return `<div class="scroll-x"><table class="tbl btn-grid ${variant !== 'filled' ? 'checker' : ''}">
    <thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const pageForm = () => {
  const btnStates = Object.keys(COMP.button.color.button.filled[ROLES[0]]);
  const buttons = Object.keys(COMP.button.color.button)
    .filter((k) => !k.startsWith('$'))
    .map(
      (v) => `<h3><code>${v}</code></h3>` +
        roleGrid('button', v, btnStates, (role, st) =>
          `<button class="demo-btn" style="${btnStyle('button', v, role, st)}">Button CTA</button>`),
    )
    .join('');

  const sizeDemo = ['sm', 'md', 'lg']
    .map(
      (sz) => `<div class="demo-item">
        <button class="demo-btn" style="${btnStyle('button', 'filled', 'primary', 'default', sz)}">Button</button>
        <span class="demo-label">${sz}</span></div>`,
    )
    .join('');

  const field = (comp, state, sz = 'md') => `
    background: var(${cssVar(`color.${comp}.${state}.background`)});
    color: var(${cssVar(`color.${comp}.${state}.text`)});
    border: var(${cssVar(`border-width.${comp}.${sz}`)}) solid var(${cssVar(`color.${comp}.${state}.border`)});
    border-radius: var(${cssVar(`radius.${comp}.${sz}`)});
    padding: 0 var(${cssVar(`space.${comp}.${sz}.paddingX`)});
    height: var(${cssVar(`size.${comp}.${sz}.height`)});
    font-size: var(${cssVar(`font-size.${comp}.${sz}`)});
    font-family: var(${cssVar(`typography.${comp}.family`)});
    line-height: var(${cssVar(`typography.${comp}.lineHeight`)});`;

  const inputs = Object.keys(COMP.input.color.input)
    .filter((k) => !k.startsWith('$'))
    .map(
      (st) => `<div class="demo-item">
        <input class="demo-input" value="Saisie" readonly style="${field('input', st)}">
        <span class="demo-label">${st}</span></div>`,
    )
    .join('');

  const textareas = Object.keys(COMP.textarea.color.textarea)
    .filter((k) => !k.startsWith('$'))
    .map(
      (st) => `<div class="demo-item">
        <div class="demo-input demo-textarea" style="
          background: var(${cssVar(`color.textarea.${st}.background`)});
          color: var(${cssVar(`color.textarea.${st}.text`)});
          border: var(--border-width-textarea) solid var(${cssVar(`color.textarea.${st}.border`)});
          border-radius: var(--radius-textarea);
          padding: var(--space-textarea-padding-y) var(--space-textarea-padding-x);
          font-size: var(--font-size-textarea);
          font-family: var(--typography-textarea-family);
          line-height: var(--typography-textarea-line-height);">Saisie multiligne</div>
        <span class="demo-label">${st}</span></div>`,
    )
    .join('');

  const selects = Object.keys(COMP.select.color.select)
    .filter((k) => !k.startsWith('$'))
    .map(
      (st) => `<div class="demo-item">
        <div class="demo-input demo-select" style="${field('select', st)}">
          <span>Choix</span>
          <span style="color: var(${cssVar(`color.select.${st}.icon`)})">▾</span>
        </div>
        <span class="demo-label">${st}</span></div>`,
    )
    .join('');

  // Mono-parti (primary) : plus de grille de rôles, une colonne par ÉTAT. La
  // dernière paire (`error`/`errorHover`) pointe le rôle danger.
  const states = (comp) => Object.keys(COMP[comp].color[comp]).filter((k) => !k.startsWith('$'));
  const stateStrip = (comp, cell) => `<div class="scroll-x"><table class="tbl btn-grid checker">
    <thead><tr>${states(comp).map((st) => `<th>${st}</th>`).join('')}</tr></thead>
    <tbody><tr>${states(comp).map((st) => `<td>${cell(st)}</td>`).join('')}</tr></tbody></table></div>`;

  const boxes = (comp) =>
    stateStrip(comp, (st) => `
      <div class="ctl" style="
        width: var(${cssVar(`size.${comp}.md.box`)}); height: var(${cssVar(`size.${comp}.md.box`)});
        background: var(${cssVar(`color.${comp}.${st}.background`)});
        border: var(${cssVar(`border-width.${comp}.md`)}) solid var(${cssVar(`color.${comp}.${st}.border`)});
        border-radius: var(${cssVar(`radius.${comp}.md`)});
        color: var(${cssVar(`color.${comp}.${st}.mark`)});
      ">${comp === 'radio' ? '●' : st === 'indeterminate' ? '–' : '✓'}</div>`);

  // L'anneau d'erreur est rendu en `outline` : il n'occupe pas l'intérieur de la
  // piste (donc n'écrase pas le pouce) et n'apparaît que quand `border` est danger.
  const switches = stateStrip('switch', (st) => `
    <div class="sw-track" style="
      width: var(--size-switch-md-track-width); height: var(--size-switch-md-track-height);
      background: var(${cssVar(`color.switch.${st}.track`)});
      border-radius: var(--radius-switch-md);
      outline: var(--border-width-switch-md) solid var(${cssVar(`color.switch.${st}.border`)});
      outline-offset: 2px;
      justify-content: ${/^on/.test(st) || st === 'disabledOn' ? 'flex-end' : 'flex-start'};
    "><i style="
      width: var(--size-switch-md-thumb); height: var(--size-switch-md-thumb);
      background: var(${cssVar(`color.switch.${st}.thumb`)});
    "></i></div>`);

  const secs = [
    section('button', 'Button', `${buttons}
      <h3>Tailles</h3>
      <div class="demo">${sizeDemo}</div>
      <div class="callout callout-warn">
        <strong>Sur mobile, les contrôles GRANDISSENT.</strong> C'est la seule famille de tailles qui
        augmente au lieu de diminuer : une cible tactile doit faire au moins 44px (WCAG 2.5.5). Un
        bouton <code>md</code> passe de <strong>40px</strong> en desktop à <strong>52px</strong> sous
        <code>${sizes.breakpoint.md.$value}</code>.
      </div>`),
    section('input', 'Input', `<div class="demo">${inputs}</div>`),
    section('textarea', 'Textarea', `<div class="demo">${textareas}</div>`),
    section('select', 'Select', `<div class="demo">${selects}</div>`),
    section('checkbox', 'Checkbox', boxes('checkbox')),
    section('radio', 'Radio', boxes('radio')),
    section('switch', 'Switch', switches),
  ];

  return layout({
    id: 'form',
    title: '4 · Composants — formulaire',
    lead: `Button, Input, Textarea, Select, Checkbox, Radio, Switch. Rendus <strong>uniquement</strong>
      avec les variables générées.`,
    sections: secs,
    body: `
  <div class="callout callout-key">
    <strong>Rien n'est écrit à la main.</strong> Seul le <code>button</code> est <em>role-aware</em> :
    il est généré pour <strong>les 6 rôles</strong> à partir d'une table qui dit quels <em>slots</em>
    chaque variante consomme (<code>&lt;Button color="danger"&gt;</code> existe sans un token de plus).
    <code>checkbox</code>, <code>radio</code> et <code>switch</code>, eux, sont <strong>mono-parti</strong> :
    une case n'a pas de couleur à choisir, elle est <code>primary</code>. Ils gardent en revanche un
    état d'<strong>erreur</strong> qui pointe le rôle <code>danger</code> — comme le <code>error</code>
    d'un champ.
  </div>
  ${renderSections(secs)}`,
  });
};

const pageDisplay = () => {
  const badgeVariants = Object.keys(COMP.badge.color.badge).filter((k) => !k.startsWith('$'));
  const badges = badgeVariants
    .map(
      (v) => `<h3><code>${v}</code></h3><div class="demo ${v !== 'filled' ? '' : ''}">` +
        ROLES.map(
          (role) => `<div class="demo-item"><span class="pill" style="
            background: var(${cssVar(`color.badge.${v}.${role}.default.background`)});
            color: var(${cssVar(`color.badge.${v}.${role}.default.text`)});
            border: var(--border-width-badge-md) solid var(${cssVar(`color.badge.${v}.${role}.default.border`)});
            border-radius: var(--radius-badge-md);
            padding: 0 var(--space-badge-md-padding-x);
            height: var(--size-badge-md-height);
            font-size: var(--font-size-badge-md);
          ">${role}</span></div>`,
        ).join('') + '</div>',
    )
    .join('');

  const tagStates = Object.keys(COMP.tag.color.tag.subtle[ROLES[0]]);
  const tags = Object.keys(COMP.tag.color.tag)
    .filter((k) => !k.startsWith('$'))
    .map(
      (v) => `<h3><code>${v}</code></h3>` +
        roleGrid('tag', v, tagStates, (role, st) => `<span class="pill" style="
          background: var(${cssVar(`color.tag.${v}.${role}.${st}.background`)});
          color: var(${cssVar(`color.tag.${v}.${role}.${st}.text`)});
          border: var(--border-width-tag-md) solid var(${cssVar(`color.tag.${v}.${role}.${st}.border`)});
          border-radius: var(--radius-tag-md);
          padding: 0 var(--space-tag-md-padding-x);
          height: var(--size-tag-md-height);
          font-size: var(--font-size-tag-md);
        ">${role}</span>`),
    )
    .join('');

  const alerts = Object.keys(COMP.alert.color.alert)
    .filter((k) => !k.startsWith('$'))
    .map(
      (v) => `<h3><code>${v}</code></h3><div class="alerts">` +
        ROLES.map(
          (role) => `<div class="alert" style="
            background: var(${cssVar(`color.alert.${v}.${role}.default.background`)});
            border: var(--border-width-alert) solid var(${cssVar(`color.alert.${v}.${role}.default.border`)});
            border-radius: var(--radius-alert);
            padding: var(--space-alert-padding-y) var(--space-alert-padding-x);
            gap: var(--space-alert-gap);
          ">
            <span style="color: var(${cssVar(`color.alert.${v}.${role}.default.icon`)}); font-size: var(--size-alert-icon)">●</span>
            <div>
              <b style="color: var(${cssVar(`color.alert.${v}.${role}.default.title`)})">${role}</b>
              <p style="color: var(${cssVar(`color.alert.${v}.${role}.default.text`)}); margin:0">Un message d'alerte.</p>
            </div>
          </div>`,
        ).join('') + '</div>',
    )
    .join('');

  const cards = Object.keys(COMP.card.color.card)
    .filter((k) => !k.startsWith('$'))
    .map(
      (st) => `<div class="demo-item"><div class="card-demo" style="
        background: var(${cssVar(`color.card.${st}.background`)});
        border: var(--border-width-card) solid var(${cssVar(`color.card.${st}.border`)});
        border-radius: var(--radius-card);
        box-shadow: var(${cssVar(`shadow.card.${st}`)});
        padding: var(--space-card-padding-y) var(--space-card-padding-x);
      ">Carte</div><span class="demo-label">${st}</span></div>`,
    )
    .join('');

  const links = Object.keys(COMP.link.color.link.default[ROLES[0]]);
  const linkGrid = roleGrid('link', 'default', links, (role, st) =>
    `<a href="#" style="color: var(${cssVar(`color.link.default.${role}.${st}.text`)}); font-size: var(--font-size-link)">Un lien</a>`);

  const secs = [
    section('badge', 'Badge', `<p class="note">Statique : un badge ne réagit pas au survol. Un seul état.</p>${badges}`),
    section('tag', 'Tag', `<p class="note">Interactif : c'est un badge qui se survole et se supprime.</p>${tags}`),
    section('alert', 'Alert', alerts),
    section('card', 'Card', `<div class="demo">${cards}</div>
      <p class="note">La carte est le seul composant qui consomme un token d'<strong>ombre</strong> :
      <code>shadow.raised</code> au repos, <code>shadow.float</code> au survol.</p>`),
    section('tooltip', 'Tooltip', `<div class="demo"><div class="demo-item"><span class="pill" style="
        background: var(--color-tooltip-default-background);
        color: var(--color-tooltip-default-text);
        border-radius: var(--radius-tooltip);
        padding: var(--space-tooltip-padding-y) var(--space-tooltip-padding-x);
        font-size: var(--font-size-tooltip);
      ">Une infobulle</span><span class="demo-label">default</span></div></div>
      <p class="note">Il consomme <code>surface.inverse</code> — le seul rôle pensé pour une rupture
      visuelle négative.</p>`),
    section('link', 'Link', linkGrid),
  ];

  return layout({
    id: 'display',
    title: '4 · Composants — affichage',
    lead: 'Badge, Tag, Alert, Card, Tooltip, Link.',
    sections: secs,
    body: renderSections(secs),
  });
};

const pageStructure = () => {
  const tabStates = Object.keys(COMP.tabs.color.tabs).filter((k) => !k.startsWith('$'));
  const tabs = tabStates
    .map(
      (st) => `<div class="tab" style="
        background: var(${cssVar(`color.tabs.${st}.background`)});
        color: var(${cssVar(`color.tabs.${st}.text`)});
        border-bottom: var(--border-width-tabs) solid var(${cssVar(`color.tabs.${st}.indicator`)});
        padding: var(--space-tabs-padding-y) var(--space-tabs-padding-x);
        font-size: var(--font-size-tabs);
      ">${st}</div>`,
    )
    .join('');

  const menuItems = Object.keys(COMP.menu.color.menu.item)
    .filter((k) => !k.startsWith('$'))
    .map(
      (st) => `<div class="menu-item" style="
        background: var(${cssVar(`color.menu.item.${st}.background`)});
        color: var(${cssVar(`color.menu.item.${st}.text`)});
      ">${st}</div>`,
    )
    .join('');

  const rowStates = Object.keys(COMP.table.color.table.row).filter((k) => !k.startsWith('$'));
  const rows = rowStates
    .map(
      (st) => `<tr style="background: var(${cssVar(`color.table.row.${st}.background`)})">
        <td style="color: var(${cssVar(`color.table.row.${st}.text`)}); border-bottom: var(--border-width-table) solid var(${cssVar(`color.table.row.${st}.border`)}); padding: var(--space-table-padding-y) var(--space-table-padding-x)">${st}</td>
        <td style="color: var(${cssVar(`color.table.row.${st}.text`)}); border-bottom: var(--border-width-table) solid var(${cssVar(`color.table.row.${st}.border`)}); padding: var(--space-table-padding-y) var(--space-table-padding-x)">Valeur</td>
      </tr>`,
    )
    .join('');

  const secs = [
    section('tabs', 'Tabs', `<div class="tabs-demo">${tabs}</div>`),
    section('menu', 'Menu', `<div class="menu-demo" style="
        background: var(--color-menu-default-background);
        border: var(--border-width-menu) solid var(--color-menu-default-border);
        border-radius: var(--radius-menu);
        box-shadow: var(--shadow-menu-default);
        padding: var(--space-menu-padding-y) var(--space-menu-padding-x);
      ">${menuItems}</div>`),
    section('table', 'Table', `<table class="tbl table-demo">
        <thead><tr>
          <th style="background: var(--color-table-header-default-background); color: var(--color-table-header-default-text); border-bottom: var(--border-width-table) solid var(--color-table-header-default-border); padding: var(--space-table-padding-y) var(--space-table-padding-x)">État de la ligne</th>
          <th style="background: var(--color-table-header-default-background); color: var(--color-table-header-default-text); border-bottom: var(--border-width-table) solid var(--color-table-header-default-border); padding: var(--space-table-padding-y) var(--space-table-padding-x)">Colonne</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`),
    section('modal', 'Modal', `<div class="modal-stage" style="background: var(--color-modal-default-scrim)">
        <div style="
          background: var(--color-modal-default-background);
          border: var(--border-width-modal) solid var(--color-modal-default-border);
          border-radius: var(--radius-modal);
          box-shadow: var(--shadow-modal-default);
          padding: var(--space-modal-padding-y) var(--space-modal-padding-x);
        "><b>Une modale</b><p class="note" style="margin:0">Posée sur <code>scrim</code>.</p></div>
      </div>
      <div class="callout callout-warn">
        <strong>Le scrim était cassé.</strong> Il pointait sur un neutre <em>teinté</em> : la luminance
        de la page ne passait que de 0,96 à 0,86, la modale ne se détachait pas. Il pointe maintenant
        sur <code>alpha.black.60</code> → 0,96 → <strong>0,13</strong>.
      </div>`),
  ];

  return layout({
    id: 'structure',
    title: '4 · Composants — structure',
    lead: "Modal, Menu, Tabs, Table. Ce sont eux qui consomment les <strong>voiles d'état neutres</strong>.",
    sections: secs,
    body: `
  <div class="callout callout-key">
    <strong>Le survol d'une ligne de tableau ou d'un item de menu utilise
    <code>state.hover</code>, pas <code>role.primary.tint</code>.</strong> Un voile de rôle
    teinterait la ligne en violet. Le voile neutre, lui, s'inverse selon le mode : il assombrit en
    clair, il éclaircit en sombre. Bascule le thème pour le voir.
  </div>
  ${renderSections(secs)}`,
  });
};

/* ---------- feuille de style de la doc ---------- */

const DOCS_CSS = `
/* Styles de la documentation. Uniquement des var() : la doc est stylée AVEC les
   tokens qu'elle documente. Si le design system casse, cette page casse avec. */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; background: var(--color-surface-base); color: var(--color-text-body);
  font-family: var(--typography-body-family); font-size: var(--font-size-body);
  line-height: var(--typography-body-line-height);
}

/* --- Navigation latérale --- */
.sidebar {
  position: fixed; inset: 0 auto 0 0; width: 260px; overflow-y: auto;
  padding: var(--space-lg); background: var(--color-surface-raised);
  border-right: var(--border-width-default) solid var(--color-border-default);
  display: flex; flex-direction: column; gap: var(--space-lg);
}
.brand {
  font-family: var(--typography-code-family); font-weight: 700;
  color: var(--color-text-body); text-decoration: none; font-size: var(--font-size-small);
}
.nav-group h5 {
  margin: 0 0 var(--space-sm); color: var(--color-text-muted);
  font-family: var(--typography-overline-family); font-size: var(--typography-overline-size);
  font-weight: var(--typography-overline-weight); line-height: var(--typography-overline-line-height);
  letter-spacing: var(--typography-overline-letter-spacing);
  text-transform: var(--typography-overline-text-case);
}
.nav-group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.nav-group a {
  display: flex; align-items: center; gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm);
  color: var(--color-text-muted); text-decoration: none; font-size: var(--font-size-small);
}
.nav-group a:hover { background: var(--color-role-primary-tint); color: var(--color-text-body); }
.nav-group a.on {
  background: var(--color-role-primary-tint-strong);
  color: var(--color-role-primary-text); font-weight: 600;
}
/* Caret des items dépliables (les pages à sous-menu). Pointe à droite quand
   replié, tourne vers le bas sur la page courante (sous-menu déployé). */
.nav-caret { margin-left: auto; flex: none; font-size: 0.7em; color: var(--color-text-muted); transition: transform .15s; }
.nav-group a.on .nav-caret { transform: rotate(90deg); color: var(--color-role-primary-text); }

/* Sous-menu : les ancres de la page courante. */
.nav-group ul.sub { margin: 2px 0 var(--space-sm) var(--space-md); padding-left: var(--space-sm); border-left: var(--border-width-default) solid var(--color-border-divider); gap: 0; }
.nav-group ul.sub a { padding: 3px var(--space-sm); font-size: 0.75rem; border-radius: var(--radius-sm); }
.nav-group ul.sub a.here { color: var(--color-role-primary-text); font-weight: 600; background: var(--color-role-primary-tint); }
.settings { margin-top: auto; }
.settings-btn {
  width: 100%; cursor: pointer; background: var(--color-surface-base);
  color: var(--color-text-body); text-align: left;
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-md); padding: var(--space-sm);
  font-family: inherit; font-size: var(--font-size-small);
}
.settings-btn:hover { border-color: var(--color-role-primary-main); color: var(--color-role-primary-text); }
.settings-modal {
  margin: auto; width: min(92vw, 380px); max-height: 86vh; overflow-y: auto;
  padding: var(--space-modal-padding-y) var(--space-modal-padding-x);
  color: var(--color-text-body);
  background: var(--color-modal-default-background);
  border: var(--border-width-modal) solid var(--color-modal-default-border);
  border-radius: var(--radius-modal); box-shadow: var(--shadow-modal-default);
}
.settings-modal::backdrop { background: var(--color-modal-default-scrim); }
.settings-modal[open] { display: flex; flex-direction: column; gap: var(--space-modal-gap); }
.settings-modal-head { display: flex; align-items: center; justify-content: space-between; }
.settings-modal-title {
  font-family: var(--typography-h3-family); font-size: var(--typography-h3-size);
  font-weight: var(--typography-h3-weight);
}
.settings-close {
  cursor: pointer; background: none; border: none; padding: var(--space-xs);
  color: var(--color-text-muted); font-size: var(--font-size-lead); line-height: 1;
  border-radius: var(--radius-sm);
}
.settings-close:hover { color: var(--color-text-body); background: var(--color-state-hover); }
.settings-group { display: flex; flex-direction: column; gap: var(--space-sm); }
.settings-label {
  color: var(--color-text-muted);
  font-family: var(--typography-overline-family); font-size: var(--typography-overline-size);
  font-weight: var(--typography-overline-weight); letter-spacing: var(--typography-overline-letter-spacing);
  text-transform: var(--typography-overline-text-case);
}
.seg { display: flex; gap: 2px; }
.seg button {
  flex: 1; cursor: pointer; padding: var(--space-xs) var(--space-sm);
  background: var(--color-surface-raised); color: var(--color-text-muted);
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-sm); font-family: inherit; font-size: var(--font-size-small);
}
.seg button.active {
  background: var(--color-role-primary-tint); color: var(--color-role-primary-text);
  border-color: var(--color-role-primary-main); font-weight: 600;
}
.swatch-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xs); }
.swatch-pick {
  display: flex; align-items: center; gap: var(--space-xs); cursor: pointer; text-align: left;
  padding: var(--space-xs); background: var(--color-surface-raised); color: var(--color-text-muted);
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-sm); font-family: var(--typography-code-family); font-size: 0.75rem;
}
.swatch-pick:hover { border-color: var(--color-border-strong); color: var(--color-text-body); }
.swatch-pick.active { border-color: var(--color-role-primary-main); color: var(--color-text-body); font-weight: 600; }
.swatch-dot {
  width: 14px; height: 14px; flex: none; border-radius: var(--radius-full);
  border: var(--border-width-default) solid var(--color-border-default);
}
.font-grid { display: grid; gap: var(--space-xs); }
.font-pick {
  cursor: pointer; text-align: left; padding: var(--space-xs) var(--space-sm);
  background: var(--color-surface-raised); color: var(--color-text-body);
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-sm); font-size: var(--font-size-body);
}
.font-pick:hover { border-color: var(--color-border-strong); }
.font-pick.active { border-color: var(--color-role-primary-main); color: var(--color-role-primary-text); font-weight: 600; }
.burger {
  display: none; position: fixed; top: var(--space-sm); left: var(--space-sm); z-index: 30;
  background: var(--color-surface-raised); color: var(--color-text-body);
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-sm); padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-size-body); cursor: pointer;
}

/* --- Contenu --- */
.main { margin-left: 260px; }
.page { max-width: 900px; padding: var(--space-xl); }
/* La doc se sert de ses propres rôles : chaque niveau de titre prend le sien,
   crénage compris. C'est le seul test honnête d'un rôle — s'il ne suffit pas à
   styler l'élément, c'est qu'il est incomplet. */
h1 {
  font-family: var(--typography-h1-family); font-weight: var(--typography-h1-weight);
  line-height: var(--typography-h1-line-height); letter-spacing: var(--typography-h1-letter-spacing);
}
h2 {
  font-family: var(--typography-h2-family); font-weight: var(--typography-h2-weight);
  line-height: var(--typography-h2-line-height); letter-spacing: var(--typography-h2-letter-spacing);
}
h3, h4 {
  font-family: var(--typography-h3-family); font-weight: var(--typography-h3-weight);
  line-height: var(--typography-h3-line-height); letter-spacing: var(--typography-h3-letter-spacing);
}
h1 { font-size: var(--font-size-h1); margin: 0 0 var(--space-sm); }
h2 {
  font-size: var(--font-size-h2); margin: var(--space-xl) 0 var(--space-md);
  padding-top: var(--space-lg); scroll-margin-top: var(--space-md);
  border-top: var(--border-width-default) solid var(--color-border-divider);
}
h3 { font-size: var(--font-size-h3); margin: var(--space-lg) 0 var(--space-sm); }
h4 { font-size: var(--font-size-body); margin: 0 0 var(--space-xs); }
p { margin: 0 0 var(--space-md); }
.lead { font-size: var(--font-size-lead); color: var(--color-text-muted); margin-bottom: var(--space-lg); }
code {
  font-family: var(--typography-code-family); font-size: 0.875em;
  background: var(--color-surface-raised); padding: .1em .35em; border-radius: var(--radius-sm);
}
pre {
  background: var(--color-surface-raised);
  border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-md); padding: var(--space-md); overflow-x: auto;
}
pre code { background: none; padding: 0; font-size: .8125rem; line-height: 1.6; }
pre .c { color: var(--color-text-muted); }
/* Liens de contenu (table de consommation, prose). Sans règle, ils tombaient sur
   le bleu/violet par défaut du navigateur — illisible sur fond sombre. Le rôle
   primary.text est fait pour un lien et s'inverse entre les modes (700 en clair,
   400 en sombre) : lisible dans les deux. Les liens à classe (.lyr, .pg…) gardent
   leur style propre. Le <code> imbriqué hérite de cette couleur. */
.page a:not([class]) { color: var(--color-role-primary-text); text-underline-offset: 2px; }
.page a:not([class]):hover { color: var(--color-role-primary-hover); }
/* La pilule <code> d'un lien pose son fond sur surface-base, pas -raised : le
   contrat de rôle ne garantit le contraste de role.text que contre surface.base.
   Sur -raised (plus clair en sombre), le lien tombait à 4,09:1 (sous AA) ; sur
   -base il remonte à 5,75:1. */
.page a:not([class]) code { background: var(--color-surface-base); }
.note { color: var(--color-text-muted); font-size: var(--font-size-small); }
.mono { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.scroll-x { overflow-x: auto; }
.rules { padding-left: var(--space-lg); }
.rules li { margin-bottom: var(--space-xs); }

/* Damier : rend visible la transparence. */
.checker, .sw-alpha {
  background-image:
    linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%),
    linear-gradient(45deg, rgba(128,128,128,.22) 25%, transparent 25%, transparent 75%, rgba(128,128,128,.22) 75%);
  background-size: 12px 12px; background-position: 0 0, 6px 6px;
}
.sw-alpha { background-size: 8px 8px; background-position: 0 0, 4px 4px; }

.callout {
  border-left: 4px solid var(--color-border-strong); background: var(--color-surface-raised);
  padding: var(--space-md); border-radius: var(--radius-md); margin: var(--space-md) 0;
}
.callout-key { border-left-color: var(--color-role-primary-main); }
.callout-warn { border-left-color: var(--color-role-warning-main); }
.callout pre { background: var(--color-surface-base); margin: var(--space-sm) 0 0; }

.layer-num {
  display: inline-grid; place-items: center; width: 26px; height: 26px;
  border-radius: var(--radius-full); background: var(--color-role-primary-main);
  color: var(--color-role-primary-on); font-size: .75rem; font-weight: 700;
}
.layers { display: flex; gap: var(--space-xs); flex-wrap: wrap; margin-bottom: var(--space-md); }
.lyr {
  flex: 1 1 160px; border: var(--border-width-default) solid var(--color-border-default);
  border-radius: var(--radius-md); padding: var(--space-md);
  background: var(--color-surface-raised); text-decoration: none; color: inherit;
}
.lyr:hover { border-color: var(--color-role-primary-main); }
.lyr b { display: block; margin-top: var(--space-xs); }
.lyr em { display: block; color: var(--color-text-muted); font-size: var(--font-size-small); font-style: normal; }
.lyr small { display: block; margin-top: var(--space-sm); font-family: var(--typography-code-family); font-size: .75rem; color: var(--color-text-muted); }
.lyr-key { border-color: var(--color-role-primary-main); border-width: var(--border-width-strong); }
.lyr-arrow { display: grid; place-items: center; color: var(--color-text-muted); }

.ramps { display: grid; gap: var(--space-xs); }
.ramp { display: grid; grid-template-columns: 90px 1fr 96px; align-items: center; gap: var(--space-sm); }
.ramp-head .hd { font-size: .625rem; font-family: var(--typography-code-family); color: var(--color-text-muted); text-align: center; }
.ramp-name { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.ramp-swatches { display: grid; grid-template-columns: repeat(11, 1fr); gap: 2px; }
.ramp-alphas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; }
.sw { aspect-ratio: 1.5; border-radius: var(--radius-sm); display: grid; place-items: center; cursor: help; }
.sw-alpha { border: var(--border-width-default) solid var(--color-border-default); }
.sw-alpha .sw-step { color: var(--color-text-muted); }
.sw-step { font-size: .625rem; font-family: var(--typography-code-family); opacity: .75; }

.brand-table { display: grid; gap: var(--space-xs); }
.brand-row { display: grid; grid-template-columns: 84px 18px 84px 1fr; align-items: center; gap: var(--space-sm); padding: var(--space-xs); border-radius: var(--radius-sm); }
.brand-row:hover { background: var(--color-role-primary-tint); }
.brand-role, .brand-palette { font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.brand-palette { color: var(--color-role-primary-text); font-weight: 600; }
.brand-arrow { color: var(--color-text-muted); }
.brand-strip { display: flex; gap: 2px; }
.brand-strip i { flex: 1; height: 22px; border-radius: 2px; }
.brand-specimen { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cats { display: flex; gap: var(--space-md); flex-wrap: wrap; }
.cat { display: grid; justify-items: center; gap: 4px; }
.cat i { display: block; width: 48px; height: 48px; border-radius: var(--radius-md); }
.cat span { font-size: .6875rem; font-family: var(--typography-code-family); color: var(--color-text-muted); }

.roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-lg); }
.role-group h4 {
  color: var(--color-text-muted);
  font-family: var(--typography-overline-family); font-size: var(--typography-overline-size);
  font-weight: var(--typography-overline-weight); line-height: var(--typography-overline-line-height);
  letter-spacing: var(--typography-overline-letter-spacing);
  text-transform: var(--typography-overline-text-case);
}
.role-list { display: grid; gap: var(--space-sm); }
.role { display: grid; grid-template-columns: 28px 1fr; column-gap: var(--space-sm); align-items: start; }
.role-chip { grid-row: 1 / 3; width: 28px; height: 28px; border-radius: var(--radius-sm); border: var(--border-width-default) solid var(--color-border-default); }
.role-name { font-size: var(--font-size-small); font-family: var(--typography-code-family); }
.role-desc { font-size: .6875rem; color: var(--color-text-muted); }

.tbl { width: 100%; border-collapse: collapse; font-size: var(--font-size-small); }
.tbl th { text-align: left; padding: var(--space-xs) var(--space-sm); border-bottom: var(--border-width-strong) solid var(--color-border-default); color: var(--color-text-muted); font-weight: 600; font-size: .6875rem; font-family: var(--typography-code-family); }
.tbl td { padding: var(--space-xs) var(--space-sm); border-bottom: var(--border-width-default) solid var(--color-border-divider); vertical-align: top; }
.tbl tr.changed { background: var(--color-role-primary-tint); }

/* Table de consommation d'un composant : tout est visible, rien n'est replié.
   Les grosses familles défilent dans leur cadre plutôt que d'inonder la page. */
.tok { border: var(--border-width-default) solid var(--color-border-divider); border-radius: var(--radius-sm); margin-bottom: var(--space-sm); }
.tok-head { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; padding: var(--space-xs) var(--space-sm); background: var(--color-surface-raised); border-bottom: var(--border-width-default) solid var(--color-border-divider); border-radius: var(--radius-sm) var(--radius-sm) 0 0; }
.tok-to { margin-left: auto; font-size: .6875rem; color: var(--color-text-muted); }
.tok-body { max-height: 360px; overflow: auto; }
.tok-body .tbl { margin: 0; }
.tok-body thead th { position: sticky; top: 0; background: var(--color-surface-base); z-index: 1; }
.tok-body .tbl td { border-bottom: none; padding-top: 2px; padding-bottom: 2px; }
.tok-body tr:hover { background: var(--color-role-primary-tint); }
.tbl .rh { color: var(--color-text-body); font-size: var(--font-size-small); white-space: nowrap; border-bottom: var(--border-width-default) solid var(--color-border-divider); }
.tag { display: inline-block; background: var(--color-role-primary-main); color: var(--color-role-primary-on); border-radius: var(--radius-sm); padding: 0 .35em; font-size: .6875rem; }
.contract td { padding: 3px; }
.slot { width: 100%; min-width: 52px; height: 32px; border-radius: var(--radius-sm); border: var(--border-width-default) solid var(--color-border-divider); }

.shadow-box { width: 120px; height: 72px; border-radius: var(--radius-md); background: var(--color-surface-base); border: var(--border-width-default) solid var(--color-border-divider); }
.motion-demo { width: 14px; height: 14px; border-radius: var(--radius-full); background: var(--color-role-primary-main); animation: slide 1.4s infinite alternate var(--motion-easing-default); }
@keyframes slide { from { transform: translateX(0); } to { transform: translateX(60px); } }
.ctl { display: grid; place-items: center; font-size: 11px; line-height: 1; }
.sw-track { display: flex; align-items: center; padding: 2px; }
.sw-track i { display: block; border-radius: var(--radius-full); }
.pill { display: inline-flex; align-items: center; white-space: nowrap; font-family: var(--typography-body-family); }
.alerts { display: grid; gap: var(--space-sm); }
.alert { display: flex; align-items: flex-start; font-size: var(--font-size-small); }
.alert p { font-size: var(--font-size-small); }
.card-demo { width: 160px; }
.demo-select { display: inline-flex; align-items: center; justify-content: space-between; gap: var(--space-sm); min-width: 140px; }
.tabs-demo { display: flex; gap: var(--space-xs); border-bottom: var(--border-width-default) solid var(--color-border-divider); }
.tab { font-family: var(--typography-code-family); }
.menu-demo { width: 220px; }
.menu-item { padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); font-size: var(--font-size-small); font-family: var(--typography-code-family); }
.table-demo th, .table-demo td { border-bottom: 0; }
.modal-stage { display: grid; place-items: center; padding: var(--space-xl); border-radius: var(--radius-md); }
.tiny { font-size: 0.6875rem; }
.btn-grid td { padding: var(--space-xs); }
.demo { display: flex; flex-wrap: wrap; gap: var(--space-lg); align-items: flex-end; padding: var(--space-lg); background: var(--color-surface-raised); border-radius: var(--radius-md); border: var(--border-width-default) solid var(--color-border-default); }
.demo-item { display: grid; gap: var(--space-xs); justify-items: center; }
.demo-btn, .demo-input { cursor: default; white-space: nowrap; }
.demo-label { font-size: .6875rem; color: var(--color-text-muted); font-family: var(--typography-code-family); }

.chain { list-style: none; padding: 0; margin: 0 0 var(--space-md); display: grid; gap: 2px; }
.chain-step { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm); background: var(--color-surface-raised); border-left: 4px solid var(--color-border-strong); }
.chain-step code { background: none; padding: 0; }
.chain-step + .chain-step { margin-left: var(--space-lg); }
.chain-layer {
  min-width: 72px; color: var(--color-text-muted);
  font-family: var(--typography-overline-family); font-size: var(--typography-overline-size);
  font-weight: var(--typography-overline-weight);
  letter-spacing: var(--typography-overline-letter-spacing);
  text-transform: var(--typography-overline-text-case);
}
.chain-component { border-left-color: var(--color-role-primary-main); }
.chain-semantic  { border-left-color: var(--color-role-info-main); }
.chain-brand     { border-left-color: var(--color-role-warning-main); }
.chain-primitive { border-left-color: var(--color-role-success-main); }
.chain-final { margin-left: auto; display: flex; align-items: center; gap: var(--space-xs); font-family: var(--typography-code-family); font-size: var(--font-size-small); }
.chain-final i { width: 16px; height: 16px; border-radius: 3px; }

.steps { padding-left: var(--space-lg); display: grid; gap: var(--space-xl); margin: 0; }
.steps > li::marker { color: var(--color-role-primary-main); font-weight: 700; }
.steps h3 { margin-top: 0; border: 0; padding: 0; }

.pager { display: flex; justify-content: space-between; gap: var(--space-md); margin-top: var(--space-xl); padding-top: var(--space-lg); border-top: var(--border-width-default) solid var(--color-border-default); }
.pg { display: grid; gap: 2px; padding: var(--space-md); border: var(--border-width-default) solid var(--color-border-default); border-radius: var(--radius-md); text-decoration: none; color: var(--color-text-body); min-width: 200px; }
.pg:hover { border-color: var(--color-role-primary-main); background: var(--color-role-primary-tint); }
.pg span { font-size: .6875rem; color: var(--color-text-muted); }
.pg-next { text-align: right; }

@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); transition: transform .2s; z-index: 20; width: 240px; }
  .sidebar.open { transform: none; }
  .burger { display: block; }
  .main { margin-left: 0; }
  .page { padding: calc(var(--space-xl) * 2) var(--space-md) var(--space-xl); }
  .ramp { grid-template-columns: 1fr; }
  .lyr-arrow { display: none; }
  .pager { flex-direction: column; }
  .pg-next { text-align: left; }
}
`;

/* ---------- écriture ---------- */

mkdirSync(OUT, { recursive: true });

// Purge les fichiers d'un build précédent : une page supprimée du générateur
// resterait sinon sur le disque, avec des var() périmées et des liens morts.
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.html') || f.endsWith('.css')) rmSync(`${OUT}/${f}`);
}

// Le CSS des tokens est copié une seule fois et lié par toutes les pages —
// l'inliner dans chacune dupliquerait 40 Ko × 6.
copyFileSync('dist/tokens.css', `${OUT}/tokens.css`);
copyFileSync('dist/components.css', `${OUT}/components.css`);
writeFileSync(`${OUT}/docs.css`, DOCS_CSS.trimStart());

const PAGES = {
  'index.html': pageIndex(),
  'demarrer.html': pageStart(),
  'primitives.html': pagePrimitives(),
  'brand.html': pageBrand(),
  'roles.html': pageRoles(),
  'semantique.html': pageSemantic(),
  'effets.html': pageEffects(),
  'composants-formulaire.html': pageForm(),
  'composants-affichage.html': pageDisplay(),
  'composants-structure.html': pageStructure(),
};

for (const [file, html] of Object.entries(PAGES)) writeFileSync(`${OUT}/${file}`, html);

console.log(`  ✔ ${OUT}/ — ${Object.keys(PAGES).length} pages + tokens.css + docs.css`);
