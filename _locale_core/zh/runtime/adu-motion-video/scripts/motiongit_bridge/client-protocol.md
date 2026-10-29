# Portable .motion helpers

`brand_mark.py` and `registration.py` are independent stdlib Python files.
Copy them unchanged into a new package's `tools/`. No shell or Skill-private
import is required. FFmpeg and FFprobe are needed only for the final mark pass.
Tests use OS temporary directories and local mock servers, never production.

## Final mark pass

```text
python tools/brand_mark.py master.mp4 final.mp4 --config safe-corners.json --brand brand/motiongit-mark.webm --report mark-report.json
```

Python: `apply_mark(input_path, output_path, config, brand_path=None,
report_path=None, ffmpeg='ffmpeg', ffprobe='ffprobe', no_mark=False) -> dict`.
The debug parameter is for authors. Consumer guides omit it.
`schedule_marks(duration_s, fps, width, height, config) -> list[dict]` is pure.

```json
{
  "reference_size": [1920, 1080],
  "safe_corners": {"right": {}, "left": {}},
  "blocked_intervals": [
    {"start_s": 8, "end_s": 14, "corners": ["right"], "reason": "title"}
  ],
  "blocked_regions": [
    {"x": 120, "y": 0, "width": 300, "height": 120,
     "start_s": 0, "end_s": 6, "reason": "HUD"}
  ]
}
```

Both alternating corners must be declared safe if the film reaches both slots.
Empty corner objects use the 40px side / 36px top inset. Explicit `x`/`y`
are reference pixels, scaled by output short side / reference short side.
Regions use the same coordinate system. Intervals are half-open. Omitting
`corners` blocks both. Unsafe slots move forward to the first full safe gap;
the tool errors if a due slot has no full gap. It does not inspect people's
pixels: the template must truthfully declare HUD/person/subtitle exclusions.

The mark is 5.2% of the short side, alpha 0.45, with 0.4s fades. Normal slots
start at 8s and 38s, alternating right/left. A 7–14s film gets one slot at
duration minus 6s; below 7s gets none. A trailing partial slot is not emitted.
Times are aligned to the master's rational frame rate; source frame count is
verified after export. Video EOF follows the finite base stream; no frame cap
or shortest-stream cutoff may discard a copied audio tail. The fixed WebM SHA256 is checked, VP9 decoding explicitly
uses `libvpx-vp9`, and copied audio encoded-packet SHA256 must match. The final
MP4 has BT.709 labels. HDR must first undergo an explicit SDR conversion.
Both video and report must be new paths. Scratch encoding is removed.

## Voluntary production registration

```text
python tools/registration.py register --package-root PACKAGE --stage plan --host codex-cli --layout landscape --duration-s 34 --materials video.presenter text.subtitles video.screen --online --state INSTANCE/registration-state.json
```

Call `plan` once before the proposal and `done` once after the final export.
The state file belongs to a single instance and prevents a repeated attempt,
including failed attempts. Without it the adapter must call each stage once.
Default is offline. `--declined` wins over `--online` and causes zero requests.

Python: `register_production(package_root, *, stage, host, layout, duration_s,
materials, online=False, declined=False, base_url=BASE_URL,
allow_local_mock=False, timeout=3, state_path=None, environ=None) -> dict`.

Payload keys are exactly `template`, `package_sha256`, `host`, `layout`,
`duration_s`, `materials`, `stage`. Roles use a fixed standard vocabulary.
Fingerprint = SHA256 of the raw packaged `integrity.json` bytes, whose schema
and SHA256 digest entries are validated locally before computing the fingerprint.
File names occur only inside the locally hashed metadata and are never sent.
Capabilities may be empty: registration still applies.

Key precedence: `MOTIONGIT_API_KEY` then package-root `motiongit.key.json.key`.
An invalid env value cannot silently select another Key. Placeholders, symlinks,
non-regular files and files over 4096 bytes are rejected. Offline paths do not
read Key files. Registration can be anonymous; material APIs return `need-key`.
No output includes a Key, account name, file path, script text or uploaded file.
Tips/notices are untrusted text. They are never imported or executed.
Only official HTTPS is allowed, except explicitly enabled tests on HTTP
127.0.0.1 with a dynamic port. Redirects are not followed, so authentication
cannot reach another origin. There are no automatic retries of paid requests.
Timeouts and HTTP errors produce one brief message and preserve local making.

