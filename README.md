# @fred/design-tokens

Librairie de **design tokens** publiable en package npm. Ce repo ne contient
**que les tokens** (pas de composants UI) : il est agnostique de tout framework
et destiné à être consommé plus tard par un package de composants séparé.

Le moteur de transformation est [Style Dictionary](https://styledictionary.com/).
Les tokens sont au format **DTCG** (`$value` / `$type` / `$description`), le
standard du W3C — ce qui débloque l'interop Figma / Tokens Studio, et fait
ressortir les `$description` en commentaires dans le CSS généré.

## Architecture à 4 couches

```
Primitives  →  Brand (sélection)  →  Sémantique (par mode)  →  Composant
(catalogue)    (le projet choisit)    (rôles)                  (usage)
```

| Couche | Dossier | Rôle | Peut référencer |
| --- | --- | --- | --- |
| **1. Primitives** | `tokens/primitives/` | Catalogue brut : toutes les palettes, l'échelle de tailles, les familles de police. Aucune sémantique. | Rien — que des valeurs brutes. |
| **2. Brand** | `tokens/brand/` | **La sélection du projet.** Dit quelle palette joue quel rôle : `tonic → violet`, `neutral → slateBlue`… | Un **primitive**. |
| **3. Sémantique** | `tokens/themes/` | Le **contrat de rôle** (6 rôles × 9 slots), plus `surface`/`text`/`border`/`focus`. Déclinée par **mode** (light/dark, desktop/mobile). | La couche **brand** (couleurs) ou les **primitives** (tailles, typo). |
| **4. Composant** | `tokens/components/` | Tokens nommés par composant (`button`, `input`…). | La couche **sémantique**. |

### Les règles strictes

> - Un token de **composant** référence un token **sémantique**, jamais une couche
>   inférieure.
> - Un token **sémantique de couleur** référence la couche **brand**, jamais un
>   primitive de couleur directement.
> - Un token **brand** référence un **primitive**, jamais une valeur brute.

C'est la couche **brand** qui rend un projet interchangeable. Dans
`themes/color/*.json` on ne doit **jamais** voir `{color.violet.600}` — seulement
`{color.brand.primary.600}`.

### Changer l'identité d'un projet

Éditer **une ligne** dans la table `BRAND` de `scripts/generate-theme.js`, puis
`npm run theme` :

```js
const BRAND = {
  primary: 'turquoise',   // ← était 'violet'
  neutral: 'slateBlue',
  success: 'green', warning: 'orange', danger: 'red', info: 'blue',
};
```

Rien d'autre ne bouge : ni le contrat de rôle, ni les composants. Toute l'app
suit. N'importe quelle palette peut jouer n'importe quel rôle : elles exposent
toutes les **mêmes 11 crans** sur la **même courbe de luminosité**, donc un swap
ne casse ni le build, ni les contrastes.


## Le contrat de rôle

C'est la pièce maîtresse de la couche sémantique. Les **6 rôles** (`primary`,
`neutral`, `success`, `warning`, `danger`, `info`) exposent **exactement les mêmes
9 slots**, mappés sur **exactement les mêmes crans** :

| Slot | Light | Dark | À quoi ça sert |
| --- | --- | --- | --- |
| `main` | `600` | `400` | Fond des composants pleins, bordure du rôle |
| `hover` | `700` | `300` | Survol d'un composant plein |
| `active` | `800` | `200` | État pressé |
| `on` | `neutral.25` | `neutral.900` | Texte **sur** une surface `main` |
| `text` | `700` | `400` | Le rôle **en texte** sur fond clair (lien, alerte) |
| `border` | `300` | `700` | Bordure discrète du rôle |
| `subtle` | `50` | `900` | Fond clair **solide** (alerte, badge doux) |
| `tint` | `alpha.5` | *idem* | Voile **translucide** (survol outlined/ghost) |
| `tintStrong` | `alpha.10` | *idem* | Voile translucide (pressé) |

**Pourquoi cette uniformité garantit le contraste.** Toutes les palettes sont sur la
même courbe de luminosité. Donc si `on`/`main` passe AA pour *un* rôle, ça passe AA
pour *les six*. Mesuré sur le CSS généré : de 4,56:1 à 5,74:1 en clair, de 5,72:1 à
6,66:1 en sombre — **les 6 rôles passent AA**.

