/**
 * Génère les tokens de composant du socle produit.
 *
 * DEUX FAMILLES DE COMPOSANTS.
 *
 *   « role-aware » — le composant accepte une couleur de rôle (`<Button color="danger">`).
 *   Ses tokens sont générés pour LES 6 RÔLES. La variante déclare seulement quels
 *   SLOTS du rôle elle consomme ; le rôle reste un paramètre. C'est la promesse du
 *   contrat de rôle : un composant qui sait afficher `primary` sait afficher les cinq
 *   autres, sans un token de plus.
 *
 *   « neutre » — le composant n'a pas de notion de couleur de rôle (un champ de
 *   saisie, une carte, un tooltip). Ses tokens pointent directement sur les rôles
 *   sémantiques neutres (`surface.*`, `text.*`, `border.*`) et, ponctuellement, sur
 *   un rôle précis (le focus d'un input est `primary`, son erreur est `danger`).
 *
 * SYNTAXE DES SPECS
 *   'main'                 → slot du rôle courant  → {color.role.<ROLE>.main}
 *   '{color.text.body}'    → référence absolue
 *
 *   node scripts/generate-components.js
 */
import { writeFileSync } from 'node:fs';

const ROLES = ['primary', 'neutral', 'success', 'warning', 'danger', 'info'];

/* ================================================================== *
 * COULEUR — les tables de mapping. LA décision de design.
 * ================================================================== */

/** Raccourcis pour les états désactivés, identiques partout. */
const OFF = {
  bg: '{color.surface.disabled}',
  text: '{color.text.disabled}',
  border: '{color.border.disabled}',
};
const NONE = '{color.surface.transparent}';
const NO_BORDER = '{color.border.transparent}';

const ROLE_AWARE = {
  button: {
    variants: {
      filled: {
        default:  { background: 'main',       text: 'on',   border: 'main' },
        hover:    { background: 'hover',      text: 'on',   border: 'hover' },
        active:   { background: 'active',     text: 'on',   border: 'active' },
        disabled: { background: OFF.bg,       text: OFF.text, border: OFF.border },
      },
      outlined: {
        default:  { background: NONE,         text: 'text', border: 'border' },
        hover:    { background: 'tint',       text: 'text', border: 'main' },
        active:   { background: 'tintStrong', text: 'text', border: 'main' },
        disabled: { background: NONE,         text: OFF.text, border: OFF.border },
      },
      ghost: {
        default:  { background: NONE,         text: 'text', border: NO_BORDER },
        hover:    { background: 'tint',       text: 'text', border: NO_BORDER },
        active:   { background: 'tintStrong', text: 'text', border: NO_BORDER },
        disabled: { background: NONE,         text: OFF.text, border: NO_BORDER },
      },
    },
  },

  /** Statique : un badge ne réagit pas au survol. */
  badge: {
    variants: {
      filled:   { default: { background: 'main',   text: 'on',   border: 'main' } },
      subtle:   { default: { background: 'subtle', text: 'text', border: NO_BORDER } },
      outlined: { default: { background: NONE,     text: 'text', border: 'border' } },
    },
  },

  /** Interactif : un tag se survole, se sélectionne, se supprime. */
  tag: {
    variants: {
      filled: {
        default:  { background: 'main',       text: 'on',   border: 'main' },
        hover:    { background: 'hover',      text: 'on',   border: 'hover' },
        disabled: { background: OFF.bg,       text: OFF.text, border: OFF.border },
      },
      subtle: {
        default:  { background: 'subtle',     text: 'text', border: NO_BORDER },
        hover:    { background: 'tintStrong', text: 'text', border: NO_BORDER },
        disabled: { background: OFF.bg,       text: OFF.text, border: NO_BORDER },
      },
      outlined: {
        default:  { background: NONE,         text: 'text', border: 'border' },
        hover:    { background: 'tint',       text: 'text', border: 'main' },
        disabled: { background: NONE,         text: OFF.text, border: OFF.border },
      },
    },
  },

  alert: {
    variants: {
      subtle: {
        default: { background: 'subtle', border: 'border', icon: 'main', title: '{color.text.strong}', text: '{color.text.body}' },
      },
      filled: {
        default: { background: 'main', border: 'main', icon: 'on', title: 'on', text: 'on' },
      },
    },
  },

  /**
   * `mark` = le glyphe (coche, puce). Il est transparent quand la case est vide :
   * un seul token suffit, pas besoin de le masquer côté composant.
   */
  checkbox: {
    variants: {
      default: {
        unchecked:        { background: '{color.surface.base}',     border: '{color.border.strong}', mark: NONE },
        uncheckedHover:   { background: 'tint',                     border: 'main',                  mark: NONE },
        checked:          { background: 'main',                     border: 'main',                  mark: 'on' },
        checkedHover:     { background: 'hover',                    border: 'hover',                 mark: 'on' },
        indeterminate:    { background: 'main',                     border: 'main',                  mark: 'on' },
        disabled:         { background: OFF.bg,                     border: OFF.border,              mark: NONE },
        disabledChecked:  { background: OFF.bg,                     border: OFF.border,              mark: OFF.text },
      },
    },
  },

  switch: {
    variants: {
      default: {
        off:        { track: '{color.border.strong}',   thumb: '{color.surface.base}' },
        offHover:   { track: '{color.role.neutral.main}', thumb: '{color.surface.base}' },
        on:         { track: 'main',                    thumb: 'on' },
        onHover:    { track: 'hover',                   thumb: 'on' },
        disabledOff:{ track: OFF.bg,                    thumb: '{color.surface.base}' },
        disabledOn: { track: OFF.bg,                    thumb: '{color.surface.base}' },
      },
    },
  },

  link: {
    variants: {
      default: {
        default:  { text: 'text' },
        hover:    { text: 'active' },
        disabled: { text: OFF.text },
      },
    },
  },
};

