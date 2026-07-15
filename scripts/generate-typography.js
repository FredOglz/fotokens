/**
 * Génère la couche sémantique de la TYPOGRAPHIE à partir de la table ci-dessous.
 *
 * POURQUOI UN RÔLE PORTE SA TAILLE. Avant, un rôle typo donnait la famille, la
 * graisse et l'interligne — mais pas la taille, qui vivait dans le thème `size`
 * (parce qu'elle est la seule dimension typo à changer entre desktop et mobile).
 * Un rôle était donc INSUFFISANT pour styler quoi que ce soit : il fallait aller
 * chercher la taille ailleurs. Résultat, personne ne s'en servait — les 17
 * composants référençaient `{fontSize.*}` et n'avaient ni police ni graisse, et
 * la doc recollait les morceaux à la main en mélangeant deux rôles.
 *
 * La taille est donc revenue dans le rôle, mais par RÉFÉRENCE (`{fontSize.h1}`),
 * pas par valeur. C'est ce qui fait tenir les deux exigences à la fois :
 *
 *   --typography-h1-size: var(--font-size-h1);
 *   @media (max-width: 768px) { --font-size-h1: 32px; }   ← le thème size bascule
 *
 * Le rôle suit la bascule mobile sans jamais en entendre parler. Un composant
 * qui pointe sur le rôle en hérite à son tour.
 *
 * LE CONTRAT DE RÔLE. Les 10 rôles exposent EXACTEMENT les mêmes 6 slots — même
 * principe que les 6 rôles de couleur et leurs 9 slots. Un rôle incomplet est un
 * rôle qu'on contourne, et un rôle contourné ne sert à rien.
 *
 *   node scripts/generate-typography.js
 */
import { writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------ *
 * LE CONTRAT — 6 slots, et d'où chacun tire sa valeur.
 *
 * `family` pointe sur le BRAND (`font.brand.*`), jamais sur le catalogue
 * (`font.stack.*`) : c'est cette indirection qui rend la typo rebrandable en
 * une ligne. `size` pointe sur le thème size, d'où la bascule mobile gratuite.
 * Les trois autres pointent sur les primitives.
 * ------------------------------------------------------------------ */

const SLOTS = {
  family:        { $type: 'fontFamily', ref: (v) => `{font.brand.${v}}` },
  size:          { $type: 'dimension',  ref: (v) => `{fontSize.${v}}` },
  weight:        { $type: 'fontWeight', ref: (v) => `{font.weight.${v}}` },
  lineHeight:    { $type: 'number',     ref: (v) => `{font.lineHeight.${v}}` },
  letterSpacing: { $type: 'dimension',  ref: (v) => `{font.letterSpacing.${v}}` },
  // Pas de $type : `textCase` n'existe pas au vocabulaire DTCG. Il est là quand
  // même, parce qu'un rôle doit se suffire à lui-même — sans lui, `overline` ne
  // serait pas capitalisé et le consommateur devrait le savoir de tête.
  textCase:      { $type: null,         ref: (v) => v },
};

/* ------------------------------------------------------------------ *
 * LES RÔLES. Cette table EST la décision de design typographique.
 *
 * Le crénage suit une logique optique, pas décorative : on RESSERRE ce qui est
 * gros (à 48px, l'espacement dessiné pour du texte courant paraît lâche) et on
 * AÈRE ce qui est petit ou capitalisé.
 * ------------------------------------------------------------------ */

const ROLES = {
  h1: {
    desc: 'Titre de page. Un seul par écran.',
    family: 'heading', size: 'h1', weight: 'bold', lineHeight: 'tight', letterSpacing: 'tight', textCase: 'none',
  },
  h2: {
    desc: 'Titre de section.',
    family: 'heading', size: 'h2', weight: 'bold', lineHeight: 'tight', letterSpacing: 'tight', textCase: 'none',
  },
  h3: {
    desc: 'Sous-titre, titre de carte.',
    family: 'heading', size: 'h3', weight: 'semibold', lineHeight: 'tight', letterSpacing: 'snug', textCase: 'none',
  },
  lead: {
    desc: 'Chapô — le paragraphe d’introduction qui suit un titre.',
    family: 'body', size: 'lead', weight: 'regular', lineHeight: 'normal', letterSpacing: 'normal', textCase: 'none',
  },
  body: {
    desc: 'Texte de lecture. Le rôle par défaut.',
    family: 'body', size: 'body', weight: 'regular', lineHeight: 'normal', letterSpacing: 'normal', textCase: 'none',
  },
  small: {
    desc: 'Texte secondaire : mentions, aide contextuelle, cellules de tableau.',
    family: 'body', size: 'small', weight: 'regular', lineHeight: 'normal', letterSpacing: 'normal', textCase: 'none',
  },
  label: {
    desc: 'Texte d’interface : bouton, onglet, étiquette de champ. Interligne serré (jamais plus d’une ligne) et graisse medium, pour tenir sans crier.',
    family: 'body', size: 'small', weight: 'medium', lineHeight: 'tight', letterSpacing: 'normal', textCase: 'none',
  },
  caption: {
    desc: 'Légende sous une image, note de bas de tableau. Au plancher de 12px, donc légèrement aéré pour rester lisible.',
    family: 'body', size: 'caption', weight: 'regular', lineHeight: 'normal', letterSpacing: 'wide', textCase: 'none',
  },
  overline: {
    desc: 'Surtitre en capitales, au-dessus d’un titre. Capitalisé PAR LE TOKEN — le rôle se suffit à lui-même.',
    family: 'body', size: 'caption', weight: 'semibold', lineHeight: 'normal', letterSpacing: 'caps', textCase: 'uppercase',
  },
  code: {
    desc: 'Code et valeurs techniques. Le seul rôle en chasse fixe.',
    family: 'mono', size: 'small', weight: 'regular', lineHeight: 'normal', letterSpacing: 'normal', textCase: 'none',
  },
};

/* ------------------------------------------------------------------ *
 * Génération.
 * ------------------------------------------------------------------ */

function buildTypography() {
  const typography = {};

  for (const [role, def] of Object.entries(ROLES)) {
    typography[role] = { $description: def.desc };

    for (const [slot, { $type, ref }] of Object.entries(SLOTS)) {
      const value = def[slot];
      if (value === undefined) {
        // Le contrat est le contrat : un rôle qui n'expose pas les 6 slots est
        // un rôle qu'on ira contourner. On échoue plutôt que de laisser un trou.
        throw new Error(`Rôle « ${role} » : slot « ${slot} » manquant.`);
      }
      typography[role][slot] = $type
        ? { $type, $value: ref(value) }
        : { $value: ref(value) };
    }
  }

  return { typography };
}

const data = buildTypography();
const path = 'tokens/themes/typography/default.json';
writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

const roles = Object.keys(ROLES).length;
const slots = Object.keys(SLOTS).length;
console.log(`  ✔ ${path.padEnd(38)} ${roles} rôles × ${slots} slots = ${roles * slots} tokens`);
