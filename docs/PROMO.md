# The promo video

`promptspend-promo.mp4` — 1 minute 53, 1920×1080, shipped as a **release asset**
rather than committed. At ~23 MB it would otherwise be by far the heaviest thing
in the repository, and every rebuild would add another copy to history forever.

```
[ title card 1.7s ] → [ AI hero shot 6.4s ] → [ real-UI core 103s ] → [ AI end card 3.6s ]
```

The title card is frame 0, and frame 0 is the thumbnail. GitHub's inline player
is generated from a bare attachment URL and its markdown sanitiser strips
author-written `<video>`, so there is no `poster` attribute a README can set —
the browser just shows the first frame. The hero clip opens near-black while the
light builds, which rendered as an empty rectangle on the repository front page.
Putting a designed card at the head fixes the thumbnail and reads as a title
rather than as a workaround.

## Reading time

The first cut held each finished frame for about a second — enough to see a
composition, not enough to read one. `HOLD` in `make-promo.py` now sets the
settled time per scene, and it is deliberately uneven: the estimate and trust
scenes carry several times more to read than the call to action, so a flat
addition would have left the dense frames rushed and the sparse ones dawdling.

The working figure is roughly 180 words per minute — the rate subtitle standards
use for text the viewer has not seen before — discounted for the fact that most
of each composition has already faded in and been read during the animated
portion. Screenshots count as scanning rather than reading, but four cost cards
still take longer to absorb than one headline.

## The rule that shapes it

This project's first rule is that **a claim on screen must be true of the code**.
A promo is the easiest place to break that: mockups are quicker to make than
screenshots, and nobody notices when a marketing frame quietly stops matching
the product.

So every screen in the core is a genuine screenshot of the built site, captured
by Playwright, showing real prices from the committed catalog. There is no
mockup anywhere in the video. The typefaces are the site's own — Space Grotesk,
IBM Plex Sans and JetBrains Mono, converted out of the `@fontsource` WOFF files
the site itself serves — because overlay text sits directly beside screenshot
text in the same frame, and a near-miss typeface reads as a mistake.

The two sibling repositories (`claude-codex-bridge`, `claude-markitdown-hook`)
draw their whole core in PIL, because they are command-line tools and there was
nothing to film. That is the difference worth understanding before copying their
approach here.

### The published cut shows a freshness date the site no longer displays

Not a bug, and a deliberate decision not to re-cut. The film was captured on
2026-08-02, when the catalog carried a fabricated `provenance.lastChanged` on
every model, so three frames show it: the header (`prices last changed
2026-08-02`), the results pill (`PRICES CHANGED 2026-08-02`) and the pipeline
health panel. The data was corrected the next day — see the **Fixed** entries in
`CHANGELOG.md` — and the site now reads `not yet recorded` until a rate actually
moves.

Every price in the video is still correct; only the provenance dates aged. The
judgement was that a period artifact is not worth re-cutting and re-uploading,
since GitHub's `user-attachments` URLs are immutable and re-embedding is manual.
Worth knowing before the next rebuild: **re-capturing is enough to fix it** —
`capture-ui.ts` reads the live built site, so the frames come back correct on
their own with no edit to the video pipeline.

## Rebuilding it

The order matters: the captions are checked against the catalog, and the catalog
moves every morning.

```bash
# 1. Build and serve the site. BASE_PATH must be / or the capture 404s.
BASE_PATH=/ SITE_URL=http://127.0.0.1:4173 npm run build
npx vite preview --port 4173 --strictPort --host 127.0.0.1

# 2. Capture the real interface (writes assets/promo-frames/)
npx tsx tools/capture-ui.ts

# 3. Render the 103s core (also checks the figures, and writes the overlays)
python tools/make-promo.py

# 4. Stitch, with the two generative bookends and the music bed
bash tools/stitch-promo.sh HERO.mp4 assets/core.mp4 ENDCARD.mp4 \
  assets/title-overlay.png assets/endcard-logo.png BED.mp3 \
  assets/poster.png assets/promptspend-promo.mp4
```

**Re-uploading matters.** Changing the video changes the file, so the existing
`user-attachments` URL still serves the old cut — it is immutable. A rebuild
needs a fresh drag-and-drop and a new URL in the README, as well as
`gh release upload --clobber`.

`python tools/make-promo.py --check` runs step 3's verification alone. It fails
if a model in the captured estimate has been renamed or retired, or if the rates
have moved far enough that the saving shown on screen is no longer what the
engine would compute. **The screenshots stay current because they are captured;
the risk here is the reverse — the hand-written captions rotting around them.**

## The bookends

Generated with Veo 3.1 and ElevenLabs Music through fal.ai, ~$5.80 in total:

| Piece     | Model                     | Spec                    | Cost  |
| --------- | ------------------------- | ----------------------- | ----- |
| Hero      | `fal-ai/veo3.1`           | 8s, 1080p, native audio | $3.20 |
| End card  | `fal-ai/veo3.1`           | 4s, 1080p               | $1.60 |
| Music bed | `fal-ai/elevenlabs/music` | 76s instrumental        | $1.01 |

Both prompts are abstract light and haze on purpose. Generative video garbles
text and numbers, and this is a video about prices being correct — so nothing
generative is ever asked to render a figure, a word or an interface.

### The prompts, written down

The first cut did not record them, and `.gitignore` keeps the clips out of the
tree, so the 2026-08-04 re-cut had no bookends and no way to recreate the ones it
had lost. That cost $4.80 to rediscover. Both are recorded here now, with seeds,
because the clips are the only promo input that cannot be rebuilt from this
repository.

Endpoint `fal-ai/veo3.1`, `aspect_ratio: "16:9"`, `resolution: "1080p"`.

**Hero** — `duration: "8s"`, `generate_audio: true`, `seed: 73501`:

