# Reader fonts

The build copies these unmodified WOFF2 files and their licences to `/fonts/reader/`. Each family is licensed under SIL Open Font License 1.1. The licences retain upstream copyright and reserved font names.

| Family | Official repository | Pinned commit | Source path | Licence |
|---|---|---|---|---|
| Inter | [rsms/inter](https://github.com/rsms/inter) | `353b61b9f4430d5f420d56605a6e7993e0941470` | `docs/font-files/InterVariable*.woff2` | [Inter-LICENSE.txt](Inter-LICENSE.txt) |
| IBM Plex Serif | [IBM/plex](https://github.com/IBM/plex) | `bf260093582f04622aacc1e9f9ca604d7ccd0c42` | `packages/plex-serif/fonts/complete/woff2/IBMPlexSerif-*.woff2` | [IBMPlex-LICENSE.txt](IBMPlex-LICENSE.txt) |
| iA Writer Duospace | [iaolo/iA-Fonts](https://github.com/iaolo/iA-Fonts/tree/162a138a4e661fe7afeeb028b89b16bf5dcdd33d/iA%20Writer%20Duospace) | `162a138a4e661fe7afeeb028b89b16bf5dcdd33d` | `iA Writer Duospace/Webfonts/iAWriterDuospace-*.woff2` | [iAWriterDuospace-LICENSE.md](iAWriterDuospace-LICENSE.md) |

Inter includes variable roman and italic faces. IBM Plex Serif and iA Writer Duospace include regular, italic, bold, and bold italic faces. The Duospace files are pinned to the revision before upstream removed that directory; the newer iA Writer Duo is a separate family.

CSS aliases `Reader Inter`, `Reader Plex`, and `Reader Duo` scope font selection to the reader. They do not modify the font files or their internal names. Replacing a font requires updating its pinned source and licence and verifying every face with `pnpm test:browser`.
