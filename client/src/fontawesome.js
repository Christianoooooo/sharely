import { config } from '@fortawesome/fontawesome-svg-core';

// Font Awesome injects its CSS unlayered, which beats Tailwind 4's layered
// utilities and resets every h-*/w-* on icons to 1em; index.css imports it
// into the base layer instead. Must run before any icon renders.
config.autoAddCss = false;
