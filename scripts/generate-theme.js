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
  text: {
    body:     { light: 'NEUTRAL:900', dark: 'NEUTRAL:25',  desc: 'Texte de lecture.' },
    muted:    { light: 'NEUTRAL:600', dark: 'NEUTRAL:300', desc: 'Texte secondaire, moins appuyé.' },
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
};

/** Anneau de focus — absent du fichier Kazaar, et c'est bloquant pour l'accessibilité. */
const FOCUS = {
  ring: { light: 'PRIMARY:500', dark: 'PRIMARY:400', desc: 'Anneau de focus clavier. Doit rester visible sur tous les fonds.' },
};

/** Voile des modales / drawers. */
const SCRIM = { light: 'NEUTRAL:ALPHA:10', dark: 'NEUTRAL:ALPHA:10', desc: 'Voile assombrissant sous une modale ou un drawer.' };

/* ------------------------------------------------------------------ *
 * 4. COMPOSANTS — la variante décide QUELS slots du rôle elle consomme.
 *
 * C'est la seule connaissance propre au composant : « au survol, un bouton
 * outlined prend le voile `tint`, pas le fond `subtle` ». Le rôle, lui, reste
 * un paramètre — d'où la génération pour les 6 rôles.
 *
 * Valeur = un slot du rôle courant, ou `{...}` = référence absolue.
 * ------------------------------------------------------------------ */

const BUTTON_VARIANTS = {
  filled: {
    default:  { background: 'main',       text: 'on',   border: 'main' },
    hover:    { background: 'hover',      text: 'on',   border: 'hover' },
    active:   { background: 'active',     text: 'on',   border: 'active' },
    disabled: { background: '{color.surface.disabled}', text: '{color.text.disabled}', border: '{color.border.disabled}' },
  },
  outlined: {
    default:  { background: '{color.surface.transparent}', text: 'text', border: 'border' },
    hover:    { background: 'tint',       text: 'text', border: 'main' },
    active:   { background: 'tintStrong', text: 'text', border: 'main' },
    disabled: { background: '{color.surface.transparent}', text: '{color.text.disabled}', border: '{color.border.disabled}' },
  },
  ghost: {
    default:  { background: '{color.surface.transparent}', text: 'text', border: '{color.border.transparent}' },
    hover:    { background: 'tint',       text: 'text', border: '{color.border.transparent}' },
    active:   { background: 'tintStrong', text: 'text', border: '{color.border.transparent}' },
    disabled: { background: '{color.surface.transparent}', text: '{color.text.disabled}', border: '{color.border.transparent}' },
  },
};

const INPUT_STATES = {
  default:  { background: '{color.surface.base}',     text: '{color.text.body}',     border: '{color.border.default}' },
  hover:    { background: '{color.surface.base}',     text: '{color.text.body}',     border: '{color.border.strong}' },
  focus:    { background: '{color.surface.base}',     text: '{color.text.body}',     border: '{color.role.primary.main}' },
  disabled: { background: '{color.surface.disabled}', text: '{color.text.disabled}', border: '{color.border.disabled}' },
  error:    { background: '{color.surface.base}',     text: '{color.text.body}',     border: '{color.role.danger.main}' },
};

/* ------------------------------------------------------------------ *
 * Résolution des raccourcis de mapping.
 * ------------------------------------------------------------------ */

/** `600` | `NEUTRAL:25` | `ALPHA:5` | `TRANSPARENT` | `PRIMARY:500` → référence complète. */
function refFor(spec, role, mode) {
  if (spec === 'TRANSPARENT') return '{color.transparent}';
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
  return { color: { $type: 'color', brand } };
}

function buildTheme(mode) {
  const role = {};
  for (const roleName of Object.keys(BRAND)) {
    role[roleName] = {};
    for (const [slot, def] of Object.entries(ROLE_SLOTS)) {
      role[roleName][slot] = token(refFor(def[mode], roleName, mode), def.desc);
    }
  }

  const out = { role };
  for (const [group, entries] of Object.entries(SEMANTIC)) {
    out[group] = {};
    for (const [name, def] of Object.entries(entries)) {
      out[group][name] = token(refFor(def[mode], 'neutral', mode), def.desc);
    }
  }
  out.focus = {};
  for (const [name, def] of Object.entries(FOCUS)) {
    out.focus[name] = token(refFor(def[mode], 'primary', mode), def.desc);
  }
  out.scrim = token(refFor(SCRIM[mode], 'neutral', mode), SCRIM.desc);

  out.categorical = {};
  CATEGORICAL.forEach((_, i) => {
    const n = i + 1;
    out.categorical[n] = {
      main: token(`{color.brand.categorical.${n}.main}`),
      tint: token(`{color.brand.categorical.${n}.tint}`),
    };
  });

  return { color: { $type: 'color', ...out } };
}

function buildButton() {
  const button = {};
  for (const [variant, states] of Object.entries(BUTTON_VARIANTS)) {
    button[variant] = {};
    for (const roleName of Object.keys(BRAND)) {
      button[variant][roleName] = {};
      for (const [state, props] of Object.entries(states)) {
        button[variant][roleName][state] = {};
        for (const [prop, spec] of Object.entries(props)) {
          const value = spec.startsWith('{') ? spec : `{color.role.${roleName}.${spec}}`;
          button[variant][roleName][state][prop] = token(value);
        }
      }
    }
  }

  return {
    color: { $type: 'color', button },
    space: {
      $type: 'dimension',
      button: {
        paddingX: token('{space.md}'),
        paddingY: token('{space.sm}'),
        gap: token('{space.xs}'),
      },
    },
    radius: { $type: 'dimension', button: token('{radius.md}') },
    borderWidth: { $type: 'dimension', button: token('{borderWidth.default}') },
    fontSize: { $type: 'dimension', button: token('{fontSize.body}') },
    typography: {
      button: {
        family: { $type: 'fontFamily', $value: '{typography.body.family}' },
        weight: { $type: 'fontWeight', $value: '{typography.heading.weight}' },
        lineHeight: { $type: 'number', $value: '{typography.body.lineHeight}' },
      },
    },
  };
}

function buildInput() {
  const input = {};
  for (const [state, props] of Object.entries(INPUT_STATES)) {
    input[state] = {};
    for (const [prop, spec] of Object.entries(props)) input[state][prop] = token(spec);
  }

  return {
    color: { $type: 'color', input },
    space: {
      $type: 'dimension',
      input: { paddingX: token('{space.sm}'), paddingY: token('{space.sm}') },
    },
    radius: { $type: 'dimension', input: token('{radius.sm}') },
    borderWidth: {
      $type: 'dimension',
      input: { default: token('{borderWidth.default}'), focus: token('{borderWidth.focus}') },
    },
    fontSize: { $type: 'dimension', input: token('{fontSize.body}') },
    typography: {
      input: {
        family: { $type: 'fontFamily', $value: '{typography.body.family}' },
        weight: { $type: 'fontWeight', $value: '{typography.body.weight}' },
        lineHeight: { $type: 'number', $value: '{typography.body.lineHeight}' },
      },
    },
  };
}

const write = (path, data) => {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  const count = JSON.stringify(data).match(/"\$value"/g)?.length ?? 0;
  console.log(`  ✔ ${path.padEnd(38)} ${String(count).padStart(3)} tokens`);
};

write('tokens/brand/default.json', buildBrand());
write('tokens/themes/color/light.json', buildTheme('light'));
write('tokens/themes/color/dark.json', buildTheme('dark'));
write('tokens/components/button.json', buildButton());
write('tokens/components/input.json', buildInput());
