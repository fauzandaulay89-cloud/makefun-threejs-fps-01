// The look plan, in one place. EMBERLINE is a container yard at dusk:
// deep blue shadow, amber sun, teal team markers. Every colour used by the
// game is one of these names; the same names are the CSS custom properties
// in index.html, so the page and the 3D scene cannot drift apart.
export const PALETTE = {
  canvas: '#161a26',
  surface: '#232838',
  hairline: '#39415a',
  ink: '#ece7db',
  muted: '#9aa3b5',
  accent: '#f0a830',
  teal: '#35c4a8',
  ember: '#e4572e',
};

// Look a colour up by name instead of inventing hex values at call sites.
export function shade(name) {
  return PALETTE[name];
}