/** `radio` est identique à `checkbox`, à la forme près (radius). */
ROLE_AWARE.radio = {
  variants: {
    default: {
      unchecked:       ROLE_AWARE.checkbox.variants.default.unchecked,
      uncheckedHover:  ROLE_AWARE.checkbox.variants.default.uncheckedHover,
      checked:         ROLE_AWARE.checkbox.variants.default.checked,
      checkedHover:    ROLE_AWARE.checkbox.variants.default.checkedHover,
      disabled:        ROLE_AWARE.checkbox.variants.default.disabled,
      disabledChecked: ROLE_AWARE.checkbox.variants.default.disabledChecked,
    },
  },
};

/* ------------------------------------------------------------------ */

/** Champ de saisie : le focus est `primary`, l'erreur est `danger`. Pas de rôle libre. */
const FIELD_STATES = {
  default:  { background: '{color.surface.base}',     text: '{color.text.body}', border: '{color.border.default}',     placeholder: '{color.text.muted}' },
  hover:    { background: '{color.surface.base}',     text: '{color.text.body}', border: '{color.border.strong}',      placeholder: '{color.text.muted}' },
  focus:    { background: '{color.surface.base}',     text: '{color.text.body}', border: '{color.role.primary.main}',  placeholder: '{color.text.muted}' },
  disabled: { background: OFF.bg,                     text: OFF.text,            border: OFF.border,                   placeholder: OFF.text },
  error:    { background: '{color.surface.base}',     text: '{color.text.body}', border: '{color.role.danger.main}',   placeholder: '{color.text.muted}' },
};

