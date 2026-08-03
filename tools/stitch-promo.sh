#!/usr/bin/env bash
# Stitch the PromptSpend promo from its sources:
#
#   [ AI hero shot + lower-third title ] -> [ real-UI core ] -> [ AI end card + logo ]
#
# The bookends are generative-video clips (abstract light and haze - what those
# models do well, and where they cannot garble a price). The core is
# tools/make-promo.py output: real screenshots of the built site, captured by
# tools/capture-ui.ts, carrying real numbers from the committed catalog.
#
# Audio is staged in two parts:
#   * The opening plays the hero clip's OWN native audio, alone - no music over it.
#   * The music bed starts as the opening crossfades into the story and carries
#     the rest of the piece.
# The bed runs through loudnorm and dynaudnorm because generated music tends to
# ramp or dip mid-track; normalising guarantees a steady level rather than a bed
# that appears to "kick in" halfway through.
#
# Usage:
#   tools/stitch-promo.sh HERO.mp4 CORE.mp4 ENDCARD.mp4 OVERLAY.png LOGO.png BED.mp3 POSTER.png OUT.mp4
set -euo pipefail

HERO="${1:?hero clip}"
CORE="${2:?core clip}"
END="${3:?end card clip}"
OVERLAY="${4:?lower-third png}"
LOGO="${5:?logo png for the end card}"
BED="${6:?music bed}"
POSTER="${7:?title card png - becomes frame 0, and so the README thumbnail}"
OUT="${8:?output path}"

# The still title card at the head of the edit.
#
# This is not decoration. GitHub's inline player has no poster attribute a
# README can set - the player is generated from a bare attachment URL and
# author-written <video> is stripped by the markdown sanitiser - so the browser
# shows frame 0. The hero clip opens near-black while the light builds, which
# rendered as an empty rectangle on the repository front page.
CARD_LEN=1.7      # seconds the title card holds before the hero
XF0=0.5           # title card -> hero crossfade

HERO_LEN=6.4      # seconds of the hero shot to keep
END_LEN=3.6       # seconds of the end card to keep
XF1=0.8           # hero -> core crossfade
XF2=0.6           # core -> end card crossfade
TITLE_IN=1.1      # lower-third fade in
TITLE_OUT=4.5     # lower-third fade out (clears before the crossfade)
LOGO_IN=0.5       # end-card logo fade in
HERO_VOL=1.00     # native hero audio owns the opening on its own
BED_VOL=0.90      # trim after loudnorm has already set the bed's loudness

# The end card arrives letterboxed to roughly 2.34:1 - Veo returns a cinematic
# crop for a still, slow prompt. Measured with cropdetect rather than guessed:
# the picture occupies y=130..950, so 820 rows of 1080. Cropping only the bars
# would leave a 2.34:1 frame that has to be squashed into 16:9, so the width is
# cropped to match instead (820 * 16/9 = 1458, centred) and the result scaled
# up. The content is an abstract glow, so a centre crop costs nothing.
END_CROP="crop=1458:820:231:130"

# awk for arithmetic - bc is not present in Git Bash or minimal images
calc() { awk "BEGIN{printf \"%.3f\", $1}"; }

CORE_LEN=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CORE")
# Everything downstream of the card shifts by the time it occupies. Computed
# from one offset rather than by adding CARD_LEN in several places, because a
# missed one desynchronises the audio from the picture and that is not obvious
# until you watch the whole thing.
SHIFT=$(calc "$CARD_LEN - $XF0")
OFF0=$(calc "$CARD_LEN - $XF0")
OFF1=$(calc "$SHIFT + $HERO_LEN - $XF1")
MID_LEN=$(calc "$SHIFT + $HERO_LEN + $CORE_LEN - $XF1")
OFF2=$(calc "$MID_LEN - $XF2")
TOTAL=$(calc "$MID_LEN + $END_LEN - $XF2")
MUSIC_START="$OFF1"   # bed enters exactly as the opening starts crossfading out
BED_LEN=$(calc "$TOTAL - $MUSIC_START")

echo "card=${CARD_LEN}s  core=${CORE_LEN}s  xfades@${OFF0}s ${OFF1}s ${OFF2}s  music@${MUSIC_START}s  total=${TOTAL}s"

