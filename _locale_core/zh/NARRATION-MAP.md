<!-- motiongit.narration-current-guide/1 -->
## Current production guide / 当前制作说明

Read `NARRATION-VISUAL.md` before selecting the current production options,
then inspect the normal check/plan findings. It is the single current source
for visual layout, complete highlighted text and applicable ending choices.
This document retains the continuous-caption, narration ownership and exact
visual-purpose contracts below; it does not duplicate a visual-guide snapshot.

新制作先读 `NARRATION-VISUAL.md`，再按正常 check/plan 返回复核适用选项。
本文继续提供连续字幕、口播归属和画面用途合同；不另存旧版视觉指南副本。
已有工程保持原参数及审核流程，不猜时钟，不增加用户必填技术表格。

<!-- motiongit.shared-continuous-captions/1 -->
## Continuous captions in the normal component workflow / 连续字幕

For current narration whose complete subtitle cue crosses a visual cut, select
the template's declared motion-kit component timeline (poster-kit for623/624).
Use `captionBinding:"continuous"` on every narrationMap row. Map each shot to
exactly all original cues intersecting it using captionIndices; keep the full
spokenText, real cue start/end and sentence beats even when those cue bounds
extend beyond this shot. Repeated references provide visual context: subtitles
and original audio still play once. Never split or retime the supplied captions,
infer word timestamps from scene boundaries, or mark guessed times as reviewed.
Use actual visible fields as beat targets; preserve negation, comparison and
unfinished-action meaning. With sentence timing, present the complete sentence.

新建口播遇到一句跨画面时，助手选择本模板已声明的组件时间线，在每个
narrationMap条目填写captionBinding:"continuous"，按真实区间记录相交的
captionIndices和完整原句。保留原声、原字幕时间与完整句意，不要求用户填技术表格。
逐词强调仍需要该具体制作入口实际验证的词证据；这里不把标签或句字幕当词时钟。

This opt-in applies to the component timeline only. Without the marker, existing
component inputs keep their old ownership rules. Native brief/ownershipRefs
retains its original contract; do not add this marker to an unsupported native
route. The rules below describe that legacy/native mode unless explicitly noted.

# Narration, picture and action / 口播与画面

The assistant builds the plan from the complete real narration. Do not ask the user to fill technical tables. Read the source, listen at phrase boundaries and topic changes, and review ASR text/timestamps against the actual sound. ASR can be wrong; uncertain timing remains pending review. Do not automatically shift captions because a screenshot appears mismatched. A whole-film duration match proves neither sentence alignment nor action meaning.

按完整原声理解句意，先核对否定、限定、实体、数字与先后关系，再选择动作。ASR 文本和时间戳可能出错，须结合试听核实。一个时间映射表通过不代表画面表达正确；不应仅凭截图归因于模板或ASR。

For 626 and component timelines provide narrationMap with one row per selected shot: shot (zero-based), start, end (output seconds), spokenText (complete owned words), purpose, timingSource (provided-captions/measured-phrases/reviewed-transcript), captionIndices (zero-based when captions exist), and beats. Each beat has at, until, spokenText, timing (sentence or measured-word), and target. Sentence timing must use the real sentence interval; never invent word times from character count. Every caption belongs exactly once, and a shot must not cut its owned cue. Keep qualifiers and negatives in spokenText. Actual listening and meaning review remain required after this structural check.

626 B1 targets: keyword/explanation/headline; B2: heading/headline/points.0 through the actual last point; B3: heading/headline/left/right/conclusion; B4: summary/headline/action. These beats are consumed by the renderer to move visual focus at the actual output times. Different occurrences may use scene.basic overrides and different titles. Add enough compatible shots to cover all narration, or use the declared quiet hold with successive phrase focus. Existing entry/exit actions and native effects retain their source speed. Source native targets use actual protectedCueTimes IDs and must coincide with the spoken interval; if they cannot, choose a neutral expression instead of retiming protected motion.

Native multi-pack plans retain their existing measured contentEvidence.units, ownershipRefs, intent, anchors and phases. The plan writes narration-map.json and binds its hash into review. Match actual native actions and their source cue times to the words; inspect the selected group rather than picking it for remaining capacity. Component timelines use the real control/cue target and actual cues; the mapping does not add missing motion behavior to a control.