const NEUTRAL = {
  input:    { states: FIELD_STATES },
  textarea: { states: FIELD_STATES },
  select:   {
    states: Object.fromEntries(
      Object.entries(FIELD_STATES).map(([k, v]) => [
        k,
        { ...v, icon: k === 'disabled' ? OFF.text : '{color.text.muted}' },
      ]),
    ),
  },

  card: {
    states: {
      default:  { background: '{color.surface.raised}', border: '{color.border.default}', shadow: '{shadow.raised}' },
      hover:    { background: '{color.surface.raised}', border: '{color.border.strong}',  shadow: '{shadow.float}' },
      selected: { background: '{color.surface.raised}', border: '{color.role.primary.main}', shadow: '{shadow.raised}' },
    },
  },

  tooltip: {
    states: { default: { background: '{color.surface.inverse}', text: '{color.text.inverse}' } },
  },

  modal: {
    states: {
      default: { background: '{color.surface.overlay}', border: '{color.border.default}', shadow: '{shadow.overlay}', scrim: '{color.scrim}' },
    },
  },

  /** Le survol d'un item de menu utilise le voile NEUTRE, pas la teinte du rôle. */
  menu: {
    states: {
      default: { background: '{color.surface.overlay}', border: '{color.border.default}', shadow: '{shadow.float}' },
    },
    parts: {
      item: {
        default:  { background: NONE,                     text: '{color.text.body}' },
        hover:    { background: '{color.state.hover}',    text: '{color.text.body}' },
        active:   { background: '{color.state.active}',   text: '{color.text.body}' },
        selected: { background: '{color.state.selected}', text: '{color.role.primary.text}' },
        disabled: { background: NONE,                     text: OFF.text },
      },
    },
  },

  tabs: {
    states: {
      default:  { background: NONE,                  text: '{color.text.muted}',        indicator: NO_BORDER },
      hover:    { background: '{color.state.hover}', text: '{color.text.body}',         indicator: NO_BORDER },
      selected: { background: NONE,                  text: '{color.role.primary.text}', indicator: '{color.role.primary.main}' },
      disabled: { background: NONE,                  text: OFF.text,                    indicator: NO_BORDER },
    },
  },

  table: {
    parts: {
      header: {
        default: { background: '{color.surface.raised}', text: '{color.text.muted}', border: '{color.border.default}' },
      },
      row: {
        default:  { background: NONE,                     text: '{color.text.body}', border: '{color.border.divider}' },
        hover:    { background: '{color.state.hover}',    text: '{color.text.body}', border: '{color.border.divider}' },
        selected: { background: '{color.state.selected}', text: '{color.text.body}', border: '{color.border.divider}' },
        disabled: { background: NONE,                     text: OFF.text,            border: '{color.border.divider}' },
      },
    },
  },
};

/* ================================================================== *
 * DIMENSIONS — 3 tailles sur les composants interactifs.
 * ================================================================== */

/** Chaque clé de dimension est routée vers son groupe de type. */
const DIM_GROUP = {
  height: 'size', box: 'size', trackWidth: 'size', trackHeight: 'size', thumb: 'size', icon: 'size',
  paddingX: 'space', paddingY: 'space', gap: 'space',
  radius: 'radius',
  fontSize: 'fontSize',
  borderWidth: 'borderWidth',
};

const CONTROL = (h, px, py, fs, r, icon) => ({
  height: `{controlHeight.${h}}`, paddingX: `{space.${px}}`, paddingY: `{space.${py}}`,
  gap: '{space.xs}', fontSize: `{fontSize.${fs}}`, radius: `{radius.${r}}`,
  icon: `{glyphSize.${icon}}`, borderWidth: '{borderWidth.default}',
});

