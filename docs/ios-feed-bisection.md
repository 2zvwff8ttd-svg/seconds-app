# fetchHomeFeed dependency tree (iOS bisection)

## feed.ts direct imports

```
feed.ts
├── @/lib/country/detect          (navigator.locale, fetch ipapi.co — runtime only)
├── @/lib/supabase/video-schema   (probeVideoSchema, buildVideoSelect — module: cachedCapabilities let)
├── @/lib/supabase/client         (createClient — shared with layout)
├── @/lib/videos/map-feed         ⚠️ pulls display-mask
└── @/types/feed                  (types only)
```

## map-feed.ts → display-mask.ts (indirect, critical)

```
map-feed.ts
└── @/lib/video/display-mask
    ├── TOP-LEVEL: MASK_DEFINITIONS built at import
    │   ├── recordCircleScrimMask() called for circle
    │   ├── recordScrimEvenoddMask() + encodeURIComponent(SVG) for star/square
    │   └── STAR_CLIP_PATH = "path(evenodd, '...')"
    └── parseVideoDisplayMaskShape()
```

**Feed fetch does not need display-mask at runtime for network** — only map-feed uses it for `display_mask_shape` parsing.

## fetchUserRecommendationContext (lighter)

```
context.ts
├── @/lib/supabase/client
├── @/lib/recommendation/constants  (plain object)
└── types only
```

No display-mask, no map-feed.

## Bisection stages

| Stage | What loads |
|-------|------------|
| 4a-1  | feed.ts import (map-feed + display-mask + video-schema + detect) |
| 4a-1b | display-mask.ts only |
| 4a-1c | map-feed.ts only |
| 4a-1d | video-schema.ts only |
| 4a-2  | fetchHomeFeed() runtime |
| 4a-3  | fetchUserRecommendationContext() only |
| 4a-4  | detectCountryCode() only |

## Resolution (display-mask fix)

**Root cause:** `MASK_DEFINITIONS` was built at import time and called
`recordCircleScrimMask()` which referenced `RECORD_VIEWPORT_HOLE_CENTER_*`
declared *later* in the file (TDZ `ReferenceError` on strict module eval).
Safari WebView treated this as a fatal chunk load failure ("This page couldn't load").

**Also hardened for iOS Safari 26 runtime:**
- Star clip: `polygon()` instead of `clip-path: path(evenodd, …)`
- Square clip: `inset(4%)` + `border-radius` instead of `inset(4% round 14%)`
- Record scrim: lazy SVG with white rect + black polygon hole (no SVG evenodd)
- Circle scrim: unchanged `radial-gradient` mask

**Fix:** Lazy `getMaskDefinitions()` — zero function calls at import.