Do not show an unearned completed check for “not yet checked”; do not use elimination/shattering for outreach/support; do not use project-file graphics as account-association diagrams. S05/S13 are software-project workflows; S08 is decision/rejection; S10 is real comparison; S15/S16 are constrained process/completion or software actions. If the actual idea differs, use the same-style neutral B1–B4 or compatible components. All visible source labels and numerical endpoints must come from the current user's content. Do not invent years, counts, percentages, speeds or completion states. S08 labels/year tags and S16 terminal text are explicit slots; leave no option_A or author demo text in a production.

技术验收：原声完整、时钟保留、混音编码对比。内容验收：逐句实际听看，核对出现/强调时点、动作含义、左右对应、转折和结尾。分别记录，通过前者不能宣称后者通过。

Explicit approved excerpts: when narrationRange selects a complete source interval, captionIndices are zero-based among the selected output captions, and selectedSourceCaptionIndices records their original source indices. Whole cues entirely outside that explicit interval are omitted. A boundary through a sentence is rejected until a real reviewed phrase boundary/caption is supplied. With no explicit range, every full supplied cue remains required; this exception never authorizes shortening the user's full narration.

用户明确选取片段时，captionIndices 从所选输出字幕的0开始；报告保留原字幕索引。只排除明确范围外的完整句，边界穿过句子须核对真实分句。未明确选段时仍须完整覆盖全部口播，不默认删减。




<!-- motiongit.narration-purpose-contract/1 -->
## Exact visual-purpose contract / 画面用途合法值

`narrationMap[].purpose` accepts exactly these source-defined values:

- `neutral-emphasis`
- `neutral-list`
- `ordered-process`
- `real-comparison`
- `provided-evidence`
- `decision-rejection`
- `confirmed-completion`
- `outreach-support`
- `summary`
- `user-requested-action`
- `software-project-workflow`

These values describe the actual intended meaning. They are not interchangeable style tags. The original scene restrictions still apply:

| Scene | Allowed purposes |
| --- | --- |
| `S05` | `software-project-workflow` |
| `S08` | `decision-rejection` |
| `S10` | `real-comparison` |
| `S13` | `software-project-workflow` |
| `S15` | `ordered-process`, `real-comparison`, `confirmed-completion` |
| `S16` | `software-project-workflow`, `confirmed-completion` |

Controls `stamp`, `check`, and `checklist` additionally require `confirmed-completion` or `user-requested-action`. A scene absent from this table has no additional enum restriction from this validator; its visible action must still match the real speech. Enum/clock validation does not establish semantic correctness.

Examples: a neutral B1 explanation can use `neutral-emphasis`; S10 requires an actual two-sided comparison and `real-comparison`; S08 uses `decision-rejection` for an actual rejection; an unfulfilled instruction must not be relabeled `confirmed-completion`. These are semantic examples, not complete timed inputs. Retain every full original cue, qualifiers, negation and measured beats; use `compose` where supported to build a compatible input from the real narration. Never guess alternative labels until validation passes or fabricate word times.

中文：先按实际口播含义选上述合法值，再按场景限制选画面。合法值不是可任意替换的风格标签；未完成的请求不能标成已经完成。B1 中性解释可用 neutral-emphasis；S10 只用于真实比较，S08 用于真实拒绝。校验通过不代表语义正确，仍须审核实际画面与完整声音；不删原话、不改时钟，也不靠反复猜枚举过关。


<!-- motiongit.native-caption-ownership/1 -->
## Native character ownership and the original word clock / 原生字符归属与真实词时钟

contentEvidence.units.start/end are exact Python character offsets into the
original text, never seconds. The normal native entry binds the original caption
file and validates ownership with its measured highlight.units word intervals.
Full text/IDs and ordered exclusive ownershipRefs remain mandatory. Character
units inside one measured word share that whole word interval; no character time
is interpolated, and a scene cut cannot split that word. Pure whitespace between
complete captions is recorded as a source separator without inventing a clock.
Missing word evidence, text/clock mismatch and real scene overflow still fail.
Optional unit.time must match the bound word interval or a complete actual cue;
it cannot override the source. Source bytes and user parameters are not rewritten.
This validates supplied source/clock consumption, not ASR authenticity, meaning,
artistic quality or final-film acceptance. Keep the complete original media and
normal approval gates; do not substitute component continuous mode for native.

中文：start/end是原文字符切片，不是秒。助手保留完整原文、原声和真实词级
字幕，由正常入口使用绑定字幕的原始词时钟核对镜头归属；不按字数或镜头边界
猜时间，不删除ownership校验，不把合法标签当作语义通过。
