<!-- motiongit.narration-closure/1 -->
## New narration: resolve the whole composition / 新片完整组合

For a new narrated motion-kit production, the assistant can select one explicit
normal-entry profile before check/plan:

```json
{"timeline":{"narrationComposition":"readable/1"}}
```

The source-bound entry compiles supported content layouts to balanced, bottom
captions to captionLayout=balanced-lines/1, highlight to complete-text/1, and a
final highlight to ending=cut. These are a single reviewed new-production recipe,
not a new default for old projects. Explicit conflicting fields are rejected with
their exact names; choose the requested fresh recipe or retain the old profile.
The plan shows the resolved input; the vault preserves the exact supplied input.

Step following is selected only when existing cues completely bind the steps to
genuine supplied whole-caption starts. Missing evidence keeps the original reveal
and SFX and is reported as deferred. No cue is added or retimed. Do not invent per-
step/word times or force paid ASR; reuse genuine existing captions. Whole-group
simultaneous context is allowed when the actual sentence introduces that group.

captionLayout=balanced-lines/1 is also available independently. It changes the
bottom .mk-cap typography, not just highlight .q: complete words and closing
punctuation are balanced within the actual existing width/font and line capacity.
It preserves exact text/spaces and caption s/e, never shrinks/crops; capacity still
fails explicitly. Omitted preserves approved old wrapping, positions and clocks.

Read narrationChoices.composition in normal check/plan. It lists all remaining
choices together, deferred cue evidence, and every comparison's visible fields
beside the full original spoken quote. A literal substring is not semantic proof:
check negation, direction, numbers/units and conditions. Extra performance claims
need actual supplied evidence; a purpose label or reviewed=true does not establish
that evidence. Restore source meaning rather than invent stronger paraphrases.

Use NARRATION-MAP.md for timing/ownership/purpose contracts and this current
NARRATION-VISUAL.md for visual/new-production choices. Do not copy an old visual
guide into another document. Inspect the full encoded sound film including bottom
captions and the ending. No source/semantic/artistic approval is produced by these
structural or literal-copy checks.

中文：由助手为新片显式选择完整组合，不让用户填参数表。旧片不自动迁移。
底部字幕与主体高亮分别排版；保留全文、原声、cue和音效时钟。缺少真实步骤
时间就保留原显示并说明，不编造逐项同步。比较文案逐字段对照完整原句；
“更抗挤压”等原文没有的性能不能由审查标签、布尔值或同义改写冒充证据。

<!-- motiongit.highlight-readability/1 -->
## Complete highlight text / 完整高亮正文

For a new narrated composition with highlight, the assistant explicitly selects
`timeline.highlightReadability:"complete-text/1"` before check/plan. Omitted keeps
the original rendering. All other controls keep their existing contracts.

This option supports marker/circle/underline, portrait/landscape and each declared
style profile. The complete marked phrase stays together when it fits; longer
phrases wrap inside their own measured box. No text is removed or word time
inferred. The preferred native body font (portrait88/landscape86) is retained;
insufficient area or an isolated marked-line fragment is rejected rather than
shrinking/cropping. Recompose complete groups in a fresh reviewed plan.

When highlight is the final scene and ending=cut, its text remains clear to the
existing cut. Duration, source audio, captions, cue interpolation and every SFX
event stay unchanged. This is a visual text exit choice, not extra speech/hold.
Decorative spark exit, non-final highlight and explicit fade keep original timing.
It is not a global all-controls hold or a claim that other controls have no exit.

Review the full sentence, markers, transition and final encoded sound film.
Keep old approved projects on their existing mode; new composition changes are
saved separately. The assistant selects and checks this option, not a user form.

中文：新片可显式选择完整高亮正文，所有字符和真实声音/字幕/cue/音效时钟保留。
只改变高亮组的断行与末镜头cut时的正文退出；不拉长片尾、不猜词钟、不全局缩字。
其它控件、非末镜头和明确fade仍保留原退出。容量不足须另存重排，不能绕过保护。

<!-- motiongit.narration-choices/1 -->
## Before the first check / 第一次检查前

For a **new motion-kit narrated film**, the assistant explicitly selects the
existing options below inside timeline; they are not automatic renderer defaults.
They also appear in normal check-params/plan output as narrationChoices.

```json
{"narrationLayout":"balanced","narrationVisualMode":"follow-speech"}
```

balanced applies content-sized layouts to supported lists/steps/comparisons/cards.
It does not automatically reserve every subtitle rectangle: inspect full captions
and real content, including scene openings/exits. follow-speech hides future step
labels only with one genuine cue per item. Partial/missing cues retain the original
reveal fallback; do not invent missing times. One genuine complete sentence can
introduce a whole group together at the same real cue. Neither flag fixes late
compare/keyword entry: bind recognizable context in time and inspect real frames.

