# Film music

The film uses **Gear** by Andrew Ev, a positive, driving electronic house track
from Mixkit. Its embedded tempo is 127 BPM. The edit opens on the rhythmic hook,
keeps a build and drop, then returns to the full arrangement for the closing pitch.
[`scripts/soundtrack.mjs`](https://github.com/vitaliiznak/granum-grid/blob/media-studio/media/scripts/soundtrack.mjs) on the `media-studio` branch holds the source, license,
SHA-256 checksum, credit, and reproducible edit.

- Track listing: https://mixkit.co/free-stock-music/tag/corporate/ (Gear, Andrew Ev)
- Recording: https://assets.mixkit.co/music/180/180.mp3
- License: https://mixkit.co/license/#musicFree
- License text: https://mixkit.co/license/modal/musicFree/
- Verified: 2026-10-14 against Mixkit's track metadata, music license, and terms
- Original duration: 245.734 seconds; stereo MP3 at 44.1 kHz

The Mixkit Stock Music Free License permits commercial web and social media
videos, including online marketing ads. Attribution is optional; the film's outro
and exported `-description.txt` retain the artist and source. The music license
is separate from this repository's software license. It excludes TV/radio
broadcasts, CDs/DVDs, video games, standalone music redistribution, and registering
the recording with a rights-management service. See the linked terms for details.

The film uses source sections starting at 0:00, 1:00.472, and 3:16.535. These cuts
follow the track's 8- and 16-bar structure, with 25 ms crossfades. The long quiet
passages are omitted. The final section is trimmed to picture, with a 4-second
fade out; extended captures can loop the source. Single-scene exports use the
opening hook. The mix targets -16 LUFS with a -2.5 dBTP master ceiling before AAC.

On that branch, download once with `node media/scripts/soundtrack.mjs fetch`. The script validates
the checksum before caching the source in Git-ignored `output/music/`. Captures
validate it again, work offline, and fail early if it is missing or changed.
Keep the standalone cached recording out of version control. The output intended
for sharing is the synchronized film.
