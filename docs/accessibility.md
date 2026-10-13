# Accessibility

Two switches in the panel, each private to the participant who turns it on:

- **Read out screen changes**, for participants who are blind or have low vision.
- **Color Assist**, for participants with a color vision deficiency.

Answers land in the panel's thread, which is an ARIA live log. A screen reader
announces each one as it arrives without moving focus. The switches are
buttons with `aria-pressed`. Nothing is spoken by Zoom Lens itself, so the
participant's own screen reader, voice and speed apply.

## Screen changes

A participant who can't see the shared screen can hear the presenter, but not
the slide, the chart or what the pointer is on.

- **What changed?** describes only what is new since the participant's last
  answer.
- **Read out screen changes** adds a short description each time the screen
  changes in a way worth mentioning.
- Every answer mentions a visible pointer, laser pointer or annotation and what
  it is on, so "what is the presenter pointing at?" is covered by asking it, and
  by the change descriptions.

### How a change is noticed

`watch.js` runs one loop per meeting, only while someone there has the switch
on. Every 2 seconds (`ZOOM_LENS_WATCH_SECONDS`) it:

1. takes the current screen through the same path as a normal request,
2. shrinks it to a 64x36 greyscale fingerprint (`change.js`, about 8 ms),
3. compares that with the screen it last described. If more than 1% of cells
   moved, and the screen then holds still for one more look, it is a change.
   If it never holds still, it counts on the fifth look,
4. sends the still to the model with the previous description, at low effort.
   The model replies with what is new, or `No meaningful change.`, which is
   dropped.

At most one description goes out every 10 seconds per meeting.

## Color Assist

Status dots, chart series, heatmaps and map legends often carry their meaning
in color alone. With Color Assist on:

- **Every answer is color-safe.** Things are named by label, value or position,
  and where color means something the meaning is stated: "Authentication
  Rewrite is blocked (red)", not "the red one".
- **What do the colors mean?** goes through each meaningful color, what it
  stands for and which items have it.
- **A note appears when a new screen tells things apart by color alone**, for
  example "This chart tells its two lines apart only by color." Nothing appears
  for screens that merely contain several colors.

The setting is remembered on the device, since someone who needs it needs it
in every meeting.

### What is computed and what is asked

`colors.js` does the measurable part without a model, in about 12 ms per
screen:

1. shrinks the screen to 640x360 and converts it to CIELAB,
2. keeps strongly colored pixels and groups them by hue into distinct colors,
   with how much of the screen each covers and which of nine regions it is in,
3. simulates protanopia, deuteranopia and tritanopia on each color (Machado,
   Oliveira and Fernandes 2009, full severity),
4. flags a pair as confusable when CIEDE2000 puts it clearly apart for normal
   vision (15 or more) but close for a simulated deficiency (under 10).

The model does what pixels can't: decide whether a label, pattern or legend
already carries the same information, read what each color stands for, and
write the answer. It is given the pixel findings as text alongside the image.

| Step | Model |
|---|---|
| Noticing the screen changed | no |
| Finding colors and confusable pairs | no |
| Deciding whether a note is even possible | no |
| Whether color is the only cue | yes |
| What each color means | yes |
| Color-safe answers | yes |

On a change, the model is asked only if both colors of a confusable pair cover
more than a few small marks (80 pixels at 640x360). Window buttons and tab
icons are colored too, and this keeps them from raising notes.

### Not built: a recolored view

Recoloring the shared screen for the participant (daltonizing, or adding
patterns and outlines) is cheap given the pixels above, but a Zoom App can't
draw over another participant's share. It would have to be a second, recolored
copy of the screen inside the panel, which means sending screen images to the
panel. Today they never leave the backend, and the panel is too narrow for a
readable copy. Labels in words do the same job within the current design.

## Measurements

`node test-change.js` measures the share of fingerprint cells that change on
synthetic 1280x720 screens:

| Change | Cells changed | Counted |
|---|---|---|
| Same screen, recompressed | 0.00% | no |
| Pointer moved across the screen | 0.09% | no |
| One bullet added | 1.74% | yes |
| Scrolled by one line | 3.47% | yes |
| New slide | 22.40% | yes |

`node test-colors.js` checks CIEDE2000 against three of Sharma's published
test pairs (exact to four decimals), checks the simulation on pairs with known
outcomes (red and green merge for deuteranopia, blue and purple for
protanopia, blue and orange stay apart for all three), and checks that a
status column's colors are found and flagged while a black and white slide, a
blue and orange chart, window buttons, and a single red and green dot are not.

On the demo dashboard (`demo/color-dashboard.html`, rendered at 1280x720) the
analysis finds green, red and amber, each over 4% of the screen, and flags
green and red for deuteranopia.

`node eval-changes.js captures/<file>.h264` replays a recorded share at one
look every 2 seconds. On the two recordings made during development, a
developer's desktop switching between windows with no color-coded content:

| Recording | Looks | Changes described | Passed to the model by Color Assist |
|---|---|---|---|
| 5.6 minutes | 168 | 22 | 0 |
| 40 minutes | 1201 | 122 | 0 |

Before the size bar for window buttons was added, Color Assist would have
passed 37 of those changes to the model. The ones looked at were set off by
window buttons and tab icons.

These recordings have no labels, so they show how often each step fires, not
whether each firing was right. Next to measure, on recordings of real
presentations:

- **Change detection**: precision and recall against hand-marked changes
  (`--labels`).
- **Color notes**: precision and recall against screens marked as relying on
  color alone, such as status dots without words or chart lines without
  direct labels.
- **Color-safe answers**: for screens with a known mapping (the demo
  dashboard's five projects and statuses), how many items the answer maps
  correctly, and how many sentences refer to something by color alone.

## Latency

A change takes up to two looks (4 seconds) to notice and confirm, plus one
model call, plus up to 10 seconds if the screen was described just before.
Model time for change descriptions and color notes has not been measured
against the live API yet; the server logs both (`WATCH` and `COLOR` lines).
When both switches are on in a meeting, the two loops share one screen capture.

## Limitations

- Answers describe what is visible, and a chart is read from pixels, so small
  labels at 720p can be misread.
- The color simulation approximates full dichromacy. Most people with a color
  vision deficiency have a milder form, and nothing here is a medical
  assessment.
- Colors are grouped by hue, so a light and a dark shade of one hue are one
  color. A sequential heatmap reads as one color; the model still sees the
  image.
- A status shown by a single small dot of each color doesn't raise a note.
  Asking still works.
- A pointer is only mentioned if it shows in the shared video. Zoom's own
  annotation tools may not be in the stream.
- A playing video or a webcam inside the share never holds still, so the screen
  is described after five looks (10 seconds) of movement instead, and again
  every 10 seconds while it keeps moving. The model's `No meaningful change.`
  keeps that quiet for the listener, but each one is still a model call.
- A change smaller than 1% of the screen, such as one edited spreadsheet cell,
  isn't noticed. "What changed?" still catches it when asked.
- Change descriptions and color notes count towards the participant's daily
  limit (60 by default).
- Neither feature has been tried with the people it is for yet. That is the
  evaluation that matters most.