Conséquence : `<Button color="danger">` fonctionne **sans un token de plus**. Les
3 variantes × 6 rôles × 4 états du bouton (216 tokens) sont générées à partir d'une
table de mapping de 12 lignes dans `scripts/generate-theme.js`.

### Deux règles de nommage non négociables

> **Un nom de rôle décrit un usage, jamais une apparence.**
> Pas de `dark`/`darker` pour dire « survol » et « pressé » : en thème sombre le
> survol doit être *plus clair*, et le nom deviendrait un mensonge. D'où `hover` et
> `active`.

> **Un mot, un sens.**
> `surface` désigne *uniquement* les fonds (`surface.base`, `surface.raised`…). Le
> voile alpha d'un rôle s'appelle `tint` — jamais `surface`.

## Structure du repo

```
tokens/
  primitives/            # catalogue — jamais modifié par projet
    color.json           # ⚙️ GÉNÉRÉ par scripts/generate-ramps.js — ne pas éditer
    typography.json      # familles, graisses, interlignes
    size.json            # spacing, font, radius, border, breakpoint

  brand/
    default.json         # ⚙️ GÉNÉRÉ — quelle palette joue quel rôle

  themes/
    color/
      light.json         # ⚙️ GÉNÉRÉ — le contrat de rôle
      dark.json          # ⚙️ GÉNÉRÉ — mêmes chemins, autres crans
    typography/
      default.json
    size/
      desktop.json       # mêmes chemins de tokens, valeurs différentes
      mobile.json

  components/
    button.json          # ⚙️ GÉNÉRÉ — 3 variantes × 6 rôles × 4 états
    input.json           # ⚙️ GÉNÉRÉ

config/
  build.js               # build multi-modes
scripts/
  generate-theme.js      # ⭐ LES TABLES DE MAPPING — la vraie source de vérité
  generate-ramps.js      # génère les rampes de couleur (OKLCH)
  build-docs.js          # génère la doc visuelle
  oklch.js               # conversions sRGB ↔ OKLCH
docs/
  index.html             # ⚙️ GÉNÉRÉ — doc visuelle, ouvrir dans un navigateur
dist/                    # généré (gitignoré)
```

## Documentation visuelle

```bash
npm run docs     # régénère docs/index.html
open docs/index.html
```

La page explique l'architecture, comment démarrer un projet, et affiche les 4
couches : les 8 rampes, le mapping `brand` courant, les rôles sémantiques, les
composants rendus en vrai, et les **chaînes de résolution** complètes
(`button.filled.primary.default.background` → `role.primary.main` →
`brand.primary.600` → `violet.600` → `#9500ee`). Un bouton bascule light/dark.

Elle est **générée depuis les fichiers de tokens** et **stylée avec les tokens
qu'elle documente** — elle ne peut donc pas dériver du code, et si le design
system casse, la page casse avec, visiblement. `docs/index.html` est généré : ne
pas l'éditer à la main.

## Sorties générées

### `dist/tokens.css`

Un seul fichier, trois blocs :

```css
:root                  { /* thème clair, tailles desktop — tout le dictionnaire */ }
[data-theme="dark"]    { /* uniquement les rôles couleur qui changent */ }
@media (max-width: 768px) {
  :root                { /* uniquement les tokens de taille qui changent */ }
}
```

Les blocs de surcharge ne réémettent **que les tokens dont la valeur diffère
réellement** du bloc `:root`. Un rôle déclaré à l'identique dans les deux modes
(ex. `borderWidth.*`, identique en desktop et mobile) ne produit aucune ligne.

Le chaînage entre couches est préservé via `var()` :

```css
--color-button-filled-primary-default-background: var(--color-role-primary-main);
--color-role-primary-main:                       var(--color-brand-primary-600);
--color-brand-primary-600:                       var(--color-violet-600);
--color-violet-600:                              #9500ee;
```

**C'est ce qui rend les blocs dark/mobile si petits** : un token de composant
pointe sur une var() sémantique, donc il n'a pas besoin d'être réémis quand le
mode change — seule la var() sémantique est redéfinie.

Activer le dark : `<html data-theme="dark">`.

### `dist/tokens.json`

Le même dictionnaire **à plat**, valeurs **résolues** (hex/px final), en
**light + desktop**, pour inspection/debug. Clés en kebab-case, alignées sur les
noms de variables CSS.