Keep omitted/original for an approved old project unless the user's modification
requires re-composition; save a fresh input/plan for changes. Check/plan reminders
never alter parameters, certify semantics, bypass capacity/caption guards or grant
approval. Keep complete speech, source clocks, native actions/sounds and review.

中文：新口播由助手在第一次检查前直接选用适用选项，不让用户填技术表格。
先读正常返回的 narrationChoices：确认当前值、完整真实 cue 和镜头开头的主体。
旧工程缺省仍是 original；改进另存并重新检查，不自动迁移已审核画面。

# 口播画面编排提升

以完整本期台词和真实语音时间安排画面。每句都需要有对应的主体、关系或状态表达；字幕、角标、背景粒子和随机镜头移动不算句子的画面表达。由助手完成编排，不增加用户必填表格或额外操作。

1. 先保留完整原声和所有句子，再记录每句表达什么、画面上哪个实际对象承接、何时出现或变化。句子可以共享一个连续镜头，不要求每句切屏。
2. 选有意义的动作：比较要有真实两端，过程按实际顺序推进，条件未成立时不能打完成勾，数字保留单位。抽象观点可以用文字结构；不要把所有内容都降为标题加静态清单。
3. 优先使用用户已有图片、录屏、人物和本模板原生动作，按实体、因果、比较或过程组织。缺少可选素材时继续使用同风格文字/图形表达，不强制找图、付费生成或追问问卷。
4. 同镜头内随句子逐步出现、建立联系、切换关注对象；讲完的对象可保留做上下文。不要开头把所有信息一次铺满，后面只换字幕或每隔几秒随机高亮。
5. 只有整句字幕时，同一完整句的比较对象可以一起呈现；不得按字数猜左右词语的时点。逐词强调必须有真实词边界，不能为追求动效编造时间或加速人声。
6. 读取计划的 visualCoverage 检查遗漏、重复主体和长镜头。提示是修改建议，不自动删除句子、阻断旧工程或认定语义通过。合法的长镜头和安静阅读保持可用。
7. 组件使用真实 cues 驱动它实际支持的进入/转换动作。原生保护动作仍用原速和合法 cue；无法匹配时重新编排或选择同风格中性表达，不能强改原生时钟。只存在于 JSON 的目标不能算已实现。
8. 预览逐句检查“声音说到什么，画面表达什么”，再看最终编码。分别记录时间、语义和视觉表现；原声完整、参数通过、字幕出现都不能单独充当视觉质量通过。
9. 每句还要检查开头、转场与结尾，不以句中一帧代表全句通过。先让可辨识的主体或关系承接台词，再做强调；不要把“比较两种对象”的主体入场拖到后面的属性词，留下只有背景和字幕的长空档。控件只支持入场 cue 时，可按真实整句整体呈现对象，不把入场时间伪装成词级强调。

使用扩展步骤控件制作新片时，如每项都已有真实的完整 cue，可设置 `timeline.narrationVisualMode=follow-speech`，内容讲到才显示。缺少完整 cue 时保留原显示，不自行补猜时间。该模式不改变音效和动作时钟。图标卡片收到明确 cue 后按讲述保持关注；没有 cue 时保留原有停留动效。不要为了启用新模式要求用户额外填表，由助手在原有制作流程完成绑定。

新制作可使用已声明的随句渐进模式。修改已审核工程时保持原模式，除非本次修改要求提升编排；所有修改另存。原 Key、更新入口、旧包、工程、横竖屏布局、时间/动态 Logo、配乐和原生音效能力继续保留。

新制作的图标卡片使用 `timeline.narrationCardLayout=balanced`：短标题卡不预留大段说明空白，标题与卡组集中构图；卡间距包含同时聚焦放大和卡组旋转的余量。两项横屏可用横向卡，三四项及网格按实际内容适配。保留原有翻转、描线、句级 cues 和声音，不拆猜同句的词时点。由助手直接选择，不增加用户操作。修改已审核工程默认保留原布局；本次明确要求改善构图时另存后启用。预览检查同时聚焦、长标题/说明、横竖屏、人物区与字幕区，不能只检查一张静帧。

统一的新片布局使用 `timeline.narrationLayout=balanced`，同时适配清单、步骤、对比、优缺点卡片、勾选清单和图标卡片。按实际条数和内容留出间隔，人物同屏时使用更紧凑的组合；完成章有自己的留白，不能盖住最后几条内容。卡片材质和文字色从当前模板的实际主题取得，不能在浅色主题上留下深色卡配深色字。长说明按合法完整内容换行、缩到可读字号；空间不足仍应拆分镜头，不能裁字或关掉容量检查。保留全部原生动作、声音和字幕时钟。由助手在正常制作中直接选择，不追问技术选项。旧 `narrationCardLayout` 仍只调整图标卡片，旧工程未选统一模式时保持原布局。