# A bed shorter than the stretch it has to cover does not error on its own:
# atrim just yields what exists and the piece ends in silence. That is exactly
# the kind of defect nobody notices until it ships, so it is handled here rather
# than left to chance.
#
# Extending the scene holds so the text can actually be read pushed the run time
# past the generated bed, which is the normal way this happens - the edit grows
# after the music is bought. Rather than re-buy, the bed is crossfaded onto
# itself. On a sustained ambient pad with no strong downbeat a 4s crossfade is
# inaudible; on a track with a clear rhythmic pulse it would not be, so listen
# to the join before trusting it.
#
# The curve is qsin (quarter sine), NOT the tri default. The two halves of a
# loop join are uncorrelated audio, and a linear-amplitude fade sums them to
# less than either - measured as a 4.5 dB dip in the middle of the join, which
# is plainly audible as the music ducking. qsin is the equal-power curve and
# holds the level flat across the same four seconds.
XFADE_LOOP=4
WINDOW=4       # level-scan resolution, seconds
BODY_FLOOR=6   # a window is "steady" if within this many dB of the loudest

# Measure mean level in WINDOW-second slices, and report the steady middle.
#
# This matters more than it looks. A generated track is shaped like a piece of
# music: it builds at the start and settles at the end. Measured on this bed,
# 0-14s runs 10 dB down while it builds, 16-62s is flat, and the last twelve
# seconds fall away to nothing. Looping the whole file therefore crossfades the
# fade-out onto the fade-in and drops 14 dB in the join - clearly audible, and
# no crossfade curve can fix it, because the source really is quiet at both
# ends. Only the steady middle is safe to repeat.
#
# Scanned rather than hard-coded so a different bed does not silently reintroduce
# the dip: the numbers above are true of this track, not of music in general.
steady_region() {
  local file="$1" dur="$2" t max="" best
  local -a starts levels
  t=0
  while awk "BEGIN{exit !($t < $dur - 1)}"; do
    # NOT -v error: volumedetect prints its summary at info level, so quieting
    # ffmpeg silently yields nothing and every window looks equally loud. That
    # failed *open* - the scan reported the whole track as steady and put the
    # join straight back into the fade. An unreadable window is now fatal.
    best=$(ffmpeg -hide_banner -nostats -ss "$t" -t "$WINDOW" -i "$file" \
             -af volumedetect -f null - 2>&1 |
           sed -n 's/.*mean_volume: *\(-*[0-9.]*\) dB.*/\1/p' | tail -1)
    if [ -z "$best" ]; then
      echo "ERROR: could not measure the bed's level at ${t}s" >&2
      exit 1
    fi
    starts+=("$t"); levels+=("$best")
    if [ -z "$max" ] || awk "BEGIN{exit !($best > $max)}"; then max="$best"; fi
    t=$(calc "$t + $WINDOW")
  done
  local threshold first="" last="" i
  threshold=$(calc "$max - $BODY_FLOOR")
  for i in "${!starts[@]}"; do
    if awk "BEGIN{exit !(${levels[$i]} >= $threshold)}"; then
      [ -z "$first" ] && first="${starts[$i]}"
      last="${starts[$i]}"
    fi
  done
  [ -z "$first" ] && { echo "0 $dur"; return; }
  echo "$first $(calc "$last + $WINDOW")"
}