const SIZED = {
  button: { sm: CONTROL('sm', 'sm', 'xs', 'small', 'sm', 'sm'), md: CONTROL('md', 'md', 'sm', 'body', 'md', 'md'), lg: CONTROL('lg', 'lg', 'sm', 'lead', 'md', 'lg') },
  input:  { sm: CONTROL('sm', 'sm', 'xs', 'small', 'sm', 'sm'), md: CONTROL('md', 'sm', 'sm', 'body', 'sm', 'md'), lg: CONTROL('lg', 'md', 'sm', 'lead', 'md', 'lg') },
  select: { sm: CONTROL('sm', 'sm', 'xs', 'small', 'sm', 'sm'), md: CONTROL('md', 'sm', 'sm', 'body', 'sm', 'md'), lg: CONTROL('lg', 'md', 'sm', 'lead', 'md', 'lg') },
  tag:    { sm: CONTROL('xs', 'xs', 'xs', 'small', 'full', 'xs'), md: CONTROL('sm', 'sm', 'xs', 'small', 'full', 'sm'), lg: CONTROL('md', 'md', 'xs', 'body', 'full', 'md') },
  badge:  { sm: CONTROL('xs', 'xs', 'xs', 'small', 'full', 'xs'), md: CONTROL('sm', 'sm', 'xs', 'small', 'full', 'sm'), lg: CONTROL('md', 'md', 'xs', 'body', 'full', 'md') },

  checkbox: {
    sm: { box: '{glyphSize.sm}', radius: '{radius.sm}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.xs}' },
    md: { box: '{glyphSize.md}', radius: '{radius.sm}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.sm}' },
    lg: { box: '{glyphSize.lg}', radius: '{radius.sm}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.md}' },
  },
  radio: {
    sm: { box: '{glyphSize.sm}', radius: '{radius.full}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.xs}' },
    md: { box: '{glyphSize.md}', radius: '{radius.full}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.sm}' },
    lg: { box: '{glyphSize.lg}', radius: '{radius.full}', borderWidth: '{borderWidth.strong}', icon: '{glyphSize.md}' },
  },
  switch: {
    sm: { trackWidth: '{size.control.lg}', trackHeight: '{glyphSize.md}', thumb: '{glyphSize.sm}', radius: '{radius.full}' },
    md: { trackWidth: '{size.control.xl}', trackHeight: '{glyphSize.lg}', thumb: '{glyphSize.md}', radius: '{radius.full}' },
    lg: { trackWidth: '{size.spacing.11}', trackHeight: '{size.control.sm}', thumb: '{glyphSize.md}', radius: '{radius.full}' },
  },
};

/** Composants à jeu de dimensions unique (pas de sm/md/lg). */
const UNSIZED = {
  textarea: { paddingX: '{space.sm}', paddingY: '{space.sm}', fontSize: '{fontSize.body}', radius: '{radius.sm}', borderWidth: '{borderWidth.default}' },
  card:     { paddingX: '{space.lg}', paddingY: '{space.lg}', gap: '{space.md}', radius: '{radius.lg}', borderWidth: '{borderWidth.default}' },
  alert:    { paddingX: '{space.md}', paddingY: '{space.md}', gap: '{space.sm}', radius: '{radius.md}', borderWidth: '{borderWidth.default}', icon: '{glyphSize.md}' },
  tooltip:  { paddingX: '{space.sm}', paddingY: '{space.xs}', fontSize: '{fontSize.small}', radius: '{radius.sm}' },
  modal:    { paddingX: '{space.xl}', paddingY: '{space.xl}', gap: '{space.lg}', radius: '{radius.lg}', borderWidth: '{borderWidth.default}' },
  menu:     { paddingX: '{space.xs}', paddingY: '{space.xs}', radius: '{radius.md}', borderWidth: '{borderWidth.default}' },
  tabs:     { paddingX: '{space.md}', paddingY: '{space.sm}', gap: '{space.xs}', fontSize: '{fontSize.body}', borderWidth: '{borderWidth.strong}' },
  table:    { paddingX: '{space.md}', paddingY: '{space.sm}', fontSize: '{fontSize.small}', borderWidth: '{borderWidth.default}' },
  link:     { fontSize: '{fontSize.body}' },
};

/* ================================================================== *
 * Génération
 * ================================================================== */

