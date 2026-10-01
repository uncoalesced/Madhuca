# Brag Plan: Madhuca

## What is this app?
A free, open-source fire and smoke radar for India. You open the page, it fetches NASA fire detections and wind, and shows where the fires are and which way their smoke is heading.

## The angle
The Mosaic System as a launch film. Madhuca is a single-accent product inside the uncoalesced Mosaic System, so the whole video is built from that system: Graphite ground, Porcelain app surfaces, Palm Leaf (#748E54) as the one product accent, and orange or red only where they mean data (stubble burning, wildfire). The mosaic dot field is the visual device: a field of scattered detections that coalesces into the mark, and the app's own UI is shown working, not described.

## Hook (first 2-3 seconds)
A thinning field of green mosaic dots around an empty centre; a few flare orange and red like satellite detections. Copy: "Visible from space within hours. Never reaches the person downwind." (from the README's origin story).

## Key moments (the middle)
- The dots collapse and reform as the real Madhuca mark and wordmark; three lines from the README tagline land one by one.
- The real UI recreated: Graphite header, the five-region selector, a click on North India, a Palm Leaf progress rule, and nine detections popping onto a real India boundary (from `frontend/public/boundaries`), tagged stubble (Sandy Brown) or wildfire (Watermelon).
- Tap one fire: dotted smoke plume, compass badge turning to East, "About 15 km West of Ludhiana", intensity, scientific reason, and the alert in Hindi with the speaker button.

## Outro / punchline
"A failed scan is an error. Never an all-clear." (the project's most important rule), shown with the app's own neutral error strip. Then the lockup: madhuca, madhuca.uncoalesced.com, free, open source, MIT.

## User flow worth showing
Entry: pick a zone (North India) -> key action: radar scans, fires appear tagged -> result: tap a fire for smoke direction, town, intensity and a spoken alert in Hindi.

## Tone
- Preset: polished
- Creative direction: quiet premium product film in the Mosaic System's flat, analytical language
- Interpretation: few scenes, confident holds, no gradients, no glow, no glass; motion is precise and flat, hard cuts land on beats.

## Format: landscape - 1920x1080
## Duration: 24.4 seconds

## Visual identity (from the project)
- Background: Graphite #333333 (ground), Porcelain #FDFFFC (app surfaces), Mist #F1F3F0, Line #DFE0DE
- Accent: Palm Leaf #748E54 (shade #5D6E48, tint #A4B68F); data only: Sandy Brown #F19143 (stubble), Watermelon #EF2D56 (wildfire)
- Text: Porcelain on Graphite, Graphite on Porcelain, Muted Ink #767976 / #9A9B99
- Display font: JetBrains Mono (600 / 700, -0.01em)
- Body font: IBM Plex Sans; Devanagari and Telugu via Noto Sans for the localized UI strings
- Strongest visual element: the 9x9 mosaic mark (real SVG geometry from `assets/logo`) and the live radar UI

## Share copy (draft)
Madhuca: a free, open-source fire and smoke radar for India. Open the page, see where the fires are and which way their smoke is heading.

## Audio direction
None. Silent by design: no music, no SFX, no voiceover.

## Storyboard

### Scene 1 - Hook - 4.39s
Dot field assembles around an empty centre (centre stays empty per Mosaic). Detection dots flare orange/red on the beat. Line 1 "Visible from space within hours." holds 0.4-2.3s; line 2 "Never reaches the person downwind." holds 2.55-4.0s.
Sequential/interaction: yes - dots assemble outward from the gap; flare dots change colour one by one on beats.
Transition mood: hard (dots collapse) -> Scene 2

### Scene 2 - Reveal - 4.35s
The real mark assembles dot by dot, wordmark settles. Eyebrow "AUTONOMOUS STUBBLE & BIOMASS FIRE EARLY-WARNING RADAR". Three lines land one by one: "Open the page." / "See where the fires are." / "Which way the smoke is going." (holds: 1.8s for the longest).
Sequential/interaction: yes - three lines arrive about 1s apart and stay.
Transition mood: hard cut on strong cue 8.74s -> Scene 3

### Scene 3 - The radar - 4.37s
App window slides up. Cursor clicks "North India"; status strip "Scanning North India for active fires..." with a green progress rule; camera pushes from all of India into North; nine detections pop in on a stagger; strip resolves to "9 fires - 7 stubble - 2 wildfire - DEMO DATA, not real fires."
Sequential/interaction: yes - simulated click, then markers pop one by one.
Transition mood: continuous (same window) -> Scene 4

### Scene 4 - The fire - 5.45s
Cursor selects a Punjab fire; camera pushes in; dotted plume extends east; detail panel slides in: tag, compass to East, nearest town, intensity, scientific reason, Hindi alert; speaker button pressed at the strong cue 17.47s.
Sequential/interaction: yes - panel rows land about 0.45s apart and stay; speaker press.
Transition mood: hard cut on 18.56s -> Scene 5

### Scene 5 - The rule - 3.28s
Full Graphite. "A failed scan is an error. Never an all-clear." with the app's neutral error strip beneath it. Hold 2.5s+.
Sequential/interaction: none
Transition mood: hard -> Scene 6

### Scene 6 - Lockup - 2.56s
Mark and live wordmark "madhuca" over the URL madhuca.uncoalesced.com, "Free - Open source - MIT".
Sequential/interaction: yes - mark dots, wordmark, URL, tags in sequence.

**Audio summary:** none, the video is silent.
