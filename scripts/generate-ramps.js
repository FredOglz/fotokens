/**
 * Génère les rampes de couleur des primitives sur une courbe perceptuelle commune.
 *
 * Le problème qu'il résout : des palettes dessinées à la main dérivent les unes
 * des autres. Un « 500 » finit clair dans une palette et sombre dans une autre,
 * et les rôles sémantiques (`interactive.default`, `text.onPrimary`…) ne tiennent
 * plus leurs promesses de contraste quand on change de tonique.
 *
 * La méthode : chaque palette est définie par son IDENTITÉ (une teinte + un pic
 * de chroma) ; les 11 crans sont ensuite calculés en OKLCH sur une courbe de
 * luminosité partagée. Deux palettes ont donc, à cran égal, la même luminosité
 * perçue — c'est ce qui rend les rôles `brand` réellement interchangeables.
 *
 * OKLCH et pas HSL : la luminosité HSL n'est pas perceptuelle (un jaune et un
 * bleu à L=50 % n'ont rien à voir à l'œil). OKLCH, si.
 *
 *   node scripts/generate-ramps.js          # aperçu, n'écrit rien
 *   node scripts/generate-ramps.js --write  # réécrit tokens/primitives/color.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { hexToOklch, hexToRgb, oklchToHex } from './oklch.js';

const TARGET = 'tokens/primitives/color.json';

/** Luminosité perçue par cran (L* OKLCH). Du fond quasi-blanc au fond dark franc. */
const L_CURVE = {
  '25': 0.985, '50': 0.965, '100': 0.930, '200': 0.870, '300': 0.790, '400': 0.710,
  '500': 0.625, '600': 0.540, '700': 0.450, '800': 0.350, '900': 0.250,
};

/** Chroma par cran, en fraction du pic de la palette. En cloche : atténuée aux extrêmes. */
const C_CURVE = {
  '25': 0.10, '50': 0.18, '100': 0.32, '200': 0.55, '300': 0.75, '400': 0.92,
  '500': 1.00, '600': 0.98, '700': 0.90, '800': 0.78, '900': 0.64,
};

/**
 * L'identité de chaque palette : teinte (deg) + pic de chroma.
 * Pour ajouter une palette, il suffit d'une ligne ici.
 */
const PALETTES = {
  gray:      { hue: 265, chroma: 0.032 },
  blue:      { hue: 264, chroma: 0.217 },
  red:       { hue: 27,  chroma: 0.215 },
  green:     { hue: 150, chroma: 0.192 },
  orange:    { hue: 41,  chroma: 0.194 },
  turquoise: { hue: 181, chroma: 0.161 },
  slateBlue: { hue: 250, chroma: 0.076 },
  violet:    { hue: 304, chroma: 0.297 },
};

const STEPS = Object.keys(L_CURVE);

const buildRamp = ({ hue, chroma }) =>
  Object.fromEntries(
    STEPS.map((step) => [step, { value: oklchToHex([L_CURVE[step], chroma * C_CURVE[step], hue]) }]),
  );

/** Opacités générées pour chaque teinte, calculées sur le cran d'ancrage. */
const ALPHAS = { '5': 0.05, '10': 0.1 };

/** Cran servant de base aux alphas. À 5-10 % la teinte prime, le cran exact est secondaire. */
const ALPHA_BASE = '500';

/**
 * Voile translucide de la teinte, pour les fonds d'états (bouton outlined/ghost au
 * survol, ligne de tableau active…). Vit DANS la palette et non dans un groupe
 * `color.alpha.*` séparé : c'est ce qui fait qu'un swap de rôle `brand` emporte
 * l'alpha avec lui.
 */
const buildAlphas = (ramp) => {
  const [r, g, b] = hexToRgb(ramp[ALPHA_BASE].value).map((c) => Math.round(c * 255));
  return Object.fromEntries(
    Object.entries(ALPHAS).map(([name, a]) => [name, { value: `rgba(${r}, ${g}, ${b}, ${a})` }]),
  );
};

/** Réécrit le JSON à la main : `JSON.stringify` casse la mise en forme compacte. */
function serialise(palettes) {
  const names = Object.keys(palettes);
  const tok = (v) => `{ "$value": "${v}" }`;
  const lines = [
    '{',
    '  "color": {',
    '    "$type": "color",',
    '    "transparent": { "$value": "rgba(0, 0, 0, 0)", "$description": "Absence de couleur — fond des variantes outlined/ghost." },',
  ];
  names.forEach((name, i) => {
    lines.push(`    "${name}": {`);
    STEPS.forEach((step) => {
      lines.push(`      ${`"${step}":`.padEnd(7)}${tok(palettes[name][step].value)},`);
    });
    lines.push('      "alpha": {');
    const alphaKeys = Object.keys(ALPHAS);
    alphaKeys.forEach((a, j) => {
      const comma = j < alphaKeys.length - 1 ? ',' : '';
      lines.push(`        ${`"${a}":`.padEnd(6)}${tok(palettes[name].alpha[a].value)}${comma}`);
    });
    lines.push('      }');
    lines.push(`    }${i < names.length - 1 ? ',' : ''}`);
  });
  lines.push('  }', '}');
  return lines.join('\n') + '\n';
}

const ramps = Object.fromEntries(
  Object.entries(PALETTES).map(([name, identity]) => {
    const ramp = buildRamp(identity);
    return [name, { ...ramp, alpha: buildAlphas(ramp) }];
  }),
);

if (process.argv.includes('--write')) {
  writeFileSync(TARGET, serialise(ramps));
  console.log(`✔ ${TARGET} régénéré (${Object.keys(ramps).length} palettes × ${STEPS.length} crans)`);
} else {
  const current = JSON.parse(readFileSync(TARGET, 'utf8')).color;
  console.log('Aperçu (--write pour appliquer). L* = luminosité perçue.\n');
  console.log('palette'.padEnd(11) + STEPS.map((s) => s.padStart(9)).join(''));
  for (const [name, ramp] of Object.entries(ramps)) {
    const row = STEPS.map((s) => ramp[s].value.padStart(9)).join('');
    console.log(name.padEnd(11) + row);
  }
  const drift = Object.entries(ramps).filter(
    ([name, ramp]) => current[name] && STEPS.some((s) => current[name][s]?.$value !== ramp[s].value),
  );
  console.log(
    drift.length
      ? `\n⚠ ${drift.length} palette(s) divergent du fichier : ${drift.map(([n]) => n).join(', ')}`
      : '\n✔ Le fichier est à jour.',
  );
}
