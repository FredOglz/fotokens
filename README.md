# fotokens

Librairie de **design tokens** agnostique de tout framework. Ce repo ne contient
**que des tokens** — pas de composants UI. Il est destiné à être consommé par un
package de composants séparé.

Les tokens sont au format **DTCG** (`$value` / `$type` / `$description`), le
standard du W3C, et transformés par [Style Dictionary](https://styledictionary.com/).

**📖 Documentation visuelle** — ouvre `docs/index.html` dans un navigateur : les 8
rampes, le contrat de rôle, les 17 composants rendus en vrai, et un basculement
clair/sombre.

---

## L'idée en une minute

Un design system doit tenir deux promesses contradictoires : **être rebrandable**
(chaque projet a ses couleurs) et **garantir l'accessibilité** (le contraste tient,
quoi qu'on choisisse).

Ce repo les tient toutes les deux, par construction :

1. **Toutes les palettes partagent la même courbe de luminosité**, calculée en
   OKLCH. À cran égal, deux palettes ont la même luminosité perçue.
2. **Les 6 rôles sémantiques exposent les mêmes slots, mappés sur les mêmes crans.**

D'où : si `on`/`main` passe AA pour *un* rôle, ça passe AA pour *les six*. Et
changer la tonique d'un projet ne peut pas casser le contraste.

> **30 combinaisons texte/fond mesurées sur le CSS généré. Toutes WCAG AA.**
> Aucun token n'a été ajusté à la main.

---

## Architecture — 4 couches

```
Primitives  →  Brand (sélection)  →  Sémantique (par mode)  →  Composant
(catalogue)    (le projet choisit)    (les rôles)              (l'usage)
```

| Couche | Dossier | Rôle | Peut référencer |
| --- | --- | --- | --- |
| **1. Primitives** | `tokens/primitives/` | Le catalogue brut : 8 palettes, échelles de taille, familles de police, durées. Aucune sémantique. | Rien — que des valeurs brutes. |
| **2. Brand** | `tokens/brand/` | **La sélection du projet.** Quelle palette joue quel rôle : `primary → violet`, `neutral → slateBlue`… | Un **primitive**. |
| **3. Sémantique** | `tokens/themes/` | Le **contrat de rôle**, plus `surface`/`text`/`border`/`state`/`focus`/`shadow`. Décliné par **mode** (clair/sombre, desktop/mobile). | La couche **brand**. |
| **4. Composant** | `tokens/components/` | 17 composants. | La couche **sémantique**. |

### Les 3 règles de layering

> - Un token de **composant** référence un rôle **sémantique**, jamais une couche plus basse.
> - Un rôle **sémantique** de couleur référence la couche **brand**, jamais un primitive.
> - Un token **brand** référence un **primitive**, jamais une valeur brute.

Elles sont mécaniquement vérifiables : un `grep` suffit à prouver qu'aucun
composant ne pointe sur une palette.

### La chaîne de résolution

Un token de composant ne connaît ni les palettes ni les hex. Il ne connaît qu'un rôle.

```css
--color-button-filled-primary-default-background: var(--color-role-primary-main);
--color-role-primary-main:                        var(--color-brand-primary-600);
--color-brand-primary-600:                        var(--color-violet-600);
--color-violet-600:                               #9500ee;
```

C'est ce chaînage qui rend les blocs `dark` et `mobile` minuscules : quand le mode
change, seule la var() **sémantique** est redéfinie — les 1131 tokens de composant
suivent tout seuls, sans être réémis.

---

## Le contrat de rôle

La pièce maîtresse. Les **6 rôles** — `primary`, `neutral`, `success`, `warning`,
`danger`, `info` — exposent **exactement les mêmes 9 slots**, mappés sur
**exactement les mêmes crans** :

| Slot | Clair | Sombre | À quoi ça sert |
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

**Conséquence directe :** `<Button color="danger">` fonctionne **sans un token de
plus**. Un composant qui sait afficher `primary` sait afficher les cinq autres.

### Deux règles de nommage non négociables

> **Un nom de rôle décrit un usage, jamais une apparence.**
> Pas de `dark` / `darker` pour dire « survol » et « pressé » : en thème sombre, le
> survol doit être *plus clair* — le nom deviendrait un mensonge. D'où `hover` et
> `active`.

> **Un mot, un sens.**
> `surface` désigne *uniquement* les fonds (`surface.base`, `surface.raised`…). Le
> voile alpha d'un rôle s'appelle `tint` — jamais `surface`.

---

## Démarrer un projet

```bash
npm install
npm run build     # → dist/ et docs/
```

### Choisir l'identité du projet

Éditer **une ligne** dans la table `BRAND` de `scripts/generate-theme.js`, puis
`npm run theme` :

```js
const BRAND = {
  primary: 'turquoise',   // ← était 'violet'
  neutral: 'slateBlue',
  success: 'green', warning: 'orange', danger: 'red', info: 'blue',
};
```

Rien d'autre ne bouge : ni le contrat de rôle, ni les composants. Tous les boutons,
liens et états actifs de l'app suivent. **N'importe quelle palette peut jouer
n'importe quel rôle** — elles exposent toutes les mêmes 11 crans sur la même courbe
de luminosité, donc un swap ne casse ni le build, ni les contrastes.

### Consommer les tokens

```css
@import 'fotokens/dist/tokens.css';      /* le système */
@import 'fotokens/dist/components.css';  /* les composants (optionnel) */

.btn-filled {
  background:    var(--color-button-filled-primary-default-background);
  color:         var(--color-button-filled-primary-default-text);
  height:        var(--size-button-md-height);
  padding:       0 var(--space-button-md-padding-x);
  border-radius: var(--radius-button-md);
}

/* Changer de couleur = changer le rôle. Aucun token nouveau. */
.btn-filled[data-color="danger"] {
  background: var(--color-button-filled-danger-default-background);
}
```

Thème sombre : `<html data-theme="dark">`. Le responsive est automatique.

---

## Les composants

**17 composants, 1131 tokens, zéro écrit à la main.**

| | Composants |
| --- | --- |
| **Role-aware** (générés ×6 rôles) | `button` `badge` `tag` `alert` `checkbox` `radio` `switch` `link` |
| **Neutres** | `input` `textarea` `select` `card` `tooltip` `modal` `menu` `tabs` `table` |

Tout vient de tables de mapping dans `scripts/generate-components.js`. La variante
déclare seulement **quels slots du rôle elle consomme** ; le rôle reste un paramètre :

```js
outlined: {
  default:  { background: '{color.surface.transparent}', text: 'text', border: 'border' },
  hover:    { background: 'tint',       text: 'text', border: 'main' },
  active:   { background: 'tintStrong', text: 'text', border: 'main' },
}
```

Les composants interactifs ont **3 tailles** (`sm` / `md` / `lg`).

> ⚠️ **Sur mobile, les contrôles GRANDISSENT.** C'est la seule famille de tailles
> qui augmente au lieu de diminuer : une cible tactile doit faire au moins 44px
> (WCAG 2.5.5). Un bouton `md` passe de **40px** en desktop à **52px** sous 768px.

---

## Sorties générées

| Fichier | Contenu | Poids gzippé |
| --- | --- | --- |
| `dist/tokens.css` | Le système : primitives, brand, rôles sémantiques | **5,3 Ko** |
| `dist/components.css` | Les 1131 tokens de composant — **requiert `tokens.css`** | **5,6 Ko** |
| `dist/tokens.json` | Le dictionnaire complet, à plat, valeurs résolues | — |

Les composants pèsent 73 % du dictionnaire : ils sont dans un fichier **à part**,
pour qu'un projet qui écrit ses propres composants n'importe que le système.

`tokens.css` contient trois blocs :

```css
:root                      { /* thème clair, tailles desktop */ }
[data-theme="dark"]        { /* uniquement ce qui change */ }
@media (max-width: 768px)  { /* uniquement ce qui change */ }
```

Les blocs de surcharge ne réémettent **que les tokens dont la valeur diffère
réellement**. Un rôle déclaré à l'identique dans les deux modes ne produit aucune
ligne.

---

## Les fichiers générés

⚙️ **Ne pas éditer à la main — ils seraient écrasés.**

| Fichier | Généré par |
| --- | --- |
| `tokens/primitives/color.json` | `npm run ramps:write` |
| `tokens/brand/default.json` · `tokens/themes/mode/*.json` | `npm run theme` |
| `tokens/components/*.json` | `npm run components` |
| `docs/` · `dist/` | `npm run build` |

**Les tables de mapping dans `scripts/` sont la vraie source de vérité.** Écrire ces
~1600 tokens à la main, c'est garantir qu'ils divergeront.

### Les rampes de couleur

Chaque palette est définie par son **identité** — une teinte + un pic de chroma — et
ses 11 crans sont calculés en **OKLCH** sur une courbe de luminosité **partagée par
toutes les palettes**. Ajouter une palette = **une ligne** :

```js
const PALETTES = {
  violet: { hue: 304, chroma: 0.297 },
  // …
};
```

> **Pourquoi c'est indispensable.** Les rampes dessinées à la main dérivaient : le
> cran 500 valait 55 % de luminosité en `gray` et 89 % en `turquoise` (un néon). Un
> bouton primaire en turquoise donnait un contraste de **1,85:1 — illisible**. Comme
> les rôles sont interchangeables, un rôle ne peut tenir sa promesse de contraste que
> si toutes les palettes partagent la même courbe. Après régénération : **4,60:1**.

**OKLCH et pas HSL** : la luminosité HSL n'est pas perceptuelle — un jaune et un bleu
à `L=50 %` n'ont rien à voir à l'œil. OKLCH, si.

---

## Structure

```
tokens/
  primitives/            # le catalogue — jamais modifié par projet
    color.json           # ⚙️ 8 palettes × 11 crans + voiles alpha
    size.json            # spacing, font, radius, border, control, glyph, breakpoint
    typography.json      # familles, graisses, interlignes
    effect.json          # durées, courbes, opacités, géométries d'ombre
  brand/
    default.json         # ⚙️ quelle palette joue quel rôle
  themes/
    mode/                # ⚙️ tout ce qui dépend du clair/sombre : couleurs ET ombres
      light.json
      dark.json
    size/                # desktop.json / mobile.json
    typography/
    effect/
  components/            # ⚙️ les 17 composants
config/
  build.js               # build multi-modes, sortie scindée
scripts/
  generate-ramps.js      # ⭐ les rampes OKLCH
  generate-theme.js      # ⭐ brand + contrat de rôle
  generate-components.js # ⭐ les 17 composants
  build-docs.js          # la doc visuelle
  oklch.js               # conversions sRGB ↔ OKLCH
docs/                    # ⚙️ 10 pages, autonomes (servables par GitHub Pages)
dist/                    # ⚙️ gitignoré
```

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run build` | Génère `dist/` et `docs/` |
| `npm run theme` | Régénère brand + rôles depuis les tables, puis build |
| `npm run components` | Régénère les 17 composants, puis build |
| `npm run ramps` | Aperçu des rampes (n'écrit rien) |
| `npm run ramps:write` | Régénère `tokens/primitives/color.json` |
| `npm run docs` | Régénère `docs/` |
| `npm run watch` | Rebuild à chaque modification |

---

## Notes techniques

- **Pourquoi un `build.js` et pas la CLI Style Dictionary ?** `mode/light.json` et
  `mode/dark.json` déclarent les *mêmes* chemins de tokens avec des valeurs
  différentes — ils ne peuvent pas cohabiter dans une seule source (collision). On
  lance donc un build par combinaison de modes, puis on concatène les blocs.

- **Breakpoints.** Une media query CSS **ne peut pas** lire une custom property :
  `@media (max-width: var(--size-breakpoint-md))` ne fonctionne pas. Le build lit
  donc `size.breakpoint.md` dans les tokens et inline sa valeur. Une seule source de
  vérité.

- **Les voiles alpha d'une palette vivent DANS la palette** (`color.violet.alpha.5`),
  pas dans un groupe séparé : le rôle `brand.primary` alias la palette *entière*, donc
  changer la tonique emporte l'alpha avec elle. Un groupe séparé obligerait à swapper
  deux fois — et un oubli donnerait un bouton violet au survol turquoise.

- **Les voiles neutres, eux, sont ABSOLUS** (`color.alpha.white.*`,
  `color.alpha.black.*`) et vivent bien dans un groupe à part : un survol de ligne de
  tableau ou un scrim de modale ne doivent **jamais** changer de teinte au rebranding.
  Ce sont eux aussi qui permettent aux voiles d'état de s'inverser — en clair on
  assombrit, en sombre on éclaircit.

- **Les ombres sont émises en valeurs résolues**, pas en `var()`. Style Dictionary
  réinjecte les `var()` dans une valeur courte par recherche de chaîne : quand
  `offsetX` vaut `0` et le `spread` aussi, il intervertit les deux positions.

- **Le build échoue bruyamment** si un token sort en `undefined`. Style Dictionary,
  lui, ne bronche pas — il écrirait un CSS entièrement vide en affichant ✔.

- **Le `watch`** s'appuie sur `chokidar-cli` : la CLI Style Dictionary v4 n'a pas de
  mode watch natif.

- **Le package n'est pas publié** (`"private": true`). Le nom `fotokens` est réservé
  localement ; vérifie sa disponibilité sur npm avant toute publication.
