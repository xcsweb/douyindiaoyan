# MotionGit 基础镜头 1.0.0

这是风格补充组件，`origin: new-extension`。原生因果组保持原样；一般观点可以用这些组承接。
支持 `continuous`（浅蓝纸面）、`console`（深色 HUD）、`vivid`（鲜色角色），以及横屏 1920×1080、竖屏 1080×1920，均为 60fps。

```text
python build.py PROJECT CONFIG_JSON
```

输入配置原义保存为 PROJECT/config.json；归一后的配置嵌入 main.js。
输出 index.html、style.css、main.js、macro_plan.json、sfx_events.json、sfx_native.json 和 sfx.json。
字体从本主库 assets/fonts 复制到 PROJECT/fonts/NotoSansSC.ttf、NotoSansMono.ttf；若独立运行，adapter 先提供这两个本地 OFL 字体。

## 配置

```json
{
  "style": "console",
  "layout": "portrait",
  "fps": 60,
  "brand": "本期品牌",
  "presenter": true,
  "captions": [{"start": 0, "end": 4, "text": "本期原话", "translation": "Optional translation"}],
  "segments": [{"kind": "explanation", "startFrame": 0, "durationFrames": 240,
    "title": "从用户内容提炼的标题", "text": "忠实保留用户观点的解释。", "cueFrames": [24]}]
}
```

- captions 的 start/end 使用输出秒数，半开区间；可同时显示重叠字幕。translation 可省略。
- segments 依序连续覆盖输出时钟，无间隙/重叠；totalFrames 自动取最后一组终点。
- kind 为 keyword、points、explanation、conclusion。兼容别名 keywords/list/explain/paragraph/summary。
- points 接收 1–6 个字符串 items，必须有标题；其它类型不接收 items，避免静默忽略输入。
- title/text 都来自用户本期内容。仅一个非空时只展示一次；两者都提供时分别使用。
- cueFrames 是组内相对帧；points 每项一个，其它组一个。它表示动作落点，不证明词级对齐。
- 未提供 cue 时使用组内普通动作顺序，计划标 intrinsic-motion-schedule，不按字数猜词。
- 每组至少 120 帧，cue ≥12 帧且距段尾至少 90 帧；6 项要点需相应增加片长。
- 字号有可读下限；字体就绪后测实际排版。容纳不了会拒绝，助手需拆分或改组，不隐藏文字。

## 真实人物与证据

- presenter=true 前由原生 scripts/import_talk.py 在 PROJECT 生成 talkmap.js、voice.wav 和 talk/clip_000/f_00001.jpg…。
- TALKF 为目录名数组，TALKMAP 每个输出帧是 `[目录索引, 1-based帧号]`。
- renderAt 每帧按输出时钟换真人图片并等待 decode；不以动画源时钟取人脸，不循环或冻结尾帧。
- TALKMAP 不足 totalFrames 会明确失败；presenter=false 的 plan 标 video.presenter 缺失，不生成演示真人。
- 输出不含原生 video/audio 元素；声音由最终渲染器的 --audio 参数提供。

每组可加 evidence：

```json
{"frameDir":"sc/evidence/segment_02","frameCount":240,"fps":60,
 "startFrame":0,"durationFrames":240,"offset":7,"path":"本期真实录屏的本地路径"}
```

- adapter 从真实视频 offset 区间准备 JPEG f_00001.jpg…，保持 60fps 输出时钟和源比例。
- evidence.startFrame 也是组内相对帧；durationFrames 不能超过已准备 frameCount 或本组范围。
- frameDir 必须是实例内相对目录；path/offset 只作本地溯源，页面不读取原视频路径。
- 横屏证据在面板右侧，文字独立占左侧；竖屏证据在面板下方，文字区重新计算。
- 证据图片 object-fit:contain，保留录屏完整边界；素材不足直接失败，不循环或末帧补长。

## 动作与声音协议

关键词有弹性强调、括角与下划线；要点沿轨道逐项落位；解释分层位移与引导线；结论以环形和徽记收束。
vivid 另有本地 CSS 角色动作；它是新创扩展，没有把原生源码或旧片质量追认到这里。
所有状态仅由当前输出帧求值，支持重复、倒退和重载，页面不使用 Date、RAF 或网络 API。

| 事件 | 实际 audiolib type |
| --- | --- |
| 入场 | whoosh |
| 关键词 | pop |
| 要点逐项 | tick |
| 解释 | slide |
| 结论 | check |

sfx_events.json 使用 `{time,type,gain}`；sfx_native.json 使用 `{t,type,g}`，sfx.json 为 `{end,sfx:[…]}`。
window.SFX 同样提供原生事件，window.END 为总秒数，兼容 dump_sfx.mjs。事件只登记一次，长停留不重触发。
声音在入场/主动作早段出现；不在结尾 1.5 秒内触发长声音。父 audio 流程仍需验证实际混响支持和尾音。
macro_plan 保留 fps/width/height/totalFrames/end_frame/endFrame/scenes 和 layout:{id,width,height}。
window.READY 等待字体和初帧；async renderAt(t) 与 imgWait() 等待真实图片解码。父 render_project.mjs 完成最终编码。

验收记录在任务指定 basic-acceptance 目录。浏览器静帧、最终编码、真实媒体同步和完整连续试听分别记录；未做的范围不称通过。
