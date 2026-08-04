# The promo video

`promptspend-promo.mp4` — 2 minutes 8, 1920×1080, shipped as a **release asset**
rather than committed. At ~23 MB it would otherwise be by far the heaviest thing
in the repository, and every rebuild would add another copy to history forever.

```
[ title card 1.7s ] → [ AI hero shot 6.4s ] → [ real-UI core 118s ] → [ AI end card 3.6s ]
```

Nine scenes in the core: the snapshot problem, the size of the decision, the
estimate working, the saving, provenance and flags, the MCP server, **the editor
extension**, the daily pipeline, and the address.

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

### The freshness-date artifact, and how it resolved

For two days this section recorded a known blemish. The 2026-08-02 cut was
captured while the catalog carried a fabricated `provenance.lastChanged` on every
model, so three frames showed it: the header, the results pill and the pipeline
health panel. The data was corrected the next day and the site began reading
`not yet recorded` until a rate actually moves, but the film kept the old dates.

It was left alone deliberately — every price in it was still correct, only the
provenance dates had aged, and GitHub's `user-attachments` URLs are immutable so
re-embedding is manual. The note said re-capturing would be enough to fix it,
with no edit to the video pipeline.

That turned out to be exactly right. The 2026-08-04 re-cut ran `capture-ui.ts`
against the rebuilt site and the health panel came back reading **`not yet
recorded`** on its own. The lesson generalises: a promo built from captures
repairs itself the next time it is built, and the only thing that needs
deliberate maintenance is the hand-written caption layer around it.

## Rebuilding it

The order matters: the captions are checked against the catalog, and the catalog
moves every morning.

**Run steps 1 and 2 in PowerShell, not Git Bash.** `BASE_PATH=/` in Git Bash is
rewritten by MSYS path conversion into `/Program Files/Git/`, and the build then
bakes that into every asset URL. Nothing errors: the site builds, the preview
serves, and the capture sits waiting for a `<main>` that never mounts because the
JavaScript 404s. It looks exactly like a hang. This cost two ten-minute timeouts
on 2026-08-04 before the preview log gave it away.

```powershell
# 1. Build AND serve with base "/". Both halves need it - a build at "/" served
#    at "/promptspend/" 302s the capture into the same silent hang.
$env:BASE_PATH = '/'; $env:SITE_URL = 'http://127.0.0.1:4173'
npm run build
node node_modules/vite/bin/vite.js preview --port 4173 --strictPort --host 127.0.0.1

# 2. Capture the real interface (writes assets/promo-frames/). Confirm the root
#    answers 200, not 302, before starting this.
npx tsx tools/capture-ui.ts
```

Step 3 is the one screenshot Playwright cannot take: `04-editor.png` and
`04-status.png` are crops of VS Code with the published extension running. See
**The editor scene** below. They change far less often than the site does, so
this step is usually skipped.

```bash
# 4. Render the 118s core (also checks the figures, and writes the overlays)
python tools/make-promo.py

# 5. Stitch. The bed is COPIED first: stitch-promo.sh writes its loop to
#    assets/.bed-looped.mp3, so passing that same path as the input makes ffmpeg
#    read and write one file.
cp assets/.bed-looped.mp3 assets/bed-source.mp3
bash tools/stitch-promo.sh assets/hero.mp4 assets/core.mp4 assets/endcard.mp4 \
  assets/title-overlay.png assets/endcard-logo.png assets/bed-source.mp3 \
  assets/poster.png assets/promptspend-promo.mp4
rm assets/bed-source.mp3
```

`assets/hero.mp4` and `assets/endcard.mp4` are gitignored and will not be in a
fresh clone — regenerate them from the prompts and seeds recorded below.

**Re-uploading matters.** Changing the video changes the file, so the existing
`user-attachments` URL still serves the old cut — it is immutable. A rebuild
needs a fresh drag-and-drop and a new URL in the README, as well as
`gh release upload --clobber`.

`python tools/make-promo.py --check` runs step 4's verification alone. It fails
if a model in the captured estimate has been renamed or retired, or if the rates
have moved far enough that the saving shown on screen is no longer what the
engine would compute. **The screenshots stay current because they are captured;
the risk here is the reverse — the hand-written captions rotting around them.**

## The editor scene

One scene's screenshot does not come from `capture-ui.ts`, and cannot: Playwright
drives a browser and cannot photograph an editor. `04-editor.png` and
`04-status.png` are native-resolution crops of VS Code with the **published**
extension running against the **published** catalog.

Drawing an editor in PIL would have been quicker. It would also have broken this
project's first rule on the single frame that claims the product notices things,
which is the worst possible place to put a mockup — so the scene waited for a
real screenshot instead.

How to retake them:

1. Open a file naming a few models **inside a folder VS Code already trusts**.
   Restricted Mode disables the extension, and the symptom is simply that no
   annotations appear — it does not announce itself.
2. Capture the screen at native resolution rather than through any downscaling
   tool; the annotations are small grey text and do not survive a resample.
3. Crop the code region and the status item separately. Measure the status item's
   bounds off a zoom — the first attempt guessed and clipped the `P` off
   `Prices synced`.

The demo file is worth constructing rather than grabbing: the published frame
shows `claude-sonnet-5` with a `max_tokens` and a ceiling, `gpt-5-mini` with no
cap and therefore **no** ceiling, and a legacy `claude-opus-4-5` carrying a
diagnostic underline. The middle one is the point. A call with no cap of its own
sitting between two that have one is precisely the case that shipped broken in
0.1.5, where it borrowed the cap above it and priced it at its own rate. The
frame proves the fix without a caption having to claim it.

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
  the build and the serve. Both failures look like a hang, not an error, and
  the Git Bash variant above is a third way into the same symptom.

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
