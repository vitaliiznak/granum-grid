# Film music

The film uses **Firefly** by Scott Buckley, a recorded piano, synth, and drum
arrangement licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
[`scripts/soundtrack.mjs`](scripts/soundtrack.mjs) holds the track page, download URL,
license link, SHA-256 checksum, and credit text.

- Artist usage guidance: https://www.scottbuckley.com.au/library/using-this-music/
- Verified: 2026-10-13
- Original duration: 157.356 seconds; stereo MP3 at 44.1 kHz

The artist permits synchronized commercial use with attribution. This film trims
and fades the track and adjusts its loudness. The outro credits the track; each
export also writes a `-description.txt` file with attribution for publication.
For YouTube, the artist specifically requires the credit in the video description.
Copy the credit and links from that file when publishing.

Download once with `node media/scripts/soundtrack.mjs fetch`. The script validates
the checksum before caching the source in Git-ignored `output/music/`. Captures
validate it again, work offline, and fail early if it is missing or changed.
Do not commit or publish the standalone cached recording or submit it to an audio
fingerprinting service. The output intended for sharing is the synchronized film.
