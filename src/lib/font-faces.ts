import { withBase } from "./base-path";

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";

function face(opts: {
  family: string;
  file: string;
  weight?: string;
  style?: string;
  unicodeRange: string;
}) {
  const weight = opts.weight ?? "400";
  const style = opts.style ?? "normal";
  return `@font-face {
  font-family: "${opts.family}";
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url("${withBase(`/fonts/${opts.file}`)}") format("woff2");
  unicode-range: ${opts.unicodeRange};
}`;
}

export function fontFaceCss() {
  return [
    face({ family: "Instrument Serif", file: "instrument-serif-latin-400.woff2", unicodeRange: LATIN }),
    face({
      family: "Instrument Serif",
      file: "instrument-serif-latin-400-italic.woff2",
      style: "italic",
      unicodeRange: LATIN,
    }),
    face({ family: "IBM Plex Sans", file: "ibm-plex-sans-cyrillic-400.woff2", unicodeRange: CYRILLIC }),
    face({
      family: "IBM Plex Sans",
      file: "ibm-plex-sans-cyrillic-500.woff2",
      weight: "500",
      unicodeRange: CYRILLIC,
    }),
    face({
      family: "IBM Plex Sans",
      file: "ibm-plex-sans-cyrillic-600.woff2",
      weight: "600",
      unicodeRange: CYRILLIC,
    }),
    face({ family: "IBM Plex Sans", file: "ibm-plex-sans-latin-400.woff2", unicodeRange: LATIN }),
    face({
      family: "IBM Plex Sans",
      file: "ibm-plex-sans-latin-500.woff2",
      weight: "500",
      unicodeRange: LATIN,
    }),
    face({
      family: "IBM Plex Sans",
      file: "ibm-plex-sans-latin-600.woff2",
      weight: "600",
      unicodeRange: LATIN,
    }),
  ].join("\n\n");
}
