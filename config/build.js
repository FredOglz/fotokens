/**
 * Build multi-dimensionnel.
 *
 * Les fichiers `themes/color/light.json` et `themes/color/dark.json` déclarent
 * les MÊMES chemins de tokens avec des valeurs différentes — idem pour
 * `themes/size/desktop.json` et `mobile.json`. Ils ne peuvent donc pas vivre
 * dans une même source Style Dictionary (collision). On lance un build par
 * combinaison, puis on concatène les blocs dans un seul `dist/tokens.css`.
 *
 * Les blocs de surcharge (dark, mobile) ne réémettent QUE les tokens dont la
 * valeur diffère réellement de celle du bloc `:root`. Deux raisons :
 *   - un token de composant pointe sur une var() sémantique, il n'a donc jamais
 *     besoin d'être réémis : redéfinir la var() sémantique suffit ;
 *   - un rôle déclaré à l'identique dans les deux modes (ex. `borderWidth.*`)
 *     ne produit aucune ligne inutile.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import StyleDictionary from 'style-dictionary';
import { createPropertyFormatter } from 'style-dictionary/utils';

const DIST = 'dist';

const PRIMITIVES = 'tokens/primitives/*.json';
const BRAND = 'tokens/brand/default.json';
const TYPOGRAPHY = 'tokens/themes/typography/default.json';
const EFFECT = 'tokens/themes/effect/default.json';
const COMPONENTS = 'tokens/components/*.json';

// Les fichiers de mode portent tout ce qui dépend du clair/sombre : couleurs ET ombres.
const modeTheme = (mode) => `tokens/themes/mode/${mode}.json`;
const sizeTheme = (mode) => `tokens/themes/size/${mode}.json`;

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));

/** Aplatit un fichier de tokens en Map<'a.b.c', valeur brute (souvent une réf)>. */
function flattenTokens(obj, prefix = []) {
  return Object.entries(obj).flatMap(([key, node]) => {
    if (key.startsWith('$')) return []; // $type / $description : métadonnées, pas des tokens
    if (node && typeof node === 'object' && '$value' in node) {
      return [[[...prefix, key].join('.'), node.$value]];
    }
    return node && typeof node === 'object' ? flattenTokens(node, [...prefix, key]) : [];
  });
}

/**
 * Construit un prédicat « ce token change-t-il par rapport au mode de base ? ».
 * On compare les valeurs SOURCE (les références `{...}`), pas les valeurs
 * résolues : deux rôles pointant sur la même primitive sont bien identiques.
 */
async function changedFrom(baseFile, variantFile) {
  const base = new Map(flattenTokens(await readJson(baseFile)));
  const variant = new Map(flattenTokens(await readJson(variantFile)));

  const changed = new Set(
    [...variant.entries()]
      .filter(([tokenPath, value]) => base.get(tokenPath) !== value)
      .map(([tokenPath]) => tokenPath),
  );

  return (token) => changed.has(token.path.join('.'));
}

/** Émet un bloc CSS, éventuellement enveloppé dans une media query. */
StyleDictionary.registerFormat({
  name: 'css/block',
  format: ({ dictionary, options }) => {
    const { selector = ':root', media = null } = options;
    const formatProperty = createPropertyFormatter({
      // Les ombres sont émises en valeurs RÉSOLUES, pas en var().
      // Style Dictionary construit la valeur courte (`offsetX offsetY blur spread color`)
      // puis y réinjecte les var() par recherche de chaîne. Quand deux composantes
      // ont la même valeur — ici `offsetX: "0"` et un `spread` qui vaut aussi `0` —
      // il remplace la mauvaise occurrence et intervertit les positions. Le rendu
      // reste juste tant que les deux valent 0, mais un spread non nul atterrirait
      // dans l'offset horizontal.
      outputReferences: (token) => token.$type !== 'shadow',
      dictionary,
      format: 'css',
      // Sans ça, le formatter lit `token.value` alors que les tokens DTCG
      // portent `token.$value` — et TOUTES les valeurs sortent en `undefined`.
      usesDtcg: true,
      // Propage les $description DTCG en commentaire CSS.
      commentStyle: 'long',
      commentPosition: 'above',
    });

    const lines = dictionary.allTokens.map(formatProperty).filter(Boolean);
    if (lines.length === 0) return '';

    const block = `${selector} {\n${lines.join('\n')}\n}`;
    if (!media) return `${block}\n`;

    const indented = block
      .split('\n')
      .map((line) => (line ? `  ${line}` : line))
      .join('\n');
    return `@media ${media} {\n${indented}\n}\n`;
  },
});

/**
 * Chaque build charge la totalité des tokens (pour que les références se
 * résolvent), mais n'ÉMET que le sous-ensemble décrit par `emit`.
 */
async function cssBlock({ source, options, emit }) {
  const sd = new StyleDictionary({
    source,
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: `${DIST}/`,
        files: [
          {
            destination: 'block.css',
            format: 'css/block',
            filter: emit ?? undefined,
            options,
          },
        ],
      },
    },
  });

  const [file] = await sd.formatPlatform('css');
  return file.output;
}