const tok = ($value) => ({ $value });

/** 'main' → {color.role.<role>.main} ; '{…}' → tel quel. */
const colorRef = (spec, role) => (spec.startsWith('{') ? spec : `{color.role.${role}.${spec}}`);

/** Insère une valeur profondément dans un arbre. */
function put(tree, path, value) {
  let node = tree;
  for (const key of path.slice(0, -1)) node = node[key] ??= {};
  node[path.at(-1)] = value;
}

function buildComponent(name) {
  const out = {};
  const roleAware = ROLE_AWARE[name];
  const neutral = NEUTRAL[name];

  // ---- couleur ----
  if (roleAware) {
    for (const [variant, states] of Object.entries(roleAware.variants)) {
      for (const role of ROLES) {
        for (const [state, props] of Object.entries(states)) {
          for (const [prop, spec] of Object.entries(props)) {
            put(out, ['color', name, variant, role, state, prop], tok(colorRef(spec, role)));
          }
        }
      }
    }
  }
  if (neutral?.states) {
    for (const [state, props] of Object.entries(neutral.states)) {
      for (const [prop, spec] of Object.entries(props)) {
        // Une ombre n'est pas une couleur : elle va dans son propre groupe.
        const group = prop === 'shadow' ? ['shadow', name, state] : ['color', name, state, prop];
        put(out, prop === 'shadow' ? group : [...group], tok(spec));
      }
    }
  }
  if (neutral?.parts) {
    for (const [part, states] of Object.entries(neutral.parts)) {
      for (const [state, props] of Object.entries(states)) {
        for (const [prop, spec] of Object.entries(props)) {
          put(out, ['color', name, part, state, prop], tok(spec));
        }
      }
    }
  }

  // ---- dimensions ----
  //
  // Quand la clé EST le groupe (`radius`, `fontSize`, `borderWidth`), elle ne doit pas
  // être répétée en feuille : on veut `radius.badge.md`, pas `radius.badge.md.radius`
  // (qui sortirait en `--radius-badge-md-radius`).
  const SELF_NAMED = new Set(['radius', 'fontSize', 'borderWidth']);

  const emitDims = (dims, sizePath) => {
    for (const [key, spec] of Object.entries(dims)) {
      const group = DIM_GROUP[key];
      if (!group) throw new Error(`Clé de dimension inconnue : ${key} (composant ${name})`);
      const leaf = SELF_NAMED.has(key) ? [] : [key];
      put(out, [group, name, ...sizePath, ...leaf], tok(spec));
    }
  };

  if (SIZED[name]) {
    for (const [size, dims] of Object.entries(SIZED[name])) emitDims(dims, [size]);
  }
  if (UNSIZED[name]) emitDims(UNSIZED[name], []);

  // Types DTCG par groupe de tête.
  const TYPES = { color: 'color', shadow: 'shadow', size: 'dimension', space: 'dimension', radius: 'dimension', fontSize: 'dimension', borderWidth: 'dimension' };
  for (const [group, node] of Object.entries(out)) {
    if (TYPES[group]) node.$type = TYPES[group];
  }
  return out;
}

const COMPONENTS = [...new Set([...Object.keys(ROLE_AWARE), ...Object.keys(NEUTRAL)])].sort();

let total = 0;
for (const name of COMPONENTS) {
  const data = buildComponent(name);
  const count = JSON.stringify(data).match(/"\$value"/g)?.length ?? 0;
  total += count;
  writeFileSync(`tokens/components/${name}.json`, JSON.stringify(data, null, 2) + '\n');
  const kind = ROLE_AWARE[name] ? `role-aware ×${ROLES.length}` : 'neutre';
  console.log(`  ✔ ${`${name}.json`.padEnd(18)} ${String(count).padStart(4)} tokens   (${kind})`);
}
console.log(`\n  ${COMPONENTS.length} composants, ${total} tokens générés.`);
