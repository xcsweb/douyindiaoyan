<!-- motiongit.public-narration-contract/1 -->
Read NATIVE-INPUTS.md for current route-specific presenter/crop/texture requirements and the actual example entry. Pure narration without a person uses the declared motion-kit route; do not assume native hiding. 先读该公开说明，按已有素材选择已实现路线，不把示例当成本期内容。

<!-- motiongit-consumer-entry-v1 -->
# 当前个人包入口 / Current personal-package entry

Start with the original personal .motion outer 00-START-HERE.md and its verified assistant/motion.mjs. Use currentTemplate/deliveryIdentity for the delivered version. Read guide.json for the current material routes, consumerDemo and consumerDiagnostics. The source-stage notes below are provenance; extraction and platform limits remain explicit in the manifest. Preserve original packages, Key and projects.

# 本期制作先按素材选择路线

先读 `NARRATION-VISUAL.md`。已有原声或文稿就直接继续，不重复索取。新制作可用本包已声明的 `motion-kit` 同风格控件路线，参数合同为 `kit.params.schema.json`；作者源码入口为 `adapter/motion_kit_entry.py`，正式个人包仍使用已验签随包助手的对应 workflow。原生组的时长或动作含义不合适时，使用这条已实现的路线承接内容，不反复把短句凑成长时间静态镜头。有人物时保留本期 presenter。已有工程继续原路线，不跨引擎强行混排。

本机有可用语音识别工具时先复用，保留实际原始记录；单个在线转写工具等待异常时改用可用的本地核对方式，审批设置保持。路线与时间绑定由助手完成，不增加用户必填步骤。

先读 AUDIO.md 与 NARRATION-MAP.md：保留完整原声，核实 ASR，再按句意和真实时间绑定动作。

Read AUDIO.md and NARRATION-MAP.md: preserve original speech, verify ASR, and bind actual actions to measured phrases.

时长与选镜头请先读[DURATION.md](DURATION.md)：保留用户完整口播，单镜头容量不是整片时长上限。

# 模板01 · 现代图文口播 · 中文版

先读[guide.json](guide.json)。提供本期口播、文稿/SRT及证据素材；文案优先。26组完整动作支持横竖屏60fps。默认显示中文字幕，保留英文翻译参考；扫色来自真实中文词时间。主巡演展示7组。旧版效果已验收，语言版另外检查。无个人Key或解密秘密。


## 本次封装

本包保留已提炼模板的动画源码、运行库、素材、许可和适配合同。官网应保留已上传的审核视频；核心仅保留本画幅的旧渲染预览以兼容现有读取器。个人下载由官网按 personal-download-v1 包装，并自动放入下载者自己的原账户 Key。新协议助手负责读取包内凭据、调用官网 API、查询模板更新。此作者上传核心不得作为个人下载交付。


## Added motion-kit workflow · 0.3.0

This talking-head template retains its original native source and native parameters.
It also contains 70 controls and 210 variants in the explicit dark-tech motion-kit workflow, with independent landscape and portrait layouts. This is an added style; a frozen native landscape scene has not thereby become a portrait scene. Native and kit scenes are not mixed on one timeline by this release.

Choose controls from guide.json.extensionLibrary using the user's actual copy, audio, media and facts. Do not reuse demo claims, synthetic evidence, people or unrelated brands. Put segment controls in timeline.segments and overlay controls in timeline.overlays; use measured sentence/word cues, complete source intervals and real narration duration. Read kit.params.schema.json and kit-integration.json for the exact pinned fields, dependencies and source digests.

Normal official entry, same personal .motion; the Key stays in the official host and is never copied to a project, generated video or renderer child. Inputs have this explicit shape:

```json
{"workflow":"motion-kit","timeline":{"layout":"landscape","duration":5,"hud":false,"segments":[{"control":"quote","t0":0,"t1":5,"props":{"text":"Replace with the user's actual words"}}]}}
```

The example has no narration and is only an input-shape illustration. For a real talking video bind timeline.voiceover and, if available, timeline.presenter.src and subtitles. Put declared local media below the selected input directory. Use the real audio duration or an explicit verified narrationRange rather than truncating, padding or freezing an input to fit the example.

```text
node assistant/motion.mjs run <personal.motion> --instance <instance> setup --workflow motion-kit --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> capabilities --workflow motion-kit --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> check-params <params.json> --inputs <inputs> --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> plan <params.json> --inputs <inputs> --out <instance/plan> --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> prepare @vault --inputs @vault --plan <instance/plan> --out <instance/project> --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> preview <instance/project> --times <actual-times> --language zh
node assistant/motion.mjs run <personal.motion> --instance <instance> render <instance/project> --out <instance/video.mp4> --language zh
```

Inspect the actual plan and set its review.json reviewed=true only after review. Prepare a new project, inspect actual previews and set preview.json reviewed=true only after review. The package blocks an unreviewed final render. Use --language en for an English instance; one language is retained per instance. Renderer sources are temporary per operation, while only verified inputs and review receipts remain in the permanent instance.

Dependencies use a separate kit cache and a registry-integrity lock for playwright-core1.58.2 and NumPy2.4.2. The bundled helper can prepare its automation browser if absent; setup does not upgrade host FFmpeg. Read guide.json.consumerDiagnostics for the actual runtime requirements. Source files are frozen in this release; a future motion-kit version is integrated as a new template release with fresh verification, never silently downloaded into this package. Compare frozen old/new catalogues with `node motion-kit/tools/compare-contract.mjs <old merged spec> <new merged spec>`; inspect reported breaking field/layer/variant/timing changes and produce new plans/previews. New spec groups must have matching JS/CSS and are registered before the timeline engine at packaging time; missing group code blocks packaging. Artistic owner review and native Windows/Linux tests remain pending.

## Template-specific style adaptation

The owner approved the upgrade direction on 2026-10-12. Use the original template material, colors, typography, composition and motion when choosing controls. `timeline.styleProfile` chooses the whole-film default; `timeline.segments[i].styleProfile` can match a different chapter. Available profiles: light, dark. Omitting the field uses light. Profiles run independently, sharing the same media clock and exactly one sound-cue stream. Original native workflows remain available. Native scene + MotionKit scene mixing is still a separate production integration task, not claimed by this style compositor.

The complete original groups remain preserved; new recommendations do not impose author/model restrictions. All component versions and profile files are frozen. A library update requires a new version, compatibility review and visible effect check.


## Current release entry

Read CURRENT-USE.md before historical adapter/service notes. Local candidate 2.2.0-rc.11 preserves frozen native and component code. Read release-readiness.json for actual scope. Website downloads embed the downloader account Key; optional services are host-managed.


## Current packaging

Read CURRENT-USE.md and guide.json. This author core is wrapped by the website as personal-download-v1, containing the downloader original Key. Optional APIs are host-managed. Packaging preserves the existing source library; source-wide extraction claims remain those of the source QA.


## Publication release 2.3.0

Read PUBLICATION.md and CURRENT-USE.md for the current publication contract. Animation, runtime and media bytes are unchanged from the verified 2.3.0-rc.1 package. Historical source QA and platform limitations remain in effect. Current license: MIT.
