/**
 * Country flags, drawn inline.
 *
 * Three approaches were available and two were wrong for this project:
 *
 *   Emoji (🇺🇸) costs nothing but renders as the bare letters "US" on Windows,
 *   which is exactly the text it was meant to replace — so on a large share of
 *   visitors it would add nothing at all.
 *
 *   A flag CDN or an icon package means an external request or a dependency.
 *   The Content Security Policy restricts every origin to 'self' precisely so a
 *   pasted prompt cannot leave the page; punching a hole in it for decoration
 *   would be a poor trade.
 *
 * The catalog has four countries. Four small SVGs cost about a kilobyte, render
 * identically everywhere, stay crisp at any zoom, and inherit the page's own
 * border colour so they sit correctly in both themes.
 *
 * They are decorative: the two-letter code stays next to them as the accessible
 * name, so nothing depends on recognising a flag.
 */

const RATIO = { width: 16, height: 12 };

function Us() {
  return (
    <>
      <rect width="16" height="12" fill="#fff" />
      {/* Seven red stripes at 12/13 of the height, simplified to 6 drawn bands. */}
      {[0, 2, 4, 6, 8, 10].map((y) => (
        <rect key={y} y={y} width="16" height="0.92" fill="#B22234" />
      ))}
      <rect width="6.8" height="6.46" fill="#3C3B6E" />
    </>
  );
}

function Cn() {
  return (
    <>
      <rect width="16" height="12" fill="#DE2910" />
      <path d="M2.6 1.6l.65 2 -1.7-1.24h2.1L2 3.6z" fill="#FFDE00" />
      {[
        [5.6, 1.1],
        [6.9, 2.3],
        [6.9, 4.0],
        [5.6, 5.2],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.5" fill="#FFDE00" />
      ))}
    </>
  );
}

function Fr() {
  return (
    <>
      <rect width="16" height="12" fill="#fff" />
      <rect width="5.33" height="12" fill="#002395" />
      <rect x="10.67" width="5.33" height="12" fill="#ED2939" />
    </>
  );
}

function Ca() {
  return (
    <>
      <rect width="16" height="12" fill="#fff" />
      <rect width="4" height="12" fill="#D80621" />
      <rect x="12" width="4" height="12" fill="#D80621" />
      {/* A maple leaf at 16px is a red blob; a clean stylised mark reads better. */}
      <path
        d="M8 2.4l.7 1.5 1.5-.5-.6 1.6 1.2.5-1.2.8.3 1.1-1.5-.3-.1 1.7h-.6l-.1-1.7-1.5.3.3-1.1-1.2-.8 1.2-.5-.6-1.6 1.5.5z"
        fill="#D80621"
      />
    </>
  );
}

const FLAGS: Record<string, () => JSX.Element> = { US: Us, CN: Cn, FR: Fr, CA: Ca };

/**
 * The written-out name, for the places a two-letter code is not enough.
 *
 * The code is the accessible name everywhere a flag merely decorates a row.
 * A country *control* is different: "CN" is a label you have to already know,
 * and the country filter is the one place in the app where somebody is looking
 * for China by name. Unknown codes fall through to the code itself, so a
 * provider from a country with no flag drawn still gets a usable button.
 */
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CN: 'China',
  FR: 'France',
  CA: 'Canada',
};

export function countryName(code: string): string {
  const upper = code.toUpperCase();
  return COUNTRY_NAMES[upper] ?? upper;
}

interface FlagProps {
  /** ISO-3166 alpha-2 code. Anything unrecognised renders nothing. */
  country: string | undefined;
}

export function Flag({ country }: FlagProps) {
  const Shape = country ? FLAGS[country.toUpperCase()] : undefined;
  if (!Shape) return null;

  return (
    <svg
      className="flag"
      viewBox={`0 0 ${RATIO.width} ${RATIO.height}`}
      width={RATIO.width}
      height={RATIO.height}
      aria-hidden="true"
      focusable="false"
    >
      <Shape />
      {/* A hairline in the theme's own border colour, so the white flags do not
          dissolve into a light panel or glare on a dark one. */}
      <rect
        x="0.25"
        y="0.25"
        width={RATIO.width - 0.5}
        height={RATIO.height - 0.5}
        fill="none"
        stroke="var(--border)"
        strokeWidth="0.5"
        rx="1"
      />
    </svg>
  );
}

/** The flag and its code together — the pairing used everywhere in the UI. */
export function CountryTag({ country }: FlagProps) {
  if (!country) return null;
  return (
    <span className="country-tag">
      <Flag country={country} />
      {country}
    </span>
  );
}
