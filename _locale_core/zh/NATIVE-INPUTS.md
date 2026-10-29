# Current native and narration inputs / 当前原生与口播输入

This document describes actual routes; it does not implement new runtime features.
For a new audio-only narration, use the declared `workflow: motion-kit` and read
`kit.params.schema.json`: bind the complete original audio as `timeline.voiceover`,
retain actual complete captions/word evidence, and omit `timeline.presenter`.
Choose real visual expressions and supplied images/video in existing controls.
Never invent a native hide-person switch, create a blank presenter video, discard
speech to fit a group, or infer word clocks from cuts. Keep approved projects on
their existing route. The assistant chooses the supported route from the user's
materials; users need not choose technical workflows or repeat their uploads.

Native scene requirements still apply. In console templates 611/612,
`mode: components` is the earlier presenter-import route and is distinct from
`workflow: motion-kit`; it is not a promise of pure-audio support.

中文：只有口播音频时，助手使用本包已实现的 motion-kit 路线绑定原声和真实字幕，
省略人物槽，按句意选画面并使用用户素材。不要把纯音频放进原生人物视频槽，
也不声称原生已实现隐藏人物。已审核工程继续原路线；用户不用填写技术表格。

## Public scene contracts / 公开场景合同

- `capacity-matrix.json`
- `adapter/parameter-map.json`
- `native.params.schema.json`

Read these via the verified bundled helper. Slot capacities and required fields describe current inputs; historical sourceText/sourceSpans are provenance, not instructions to copy the author topic or alter protected source. A valid enum/plan is not semantic acceptance.

## Explicit example / 明确的示例入口

`presets/component-layout.json` is a self-contained eight-second **no-narration component layout** example. It is not native reproduction or proof of a voiced film. Keep historical `presets/demo.json` unchanged; its missing inputs are listed in `guide.json.inputRoutingContract.example`. Never insert unrelated narration or paid generated media to claim it works. Normal user production uses the actual user inputs.

## Existing renderer geometry and word records / 已实现的布局与词记录

`segments[].area` uses output-pixel x/y/w/h for the specific control window. This is a layout binding, not permission to crop important content or shrink the entire composition. Keep original raw ASR/alignment records, complete source text and clocks.

The generic motion-kit renderer displays complete sentence captions. Word highlighting is not implemented here: do not submit units or semanticBreakAfter as a promise of it. Preserve the unmodified original word records separately and bind the same complete s/e/text sentence cues. Do not send internal presenter.mode to this public wrapper.
