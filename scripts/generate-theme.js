/**
 * Génère la couche brand, la couche sémantique (light/dark) et les tokens de
 * composant, à partir des tables de mapping ci-dessous.
 *
 * POURQUOI GÉNÉRER. Le contrat de rôle impose que les 6 rôles (primary, neutral,
 * success, warning, danger, info) exposent EXACTEMENT les mêmes slots, mappés sur
 * EXACTEMENT les mêmes crans. C'est cette uniformité qui garantit le contraste :
 * `<Button color="danger">` est aussi lisible que `<Button color="primary">`,
 * sans qu'on ait à le vérifier à la main. Écrire ces ~500 tokens à la main, c'est
 * garantir qu'ils divergeront — c'est exactement ce qui est arrivé au fichier
 * Kazaar (`warning.main` au cran 300 quand `error.main` est au 500 ; l'alpha de
 * `secondary` qui pointe sur la teinte de `info`…).
 *
 * Les tables ci-dessous SONT la décision de design. Le reste est mécanique.
 *
 *   node scripts/generate-theme.js
 */
import { writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------ *
 * 1. BRAND — quelle palette joue quel rôle. Le fichier d'un projet.
 * ------------------------------------------------------------------ */

const BRAND = {
  primary: 'violet',
  neutral: 'slateBlue',
  success: 'green',
  warning: 'orange',
  danger: 'red',
  info: 'blue',
};

/**
 * Quelle PILE DE POLICES joue quel rôle. Exactement le même geste que `BRAND`
 * ci-dessus : la couche brand ne fait que DÉSIGNER, elle n'invente aucune valeur.
 *
 * C'est ce qui rend la typo rebrandable en une ligne, comme la couleur. Avant,
 * « Inter » était écrit en dur dans les primitives : changer de police obligeait
 * à toucher la couche primitive, c'est-à-dire à réécrire le catalogue au lieu de
 * choisir dedans. Les rôles typo (`typography.*`) pointent tous ici, jamais sur
 * `font.stack.*` — c'est la règle de layering qui rend le rebranding possible.
 *
 * Les valeurs sont des clés de `font.stack` (voir primitives/typography.json).
 */
// Nommé par USAGE (titre / corps / code), pas par classification (sans/serif) :
// c'est le brand, il exprime un rôle. Titres et corps portent volontairement deux
// polices distinctes — ici un contraste sans / mono (esprit terminal).
const BRAND_FONT = {
  heading: 'inter',
  body:    'jetbrainsMono',
  mono:    'jetbrainsMono',
};

/** Couleurs catégorielles (graphiques, avatars, tags) : des teintes distinguables. */
const CATEGORICAL = ['violet', 'blue', 'green', 'orange', 'red', 'turquoise'];

const STEPS = ['25', '50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
const ALPHAS = ['5', '10'];

/* ------------------------------------------------------------------ *
 * 2. LE CONTRAT DE RÔLE — 9 slots, le même mapping pour les 6 rôles.
 *
 * `on` et `text` sont volontairement distincts : `main` n'a pas forcément
 * assez de contraste pour être lu comme du texte sur un fond clair.
 * ------------------------------------------------------------------ */

const ROLE_SLOTS = {
  main:       { light: '600',      dark: '400',      desc: 'Fond des composants pleins (bouton, badge, case cochée) et bordure du rôle.' },
  hover:      { light: '700',      dark: '300',      desc: 'Élévation au survol d’un composant plein.' },
  active:     { light: '800',      dark: '200',      desc: 'Élévation à l’état pressé.' },
  on:         { light: 'NEUTRAL:25', dark: 'NEUTRAL:900', desc: 'Texte et icônes posés SUR une surface « main ». Contraste AA garanti.' },
  text:       { light: '700',      dark: '400',      desc: 'Le rôle utilisé comme texte sur un fond clair (lien, texte d’alerte).' },
  border:     { light: '300',      dark: '700',      desc: 'Bordure discrète aux couleurs du rôle (outlined, alerte).' },
  subtle:     { light: '50',       dark: '900',      desc: 'Fond clair SOLIDE (fond d’alerte, badge doux).' },
  tint:       { light: 'ALPHA:5',  dark: 'ALPHA:5',  desc: 'Voile TRANSLUCIDE 5 % — survol des variantes outlined/ghost. Se compose sur le fond, donc identique en dark.' },
  tintStrong: { light: 'ALPHA:10', dark: 'ALPHA:10', desc: 'Voile translucide 10 % — état pressé des variantes outlined/ghost.' },
};

/* ------------------------------------------------------------------ *
 * 3. LE RESTE DE LA COUCHE SÉMANTIQUE.
 *
 * `surface.*` est le SEUL groupe qui parle de fonds. Le voile alpha des rôles
 * s'appelle `tint`, jamais `surface` : le fichier Kazaar surchargeait le mot
 * (« couche de fond » ET « voile d'interaction »), ce qui le rendait illisible.
 * ------------------------------------------------------------------ */

const SEMANTIC = {
  surface: {
    base:     { light: 'NEUTRAL:25',  dark: 'NEUTRAL:900', desc: 'Fond de l’application.' },
    raised:   { light: 'NEUTRAL:50',  dark: 'NEUTRAL:800', desc: 'Fond d’un bloc surélevé (carte, panneau).' },
    overlay:  { light: 'NEUTRAL:25',  dark: 'NEUTRAL:700', desc: 'Fond d’un élément flottant (popover, menu, modale).' },
    sunken:   { light: 'NEUTRAL:100', dark: 'NEUTRAL:900', desc: 'Fond en creux (piste de slider, zone de dépôt).' },
    inverse:  { light: 'NEUTRAL:900', dark: 'NEUTRAL:25',  desc: 'Rupture visuelle négative (tooltip, bandeau).' },
    disabled: { light: 'NEUTRAL:100', dark: 'NEUTRAL:800', desc: 'Fond d’un composant désactivé.' },
    transparent: { light: 'TRANSPARENT', dark: 'TRANSPARENT', desc: 'Fond absent (variantes outlined/ghost).' },
  },
  /**
   * Six niveaux de texte. L'échelle à quatre niveaux d'avant était trop plate :
   * une hiérarchie réelle a besoin d'un cran AU-DESSUS du corps de texte (titres)
   * et d'un cran EN DESSOUS du texte atténué (séparateurs, échafaudage).
   */
  text: {
    strong:   { light: 'NEUTRAL:900', dark: 'NEUTRAL:25',  desc: 'Titres et libellés d’interface appuyés. Le contraste maximal.' },
    body:     { light: 'NEUTRAL:800', dark: 'NEUTRAL:100', desc: 'Texte de lecture.' },
    muted:    { light: 'NEUTRAL:600', dark: 'NEUTRAL:300', desc: 'Texte secondaire (légende, description).' },
    faint:    { light: 'NEUTRAL:400', dark: 'NEUTRAL:500', desc: '⚠ NE PASSE PAS AA — décoratif uniquement (séparateurs, échafaudage). Jamais pour du texte à lire.' },
    disabled: { light: 'NEUTRAL:300', dark: 'NEUTRAL:600', desc: 'Texte d’un composant désactivé.' },
    inverse:  { light: 'NEUTRAL:25',  dark: 'NEUTRAL:900', desc: 'Texte posé sur `surface.inverse`.' },
  },
  border: {
    default:  { light: 'NEUTRAL:200', dark: 'NEUTRAL:700', desc: 'Bordure par défaut de tous les composants.' },
    strong:   { light: 'NEUTRAL:400', dark: 'NEUTRAL:500', desc: 'Bordure appuyée.' },
    divider:  { light: 'NEUTRAL:100', dark: 'NEUTRAL:800', desc: 'Séparateur entre deux blocs de contenu.' },
    disabled: { light: 'NEUTRAL:200', dark: 'NEUTRAL:700', desc: 'Bordure d’un composant désactivé.' },
    transparent: { light: 'TRANSPARENT', dark: 'TRANSPARENT', desc: 'Bordure absente.' },
  },
  /**
   * Voiles d'état NEUTRES — et c'est le seul groupe qui s'INVERSE entre les modes :
   * en clair on assombrit (noir translucide), en sombre on éclaircit (blanc).
   * À ne pas confondre avec `role.X.tint`, qui teinte à la couleur du rôle.
   * Ici, aucune teinte : une ligne de tableau survolée ne doit pas virer au bleu.
   */
  state: {
    hover:    { light: 'BLACK:4',  dark: 'WHITE:4',  desc: 'Voile de survol neutre (ligne de tableau, item de liste).' },
    selected: { light: 'BLACK:8',  dark: 'WHITE:8',  desc: 'Voile d’un élément sélectionné.' },
    active:   { light: 'BLACK:12', dark: 'WHITE:12', desc: 'Voile d’un élément pressé.' },
  },
};

/** Anneau de focus — absent du fichier Kazaar, et c'est bloquant pour l'accessibilité. */
const FOCUS = {
  ring: { light: 'PRIMARY:500', dark: 'PRIMARY:400', desc: 'Anneau de focus clavier. Doit rester visible sur tous les fonds.' },
};

/**
 * Voile des modales / drawers. DOIT être noir : il pointait auparavant sur un
 * neutre teinté (slateBlue à 10 %), qui ne faisait passer la luminance de la page
 * que de 0,96 à 0,86 — la modale ne se détachait pas.
 */
const SCRIM = { light: 'BLACK:60', dark: 'BLACK:60', desc: 'Voile assombrissant sous une modale ou un drawer.' };

/**
 * Ombres portées. La GÉOMÉTRIE vient des primitives (elevation.*), la COULEUR est
 * choisie ici car elle dépend du mode : sur fond sombre, une ombre doit être bien
 * plus opaque pour rester lisible.
 */
const SHADOWS = {
  raised:  { geometry: 'raised',  light: 'BLACK:8',  dark: 'BLACK:40', desc: 'Légère élévation (carte au repos).' },
  float:   { geometry: 'float',   light: 'BLACK:16', dark: 'BLACK:60', desc: 'Élément flottant (carte au survol, dropdown).' },
  overlay: { geometry: 'overlay', light: 'BLACK:40', dark: 'BLACK:60', desc: 'Élément détaché de la page (modale, drawer).' },
};

/* ------------------------------------------------------------------ *
 * Résolution des raccourcis de mapping.
 * ------------------------------------------------------------------ */

/** `600` | `NEUTRAL:25` | `ALPHA:5` | `WHITE:4` | `BLACK:60` | `TRANSPARENT` | `PRIMARY:500` */
function refFor(spec, role) {
  if (spec === 'TRANSPARENT') return '{color.transparent}';
  if (spec.startsWith('WHITE:')) return `{color.alpha.white.${spec.split(':')[1]}}`;
  if (spec.startsWith('BLACK:')) return `{color.alpha.black.${spec.split(':')[1]}}`;
  if (spec.startsWith('NEUTRAL:ALPHA:')) return `{color.brand.neutral.alpha.${spec.split(':')[2]}}`;
  if (spec.startsWith('NEUTRAL:')) return `{color.brand.neutral.${spec.split(':')[1]}}`;
  if (spec.startsWith('PRIMARY:')) return `{color.brand.primary.${spec.split(':')[1]}}`;
  if (spec.startsWith('ALPHA:')) return `{color.brand.${role}.alpha.${spec.split(':')[1]}}`;
  return `{color.brand.${role}.${spec}}`;
}

const token = ($value, $description) =>
  $description ? { $value, $description } : { $value };

/* ------------------------------------------------------------------ *
 * Génération.
 * ------------------------------------------------------------------ */

function buildBrand() {
  const brand = {};
  for (const [role, palette] of Object.entries(BRAND)) {
    brand[role] = { $description: `Rôle « ${role} » — joué par la palette « ${palette} ».` };
    for (const s of STEPS) brand[role][s] = token(`{color.${palette}.${s}}`);
    brand[role].alpha = {};
    for (const a of ALPHAS) brand[role].alpha[a] = token(`{color.${palette}.alpha.${a}}`);
  }
  brand.categorical = { $description: 'Teintes distinguables pour graphiques, avatars et tags.' };
  CATEGORICAL.forEach((palette, i) => {
    brand.categorical[i + 1] = {
      main: token(`{color.${palette}.600}`),
      tint: token(`{color.${palette}.alpha.10}`),
    };
  });

  // Les familles : même structure que la couleur — `font.brand.*` fait écho à
  // `color.brand.*`. Un projet qui se rebrande touche ces deux blocs, et rien d'autre.
  const font = { $type: 'fontFamily' };
  for (const [slot, stack] of Object.entries(BRAND_FONT)) {
    font[slot] = token(`{font.stack.${stack}}`, `Famille « ${slot} » — jouée par la pile « ${stack} ».`);
  }

  return { color: { $type: 'color', brand }, font: { brand: font } };
}

function buildTheme(mode) {
  const role = {};
  for (const roleName of Object.keys(BRAND)) {
    role[roleName] = {};
    for (const [slot, def] of Object.entries(ROLE_SLOTS)) {
      role[roleName][slot] = token(refFor(def[mode], roleName), def.desc);
    }
  }

  const out = { role };
  for (const [group, entries] of Object.entries(SEMANTIC)) {
    out[group] = {};
    for (const [name, def] of Object.entries(entries)) {
      out[group][name] = token(refFor(def[mode], 'neutral'), def.desc);
    }
  }
  out.focus = {};
  for (const [name, def] of Object.entries(FOCUS)) {
    out.focus[name] = token(refFor(def[mode], 'primary'), def.desc);
  }
  out.scrim = token(refFor(SCRIM[mode], 'neutral'), SCRIM.desc);

  out.categorical = {};
  CATEGORICAL.forEach((_, i) => {
    const n = i + 1;
    out.categorical[n] = {
      main: token(`{color.brand.categorical.${n}.main}`),
      tint: token(`{color.brand.categorical.${n}.tint}`),
    };
  });

  // Ombres : géométrie depuis les primitives, couleur selon le mode.
  const shadow = { $type: 'shadow' };
  for (const [name, def] of Object.entries(SHADOWS)) {
    shadow[name] = {
      $value: {
        offsetX: '0',
        offsetY: `{elevation.${def.geometry}.offsetY}`,
        blur: `{elevation.${def.geometry}.blur}`,
        spread: `{elevation.${def.geometry}.spread}`,
        color: refFor(def[mode], 'neutral'),
      },
      $description: def.desc,
    };
  }

  return { color: { $type: 'color', ...out }, shadow };
}

const write = (path, data) => {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  const count = JSON.stringify(data).match(/"\$value"/g)?.length ?? 0;
  console.log(`  ✔ ${path.padEnd(38)} ${String(count).padStart(3)} tokens`);
};

write('tokens/brand/default.json', buildBrand());
write('tokens/themes/mode/light.json', buildTheme('light'));
write('tokens/themes/mode/dark.json', buildTheme('dark'));
