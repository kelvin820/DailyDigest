# Edition masthead trials

## Current approved selection

The user selected Elementary H, Junior C, and keeping Senior unchanged.

| Edition | Font | Weight | Width | Tracking |
|---|---|---|---|---|
| Elementary | H / Playfair Display | 600 | 92% | -0.030em |
| Junior | C / Old Standard TT Bold | 700 | 70% | -0.070em |
| Senior | Libre Caslon Text | 700 | unchanged | unchanged |

Junior uses the settings visible in the user's selected C preview. Elementary
uses H's trial defaults. Web and PDF share these settings. Only the wordmark
is compressed; the by DayDay signature and all article typography are retained.
The font study is archived under `devtools/mastheads/` and is no longer shipped in the public reader.
The following sections describe earlier rounds, superseded by this selection.

## Round 1

The Elementary masthead retains its original font, weight, size, and spacing.
Only the Junior and Senior `DAILY DIGEST` mastheads change. Article typography,
edition colors, and the `by DayDay` signature retain the existing design.

- Junior: Instrument Serif Regular, a tall, narrow, high-contrast serif inspired
  by the newspaper character of The Wall Street Journal.
- Senior: Libre Caslon Text at weight 700, a heavier, broader serif inspired by
  the Financial Times masthead.

These are open-source font trials, not either publisher's proprietary typeface.
Both are bundled locally under the SIL Open Font License, including in the
web preview and PDF renderer. No third-party font request is needed at runtime.

Sources:

- https://github.com/google/fonts/tree/main/ofl/instrumentserif
- https://github.com/google/fonts/tree/main/ofl/librecaslontext

Licenses are preserved in `public/fonts/InstrumentSerif-OFL.txt` and
`public/fonts/LibreCaslonText-OFL.txt`.


## Round 2: eight selectable alternatives

The user found the first two substitutes insufficiently similar. The new
`devtools/mastheads/mastheads.html` study offers eight additional candidates in one layout,
plus the two previous faces as baselines. It supports paper color, supported
font weights, horizontal width, tracking, reset, URL/local selection retention,
and copying the selected values. Unsupported weights are disabled rather than
synthesized. The Elementary reader masthead remains unchanged.

| Choice | Font | Source folder in google/fonts/ofl |
|---|---|---|
| A | Bodoni Moda | bodonimoda |
| B | GFS Didot | gfsdidot |
| C | Old Standard TT Bold | oldstandardtt |
| D | Prata | prata |
| E | Libre Caslon Display | librecaslondisplay |
| F | DM Serif Display | dmserifdisplay |
| G | Cormorant Garamond | cormorantgaramond |
| H | Playfair Display | playfairdisplay |

All fonts and their OFL files are local under public/fonts; the catalog records
the filename, license, supported weight range, and trial defaults. No hosted
font service or purchase is required. The original reader and PDF defaults
remain on Round 1 until the user selects the new treatment. The trial page
states this explicitly.

Research references distinguish the publishers' custom lettering from these
open-source trials:

- MCKL's WSJ-derived Journal House letterforms: https://www.mckltype.com/custom/journalhouse
- Order's Journal House identity: https://order.design/project/journal-house
- Klim's Financial Times typography: https://klim.co.nz/in-use/financial-times/

Verification: ten actual loaded fonts at 320/375/768/1440, fitting title bounds,
reader navigation, paper/card/keyboard controls, reload retention, reset, invalid
URL parameters and refused local storage; no browser errors or external requests.
Evidence is in output/masthead-trials/verification.json and gallery screenshots.