BED_HAVE=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BED")
if awk "BEGIN{exit !($BED_HAVE < $BED_LEN)}"; then
  read -r BODY_IN BODY_OUT <<<"$(steady_region "$BED" "$BED_HAVE")"
  awk "BEGIN{exit !($BODY_OUT > $BED_HAVE)}" && BODY_OUT="$BED_HAVE"
  BODY=$(calc "$BODY_OUT - $BODY_IN")
  if awk "BEGIN{exit !($BODY <= $XFADE_LOOP * 2)}"; then
    echo "ERROR: bed has no steady stretch longer than ${XFADE_LOOP}s to loop" >&2
    exit 1
  fi

  # The FIRST segment keeps the natural intro - the bed is entering under a
  # crossfade there anyway, and the build is exactly what that wants. Only the
  # repeats start at the steady point.
  LOOPED="$(dirname "$OUT")/.bed-looped.mp3"
  COPIES=1
  HAVE="$BODY_OUT"
  while awk "BEGIN{exit !($HAVE < $BED_LEN)}"; do
    COPIES=$((COPIES + 1))
    HAVE=$(calc "$BODY_OUT + ($BODY - $XFADE_LOOP) * ($COPIES - 1)")
  done
  echo "bed is ${BED_HAVE}s, need ${BED_LEN}s - steady body ${BODY_IN}s..${BODY_OUT}s, looping ${COPIES}x"

  INPUTS=""; FILTER=""; PREV="t0"
  for i in $(seq 0 $((COPIES - 1))); do
    INPUTS="$INPUTS -i $BED"
    if [ "$i" = 0 ]; then
      FILTER="${FILTER}[0:a]atrim=0:${BODY_OUT},asetpts=N/SR/TB[t0];"
    else
      FILTER="${FILTER}[${i}:a]atrim=${BODY_IN}:${BODY_OUT},asetpts=N/SR/TB[t${i}];"
    fi
  done
  for i in $(seq 1 $((COPIES - 1))); do
    FILTER="${FILTER}[${PREV}][t${i}]acrossfade=d=${XFADE_LOOP}:c1=qsin:c2=qsin[x${i}];"
    PREV="x${i}"
  done
  # shellcheck disable=SC2086
  ffmpeg -y -v error $INPUTS -filter_complex "${FILTER%;}" -map "[${PREV}]" \
         -c:a libmp3lame -b:a 192k "$LOOPED"
  BED="$LOOPED"
  BED_HAVE=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$BED")
fi
echo "bed=${BED_HAVE}s covers ${BED_LEN}s needed"

ffmpeg -y -i "$HERO" -i "$CORE" -i "$END" \
       -loop 1 -i "$OVERLAY" -loop 1 -i "$LOGO" -i "$BED" \
       -loop 1 -i "$POSTER" -filter_complex "
[6:v]trim=0:${CARD_LEN},setpts=PTS-STARTPTS,scale=1920:1080,fps=24,format=yuv420p[vc];
[0:v]trim=0:${HERO_LEN},setpts=PTS-STARTPTS,scale=1920:1080,fps=24,format=yuva420p[hv];
[3:v]trim=0:${HERO_LEN},setpts=PTS-STARTPTS,scale=1920:1080,fps=24,format=yuva420p,
     fade=t=in:st=${TITLE_IN}:d=0.8:alpha=1,fade=t=out:st=${TITLE_OUT}:d=0.8:alpha=1[ov];
[hv][ov]overlay=0:0:format=auto,format=yuv420p[v0];
[1:v]scale=1920:1080,fps=24,format=yuv420p[v1];
[2:v]trim=0:${END_LEN},setpts=PTS-STARTPTS,
     ${END_CROP},scale=1920:1080,fps=24,format=yuva420p[ev];
[4:v]trim=0:${END_LEN},setpts=PTS-STARTPTS,scale=1040:-1,fps=24,format=yuva420p,
     fade=t=in:st=${LOGO_IN}:d=0.9:alpha=1[lg];
[ev][lg]overlay=(W-w)/2:(H-h)/2:format=auto,format=yuv420p[v2];
[vc][v0]xfade=transition=fade:duration=${XF0}:offset=${OFF0}[x0];
[x0][v1]xfade=transition=fade:duration=${XF1}:offset=${OFF1}[x1];
[x1][v2]xfade=transition=fade:duration=${XF2}:offset=${OFF2}[vout];
[0:a]atrim=0:${HERO_LEN},asetpts=N/SR/TB,volume=${HERO_VOL},
     afade=t=out:st=$(calc "$HERO_LEN - 0.9"):d=0.9,aresample=48000,
     adelay=$(calc "$SHIFT * 1000")|$(calc "$SHIFT * 1000"),apad[ha];
[5:a]atrim=0:${BED_LEN},asetpts=N/SR/TB,
     acompressor=threshold=0.15:ratio=4:attack=20:release=250:makeup=2,
     loudnorm=I=-15:TP=-1.2:LRA=6,dynaudnorm=f=200:g=13:p=0.9:m=8,
     alimiter=limit=0.95,volume=${BED_VOL},
     afade=t=in:st=0:d=1.2,afade=t=out:st=$(calc "$BED_LEN - 2.8"):d=2.8,
     aresample=48000,adelay=$(calc "$MUSIC_START * 1000")|$(calc "$MUSIC_START * 1000")[ma];
[ha][ma]amix=inputs=2:duration=longest:normalize=0,atrim=0:${TOTAL}[aout]
" -map "[vout]" -map "[aout]" \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo "wrote $OUT"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