> Abstract macro shot of a dense field of luminous blue and cyan light particles
> bursting outward from a brilliant white core at the centre of frame, radiating
> in long motion-blurred streaks toward the camera through dark haze. Deep
> near-black background, shallow depth of field, soft bokeh orbs, faint teal and
> green highlights in the corners. Slow continuous camera push forward.
> Cinematic, premium, calm but energetic. Pure abstract light and haze only - no
> text, no letters, no numbers, no logos, no people, no objects, no user
> interface.

**End card** — `duration: "4s"`, `generate_audio: false`, `seed: 73502`:

> A still, calm, deep navy-blue field with a soft glowing cobalt-blue radial
> light in the centre of frame, tiny distant white star specks scattered across
> the picture, very gentle drifting haze. Almost no motion - the central light
> breathes slowly and settles. Minimal and airy, with clean empty space through
> the middle of the frame. Fills the whole widescreen frame edge to edge. Pure
> abstract light and haze only - no text, no letters, no numbers, no logos, no
> people, no objects, no user interface.

Both carry a negative prompt naming what must not appear — `text, letters, words,
numbers, captions, subtitles, watermark, logo, user interface, screen, monitor,
people, faces, hands, animals, buildings, clutter, letterbox, black bars,
widescreen bars`, with `cinematic crop, anamorphic bars` added to the end card.
The bar terms are load-bearing; see the letterbox note below.

The hero's native audio is used; the end card's is not, which is why it is
generated without any. Only the finished `promptspend-promo.mp4` and the
processed `.bed-looped.mp3` need keeping — the raw bed can be rebuilt from the
music prompt, and `stitch-promo.sh` re-derives the loop from it.

## Things that cost time

- **The end card may come back letterboxed, and the crop is now measured rather
  than written down.** Veo returns a cinematic ~2.34:1 crop for a still, slow
  prompt: the first end card's picture occupied rows 130–950 of 1080. That was
  measured with `cropdetect` and hard-coded as `crop=1458:820:231:130`, with a
  note here to re-measure on any new clip.

  The re-cut proved the note right in the direction nobody expected. Naming the
  bars in the negative prompt and asking for a full-frame picture returned a clip
  with **no bars at all**, and the old constant would have thrown away 260 good
  rows — not a crash, just a quietly worse picture that still looks fine.
  `stitch-promo.sh` now runs `cropdetect` itself from one second in (past the
  fade from black, which otherwise reports a nearly empty frame), takes the modal
  result, and crops only when the height is genuinely short. When it does crop,
  it derives the width at 16:9 and centres it, because removing the bars alone
  leaves a frame that then has to be squashed.

- **Capture by selector, never by pixel rectangle.** A hard-coded crop silently
  captures the wrong thing the first time a margin changes, and the video is then
  wrong in a way nobody notices until it is published.
- **`.health-grid` has no padding of its own**, so cropping it directly put the
  first label flush against the edge and the rounded corner in the video clipped
  the P off "PRICES LAST CHANGED". Capture `.panel:has(.health-grid)` instead.
- **The lower third needs a scrim.** The hero clip is bright, busy particle
  motion; the tagline was legible in a still frame and lost in motion.
- **A generated bed is shaped like music**, so it cannot simply be looped. This
  one builds for 14s, holds flat to 62s, then resolves to silence. Crossfading
  end onto start therefore joins the fade-out to the fade-in and drops 14 dB —
  audible, and no crossfade curve rescues it, because the source really is quiet
  at both ends. `stitch-promo.sh` scans the level in 4s windows, loops only the
  steady middle, and uses `acrossfade` with the equal-power `qsin` curve rather
  than the linear `tri` default. Two failures on the way: `-v error` suppresses
  `volumedetect`'s output, so the scan silently found every window equally loud
  and failed _open_; and fixing only the tail still crossfaded into the intro.
- **A fixed canvas is a guess about text metrics.** `assets/logo.png` had 9px of
  padding on the left and 167 on the right, so `align="center"` centred the
  canvas and left the logo visibly off to one side. Both the README logo and the
  end-card logo are now cropped to what was actually drawn and padded evenly, so
  they centre wherever they are placed and on whichever font a machine falls
  back to.
- **The spread must be computed the site's way.** `Catalog.rateSpread` uses
  primary, non-stale, priced models — _not_ `status === 'current'`. Filtering on
  status gives 191× against the 218× the site's own Compare headline shows, in a
  scene that puts a screenshot of that headline on screen. The video would have
  been arguing with the product.
- **`vite preview` needs `--host 127.0.0.1`** on Windows, and `BASE_PATH` on both
  the build and the serve. Both failures look like a hang, not an error. See
  [TESTING.md](TESTING.md), which hit the same two.

## Publishing

1. Attach the MP4 to the release: `gh release upload vX.Y.Z assets/promptspend-promo.mp4`.
   The README links `releases/latest/download/promptspend-promo.mp4`, so **every
   future release must carry the file or that link 404s.**
2. For the inline player in the README, the video has to be dragged into a GitHub
   issue or pull-request comment in the web UI to get a `user-attachments` URL,
   which then replaces the `<!-- PROMO-VIDEO -->` marker. There is no API for
   this; a release-asset URL downloads instead of playing.

   **Submit the comment.** Dragging the file uploads it and GitHub inserts the
   URL straight away, which makes it look finished — but an abandoned draft does
   not retain the attachment and the URL then 404s. Post the issue (closing it
   afterwards is fine) or add the video as a comment on the release.

   Check the URL before committing it, because a broken embed on the front page
   is worse than no embed. An unsigned request to a live attachment answers
   **403 or 302**; a dead one answers **404**:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' -I https://github.com/user-attachments/assets/<uuid>
   ```
