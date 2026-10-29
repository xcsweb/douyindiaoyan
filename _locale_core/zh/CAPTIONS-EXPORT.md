<!-- motiongit.native-caption-contract/1 -->
# 原生字幕 JSON / Native subtitle JSON

先区分路线：原生 `media.captions` 是字幕 JSON 文件路径；组件路线
`timeline.captions` 是另一份合同，按 `kit.params.schema.json` 填写，不能混用。
Read `guide.json` → `captions.nativeContract` for the complete machine-readable
schema and this locale's required primary language (`zh`).

原生文件顶层为非空数组，每行必需 `t0,t1,zh,en,highlight`，可选
`id,formatting`。不是 `start/end` 或 `at/until`，也没有顶层 `words`。
`t0/t1` 是原声真实秒数；句子不重叠且不超过完整原声。`zh/en` 为明确配对单行。
`highlight` 为 `source,language,units` 对象；每个 unit 仅含
`text,start,end`，来自真实主语言词边界，按原声时钟排序且位于本句内。
所有 unit.text 拼接必须逐字等于该语言整句，包含标点。结构通过不等于听校通过。

以下只演示结构，示例时间和文字不是真实 ASR/听校证据，禁止套用到用户原声：

```json
[
  {
    "id": "shape-only",
    "t0": 0.2,
    "t1": 2,
    "zh": "核对来源。",
    "en": "Check the source.",
    "highlight": {
      "source": "verified-word-boundaries",
      "language": "zh",
      "units": [
        {
          "text": "核对来源。",
          "start": 0.2,
          "end": 2
        }
      ]
    }
  }
]
```

只有真实句级字幕时，助手选本包已声明的
`motion-kit` 路线，按
`kit.params.schema.json` 和 `NARRATION-MAP.md` 保留完整句与真实时间；
不要编造逐词时间、反复试字段或强迫付费识别。旧原生工程继续原合同。
No protected source inspection or technical form from the user is needed.

# 扩展控件的字幕与导出 / Component captions and export

仅用于当前模板声明的 motion-kit / poster-kit 扩展控件路线。原生路线沿用自己的素材、声音与字幕合同。使用包内已验签的原有制作入口，不展开保护核心。

在本期 timeline 中设置 `captionAlignment`：

- `frame-center`（默认）：整幅画面居中，1920 宽横屏中心 x=960，1080 宽竖屏中心 x=540。
- `content-center`：横屏人物卡可见时在其左侧内容区居中；人物隐藏时回到整幅居中。

活力海报使用自己的整幅居中字幕，保留原有逐词高亮与位置；圆形人物窗不会触发左侧卡片对齐。该主题只显示原生字幕，避免再叠一层通用字幕。

字幕宽度限于可见区域，长短句切换保持底边；原文、否定、时间与所有权映射继续按实际字幕和原声校验。正常预览和导出报告的 `captionSamples` 保存抽查时刻的实际字幕边框与中心。它是几何检查，不代替完整看听和内容核对。

导出前创建并检查目标父目录。编码与混音后检查真实文件、尺寸、帧数、帧率、时长及音轨，再以不覆盖旧文件的方式交付并校验复制字节。失败时，实例输出区的私有 `.motiongit-render-*` 目录保留实际存在的已验证视频和 `recovery.json`；其中只有派生成片与记录，不保留模板源码或个人凭据。按记录恢复可用媒体，不宣称失败文件已完成或自动恢复已通过。正常完成后清理该目录。

Use the existing verified package entry and declared component workflow. `timeline.captionAlignment` defaults to `frame-center`; `content-center` selects the landscape region beside a visible presenter. Captions stay within visible bounds and retain their bottom edge when length changes. `captionSamples` records measured output geometry at sampled times, not semantic or continuous-viewing acceptance.

The renderer checks/creates output parents before expensive rendering, validates the encoded file and audio contract, preserves existing deliveries, and verifies published bytes. A failed export retains actually available validated media plus a private recovery record beside the output; no template source or personal credential is retained. Successful exports clean their derived stage. Preserve the original input and use fresh revision paths.


<!-- motiongit.caption-publish-safe/1 -->
## 竖屏发布预留 / Portrait publish preview

新竖屏默认采用短视频发布预留：字幕底距为画高的24%，左距8%，右距16%。
这是一套可调的制作预设，不是抖音或任意设备/界面的官方保证。展开的发布文案、
评论、无障碍字号和按钮布局可能占据更多位置；按本期真实发布界面检查并调整。

助手先确认字幕来源：模板字幕看正常字幕轨和DOM边框；照片/视频里烧录的字只能
结合原素材关键帧检查。素材字不受模板字幕参数控制，不能把模板检查通过当成它也通过。
使用现有素材适配步骤，将完整关键可见区域放入合适的画面窗口，必要时用contain/留边
或重新安排该素材窗口；不要自动裁丢人物、商品、重要文字或遮盖主体。无法同时保留时
说明具体冲突，再按用户已有目标选择干净原片或重排，不能私自擦除/伪造原素材。

组件可选 timeline.captionPosition={bottomRatio,leftRatio,rightRatio}；原生沿用
brief.subtitlePosition（深色控制台原生为可选顶层captionPosition）；科技风为captionPosition。
这些是助手可用的现有/可选适配参数，不向用户索要技术表格。组件/科技风显式
captionSafeArea="frame"可复核旧位置；旧包/工程保留，不改原文件。横屏默认不变。

字幕区与标题、人物、照片、视频、按钮要分别安排。正常导出按实际可见矩形拒绝
字幕越出预留区或盖住重要图文；报告中的对象和坐标用于重排那一个区域，不是把全片
统一上移或缩小。长句保持完整含义和真实整句/逐词时钟，按合法词界换行；超出可读
行数时使用真实已核对的短语边界或改排版，不估计词时间、不删限定词、不压成小字。

审核最终编码的长短句、整句/逐词、人物/照片/视频场景，并叠加标明“模拟”的底部文案
和右侧按钮遮挡。DOM检查不识别素材像素中的字幕，也不代表所有平台界面均安全。


<!-- motiongit.narration-closure/1 -->
Bottom captions have the explicit captionLayout=balanced-lines/1 option; see current NARRATION-VISUAL.md for the single new-production recipe. This is separate from highlight body text. Keep full text and true cue clocks; no font shrinking or line-capacity bypass.


<!-- motiongit.caption-visible-inset/1 -->
### Visible subject windows / 主体实际可见窗口

Normal caption overlap checks intersect the subject/text with supported ancestor
overflow and rectangular CSS inset() clips, including positive axis-aligned 2D
scale/translation. Unsupported shapes, rotation/skew/perspective or unresolved
units retain conservative original bounds; a clip-path label never exempts a
subject. A visible strip of a large subject still obstructs a caption. Complete
caption bounds, reading-area checks and actual overlaps remain checked.

中文：正常预览/导出按可准确换算的矩形裁切核对真正可见主体与文字。未知或旋转
裁切仍保守检查，不按场景/图片豁免。此修复不移动或裁剪主体、不改字幕位置、
完整文本、原声/词时钟和原生组容量；官方示例保持原输入。DOM通过仍不代表
素材内烧录字、所有发布界面或艺术/语义已验收，仍需看实际完整编码成片。
