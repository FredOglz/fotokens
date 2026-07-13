// sRGB <-> OKLCH (Björn Ottosson). Espace perceptuellement uniforme.
export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklab([r, g, b]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [lr, lg, lb].map(toGamma);
}

export const oklabToOklch = ([L, a, b]) => [
  L,
  Math.hypot(a, b),
  ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
];

export const oklchToOklab = ([L, C, h]) => [
  L,
  C * Math.cos((h * Math.PI) / 180),
  C * Math.sin((h * Math.PI) / 180),
];

export const hexToOklch = (hex) => oklabToOklch(rgbToOklab(hexToRgb(hex)));

const inGamut = ([r, g, b]) => [r, g, b].every((c) => c >= -0.0001 && c <= 1.0001);

/** Convertit OKLCH → hex en réduisant la chroma jusqu'à rentrer dans le gamut sRGB. */
export function oklchToHex([L, C, h]) {
  let lo = 0, hi = C;
  if (inGamut(oklabToRgb(oklchToOklab([L, C, h])))) lo = C;
  else {
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToRgb(oklchToOklab([L, mid, h])))) lo = mid;
      else hi = mid;
    }
  }
  const rgb = oklabToRgb(oklchToOklab([L, lo, h]));
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0'))
      .join('')
  );
}