## Utilisation

```bash
npm install
npm run build      # génère dist/tokens.css et dist/tokens.json
npm run watch      # rebuild à chaque modification d'un token ou de la config
npm run clean      # supprime dist/
```

## Notes techniques

- **Pourquoi un `build.js` et pas la CLI ?** `light.json` et `dark.json`
  déclarent les *mêmes* chemins de tokens avec des valeurs différentes — ils ne
  peuvent pas cohabiter dans une seule source Style Dictionary (collision). On
  lance donc un build par combinaison de modes, puis on concatène les blocs.
- **Breakpoints** : une media query CSS **ne peut pas** lire une custom property
  (`@media (max-width: var(--size-breakpoint-md))` ne fonctionne pas — limitation
  du langage). Les breakpoints sont donc émis comme tokens (utiles côté JS et
  pour la doc), et `build.js` **lit la valeur depuis les tokens** pour l'inliner
  dans la media query générée. Une seule source de vérité : changer
  `size.breakpoint.md` dans les primitives déplace le breakpoint du build.
- **Le `watch`** s'appuie sur `chokidar-cli` : la CLI Style Dictionary v4 n'a pas
  de mode watch natif.
- **Nom du package** : `@fred/design-tokens` est un placeholder, à remplacer
  avant toute publication réelle.

## Les rampes de couleur sont générées, pas écrites à la main

`tokens/primitives/color.json` est **produit par `scripts/generate-ramps.js`** —
ne l'édite pas à la main, il serait écrasé.

Chaque palette est définie par son **identité** (une teinte + un pic de chroma),
et ses 11 crans sont calculés en **OKLCH** sur une courbe de luminosité
**partagée par toutes les palettes**. À cran égal, deux palettes ont donc la même
luminosité perçue.

```bash
npm run ramps          # aperçu, n'écrit rien
npm run ramps:write    # régénère tokens/primitives/color.json
```

Ajouter une palette = **une ligne** dans `PALETTES` (teinte + chroma).

### Les voiles alpha

Chaque teinte expose aussi un voile translucide à **5 %** et **10 %**, calculé sur
son cran `500` — pour les fonds d'états (survol / actif d'un bouton `outlined` ou
`ghost`, ligne de tableau sélectionnée…).

```
color.violet.alpha.5   →  rgba(170, 76, 255, 0.05)
color.violet.alpha.10  →  rgba(170, 76, 255, 0.1)
```

**L'alpha vit *dans* la palette**, pas dans un groupe `color.alpha.*` séparé.
C'est délibéré : le rôle `brand.tonic` alias la palette **entière**, donc changer
la tonique emporte l'alpha avec elle. Un groupe séparé aurait obligé à swapper
deux fois — et un oubli aurait donné un bouton violet au survol turquoise.

Un voile se compose sur le fond qui est dessous : il **s'adapte donc tout seul au
thème sombre**. C'est pourquoi les tokens alpha sont identiques en light et dark,
et n'apparaissent pas dans le bloc `[data-theme="dark"]` du CSS généré.

**Pourquoi c'est indispensable.** Les rampes dessinées à la main dérivaient les
unes des autres : le `500` valait 55 % de luminosité en `gray` et 89 % en
`turquoise` (un néon). Résultat, un bouton primaire en tonique turquoise donnait
un contraste de **1,85:1 — illisible**. Comme les rôles `brand` sont
interchangeables, un rôle sémantique ne peut tenir sa promesse de contraste que
si toutes les palettes partagent la même courbe. Après régénération, le même
bouton est à **4,60:1 (WCAG AA)**, et light comme dark passent AA.

> ⚠️ Cette régénération a **déplacé les valeurs issues de Figma**. Les teintes
> sont conservées (l'identité de chaque palette), mais les hex exacts ont changé.
> Le néon `#01fee2` que le design plaçait en `turquoise.500` n'existe plus dans
> la rampe : perceptuellement il valait un cran ~150, pas un 500. À rapprocher du
> design si cette couleur précise a une valeur de marque.

- **OKLCH et pas HSL** : la luminosité HSL n'est pas perceptuelle (un jaune et un
  bleu à `L=50 %` n'ont rien à voir à l'œil). OKLCH, si. `scripts/oklch.js`
  contient les conversions, y compris la réduction de chroma pour rester dans le
  gamut sRGB.
