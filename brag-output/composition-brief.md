# Hyperframes Composition Brief: Madhuca

## Objective
Create a short launch-style brag video for Madhuca, built from the uncoalesced Mosaic System design language (`E:\uncoalescedDZN\MOSAIC_SYSTEM.md`) and the project's `assets/` folder.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape - 1920x1080
- Duration: 24.4 seconds

## Source Material
- Project root: `E:\Madhuca`
- Primary files read: `README.md`, `assets/palette/palette_rules.txt`, `assets/logo/*`, `assets/banner/*`, `frontend/src/index.css`, `frontend/src/components/HotspotDetailPanel.ts`, `frontend/src/components/RegionSelector.ts`, `frontend/src/demoHotspots.ts`, `frontend/src/App.ts`, `frontend/public/boundaries/*`, `E:\uncoalescedDZN\MOSAIC_SYSTEM.md`
- Product name: Madhuca (wordmark lowercase "madhuca")
- Tagline / strongest claim: "Open the page, see where the fires are, and which way their smoke is heading."
- Key UI moment to recreate: region selector + detections on the India map + hotspot detail panel (compass badge, nearest town, intensity, Hindi alert)
- Copy that must appear verbatim:
  - "AUTONOMOUS STUBBLE & BIOMASS FIRE EARLY-WARNING RADAR"
  - "Likely Crop Stubble Burning"
  - "DEMO DATA, not real fires."
  - "This is not an all-clear."
  - "madhuca.uncoalesced.com"

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium product film in the Mosaic System's flat, analytical language
- Interpretation: few scenes, confident holds, hard cuts on beats, no gradients/glow/glass
- Angle: see `brag-plan.md`
- Hook: dot field with a few detections flaring; "Visible from space within hours. Never reaches the person downwind."
- Outro / punchline: "A failed scan is an error. Never an all-clear." then the lockup
- Avoid: generic SaaS language, abstract filler, any colour outside the six Mosaic tokens plus Palm Leaf shade/base/tint (orange/red only as fire data), hand-drawn marks (use the real logo geometry), claiming HYSPLIT, presenting demo points as real fires

## Visual Identity
- Background: Graphite #333333
- Text: Porcelain #FDFFFC
- Accent: Palm Leaf #748E54 (shade #5D6E48, tint #A4B68F)
- Display font: JetBrains Mono; body IBM Plex Sans (both bundled locally in `assets/fonts`)
- Visual references: mosaic mark, banner lockup, app header/tabs/status strip

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook - 4.39s - dot field, two lines of copy
2. Reveal - 4.35s - mark assembles, tagline lines
3. The radar - 4.37s - region click, scan, detections
4. The fire - 5.45s - select, plume, detail panel, Hindi alert
5. The rule - 3.28s - failed scan is not an all-clear
6. Lockup - 2.56s - mark, wordmark, URL

## Audio
- Audio role: warm bed with sparse professional accents
- Audio arc: steady bed, accents at cuts and interactions, fade out on the URL
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: volume 0.30, fade out over last 1.6s
- Music cue guidance: bundled preset `assets/music/cues/...vol-12...music-cues.json` (strong cues 8.74, 13.11, 18.56, 22.93)
- Audio-reactive treatment: subtle; ffmpeg-extracted RMS (30fps) modulates mark scale and hook dot-field opacity
- SFX: impactSoft_medium_001, bong_001, click_002/003, drop_001/002, card-slide-1 (all low or medium HF risk)

## Hyperframes Instructions
Built with hyperframes-core, hyperframes-animation, hyperframes-creative, hyperframes-keyframes and hyperframes-cli. Gate: `npx hyperframes check`.

## Credits and re-rendering
- Music: "Happy Beats / Business Moves" vol-12 by ende.app (https://ende.app/en). The brag skill does not document the licence terms, so the source MP3 is not committed here. To re-render, copy `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` from the brag skill's `assets/music/` into `brag-output/composition/assets/music/`.
- SFX: Kenney.nl, CC0.
- Fonts: JetBrains Mono, IBM Plex Sans, Noto Sans Devanagari and Noto Sans Telugu (SIL OFL), bundled in `composition/assets/fonts`.
- Map: India boundaries from `frontend/public/boundaries`. The 9 fire points are the app's demo points plus a few more placed on Punjab and Uttarakhand, labelled DEMO DATA in the video.
- Render: `cd brag-output/composition && npx hyperframes check && npx hyperframes render --quality looks --output ../brag.mp4`