/** Export JSON à plat, valeurs résolues (light + desktop) pour inspection. */
async function jsonFlat(source) {
  const sd = new StyleDictionary({
    source,
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: {
      json: {
        transformGroup: 'css',
        buildPath: `${DIST}/`,
        files: [{ destination: 'tokens.json', format: 'json/flat' }],
      },
    },
  });
  await sd.buildPlatform('json');
}

async function main() {
  await fs.mkdir(DIST, { recursive: true });

  // Le breakpoint mobile vient des tokens : une seule source de vérité.
  // (Une media query CSS ne peut pas lire une custom property — la valeur doit
  // être inlinée à la génération.)
  const primitives = await readJson('tokens/primitives/size.json');
  const mobileBreakpoint = primitives.size.breakpoint.md.$value;

  const base = [PRIMITIVES, BRAND, modeTheme('light'), TYPOGRAPHY, EFFECT, sizeTheme('desktop'), COMPONENTS];

  /**
   * Les tokens de composant pèsent ~75 % du dictionnaire. On les sort dans un
   * fichier à part : un projet qui écrit ses propres composants n'a aucun besoin
   * de ces 1100+ variables, et peut n'importer que le système.
   *
   * Ils n'apparaissent QUE dans `:root` : un token de composant pointe sur une
   * var() sémantique, donc il est invariant par mode — c'est la couche sémantique
   * qui bascule sous lui.
   */
  const isComponent = (token) => token.filePath.includes('tokens/components/');
  const not = (fn) => (token) => !fn(token);
  const and = (a, b) => (token) => a(token) && b(token);

  const modeChanged = await changedFrom(modeTheme('light'), modeTheme('dark'));
  const sizeChanged = await changedFrom(sizeTheme('desktop'), sizeTheme('mobile'));

  const darkSource = [PRIMITIVES, BRAND, modeTheme('dark'), TYPOGRAPHY, EFFECT, sizeTheme('desktop'), COMPONENTS];
  const mobileSource = [PRIMITIVES, BRAND, modeTheme('light'), TYPOGRAPHY, EFFECT, sizeTheme('mobile'), COMPONENTS];

  const FILES = {
    'tokens.css': {
      title: 'le système : primitives, brand, rôles sémantiques',
      builds: [
        { label: 'tokens.css · root', source: base, options: { selector: ':root' }, emit: not(isComponent) },
        { label: 'tokens.css · dark', source: darkSource, options: { selector: '[data-theme="dark"]' }, emit: and(modeChanged, not(isComponent)) },
        { label: `tokens.css · mobile (< ${mobileBreakpoint})`, source: mobileSource, options: { selector: ':root', media: `(max-width: ${mobileBreakpoint})` }, emit: and(sizeChanged, not(isComponent)) },
      ],
    },
    'components.css': {
      title: 'les tokens de composant — REQUIERT tokens.css',
      builds: [
        { label: 'components.css · root', source: base, options: { selector: ':root' }, emit: isComponent },
      ],
    },
  };

  for (const [file, { title, builds }] of Object.entries(FILES)) {
    const blocks = [];
    for (const build of builds) {
      const output = await cssBlock(build);

      // Un token non résolu sort en `undefined` SANS faire échouer Style Dictionary :
      // le build afficherait ✔ en produisant un CSS entièrement vide. Déjà arrivé une
      // fois (formatter DTCG mal configuré). On échoue bruyamment.
      const broken = output.match(/^\s*--[\w-]+:\s*undefined;/gm);
      if (broken) {
        throw new Error(
          `[${build.label}] ${broken.length} token(s) non résolu(s) — valeur "undefined" :\n` +
            broken.slice(0, 5).map((l) => `    ${l.trim()}`).join('\n') +
            (broken.length > 5 ? `\n    … et ${broken.length - 5} autres` : ''),
        );
      }
      if (output.trim()) blocks.push(output.trim());
    }

    const head = [
      '/**',
      ' * Do not edit directly, this file was auto-generated.',
      ` * ${title}`,
      ...(file === 'components.css'
        ? [' *', " * @import './tokens.css' AVANT ce fichier : chaque token pointe sur une", ' * variable sémantique définie là-bas.']
        : [
            ' *',
            ' * :root                → thème clair, tailles desktop',
            ' * [data-theme="dark"]  → surcharges du thème sombre',
            ` * @media (max-width)   → surcharges des tailles mobile (< ${mobileBreakpoint})`,
          ]),
      ' */',
      '',
    ].join('\n');

    await fs.writeFile(path.join(DIST, file), `${head}\n${blocks.join('\n\n')}\n`);
    const count = blocks.join('').match(/--[\w-]+:/g)?.length ?? 0;
    console.log(`  ✔ ${DIST}/${file.padEnd(15)} ${String(count).padStart(5)} déclarations`);
  }

  await jsonFlat(base);
  console.log(`  ✔ ${DIST}/tokens.json    (le dictionnaire complet, à plat)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