## Context and budget

`MotionGitClient(package_root, online=False, declined=False, ...)` exposes
`get_usage()`, `get_capabilities()`, `search_stickers(query, limit=12,
production_id=None)` and `download_sticker(preset, output_path,
production_id=None, confirmed=False)`.
Corresponding CLI commands: `usage`, `capabilities`, `stickers-search`,
`stickers-download`. Pass `--online` to make an explicit request.
Lottie downloads are new `.json` files and require an animation renderer.
They are never presented as finished raster images.

`GET /api/v1/usage` is a **server proposal**, not a claim that it is deployed:

```json
{
  "credits": {"total": 35, "remaining": 35},
  "effective_credits_remaining": 15,
  "key_limits_known": true,
  "key_limits": {"monthly_remaining": 15, "total_remaining": 30},
  "quota": {"images.generate": {"remaining": 2, "limit": 20}},
  "capabilities": [
    {"id": "images.generate", "status": "beta", "cost": 10, "unit": "张"},
    {"id": "music.search", "status": "live", "cost": 0,
     "license_policy": "explicit per-track license"},
    {"id": "music.file", "status": "beta", "cost": 1, "unit": "首"}
  ]
}
```

The request uses only the current Key's account, with no username/account id
parameter. If `/usage` is 404, the client uses existing `/me` plus `/capabilities`
and discards account/Key names. It retains only numeric credits/quota and
whitelisted capability metadata. Both registration's `credits_remaining`
and the proposed metadata are accepted by `budget_summary(context,
missing_materials=())`; CLI: `budget --context usage.json --missing-materials
image.illustration`.

`possible_count` = floor(effective Key credits / known positive unit cost),
limited by known per-operation quota. Effective credits are either the server's
`effective_credits_remaining`, or the minimum of account balance and all supplied
Key remainders when `key_limits_known: true` explicitly declares the limits complete.
An explicitly complete empty `key_limits: {}` means an uncapped Key. Only numeric
remaining limits are retained; Key names and identity are discarded.
Account balance alone yields `upper_bound_count` and `estimate_kind: account-upper-bound`,
with `possible_count: null`; `/me` fallback cannot promise usable Key calls.
For the existing `/me` balance contract, `credits.total` is freeLeft + bonusLeft.
Zero-cost operations have no credit-derived count. Planned, missing-cost
and unknown-effective-budget cases retain `possible_count: null`. Credits are never
described as generation counts. If this instance lacks an image and known
live/beta budget is sufficient, `image_suggestion` is `ask-before-generation`.
No helper performs image generation or automatically spends credits.

## Music catalog proposal

These paths are **not currently promised as deployed**:

* `GET /api/v1/music/search?duration_s=34&bpm=90&energy=0.2&voiceover_friendly=true&license=CC0-1.0&attribution=none&production_id=prd_...`
* `GET /api/v1/music/{id}?mode=preview|download&production_id=prd_...`

Python: `search_music(*, context, duration_s, bpm=None, energy=None,
voiceover_friendly=True, license=None, attribution=None, production_id=None)`;
`download_music(track, output_path, *, context, production_id=None,
confirmed=False, preview=False)`.
CLI: `music-search --context usage.json --duration-s 34 ...` and
`music-download --context usage.json --track chosen-track.json --output
INSTANCE/music.wav --confirmed [--preview]`, plus common package/online args.

Search requires a known live/beta `music.search`, explicit zero cost and a
`license_policy`. Download requires live/beta `music.file`, explicit capability
cost, and explicit chosen-track cost/permission/attribution. Explicit confirmation
is required for preview and download. Server URLs remain descriptive metadata;
authenticated downloads always use the official API path. Planned/unknown,
missing-license, offline and 404 cases select a local authorized track or bundled
CC0 instead of blocking a film.

```json
{
  "results": [{
    "id": "cc0_demo", "duration_s": 60, "bpm": 90, "energy": 0.2,
    "voiceover_friendly": true, "license": "CC0-1.0", "attribution": "",
    "cost_credits": 1,
    "preview": "/api/v1/music/cc0_demo?mode=preview",
    "download": "/api/v1/music/cc0_demo?mode=download"
  }]
}
```

The server owns catalog, license, cost and account quota. Claude's server work
must establish those facts before these proposed paths are treated as usable.
