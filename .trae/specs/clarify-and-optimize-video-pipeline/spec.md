# 口播成片流水线通用化与抖音发布优化 Spec

## Why

现在这条流程能跑，但只服务于「这一条片子 + 这一个模板」：脚本散在 `_work` 里、参数靠报错试出来、setup 反复重装依赖、录屏素材闲置，用户全程看不到进度。更关键的是，下一支片子换模板、换素材时几乎要重来一遍；而且成片目前只有 16:9 母版，没有按抖音的发布规格准备（竖版、封面、标题话题、响度、字幕安全区）。需要把这套东西做成可复用的制片流水线，并把抖音交付纳入标准。

## What Changes

- 引入**项目配置**：模板包、素材目录、口播清单、字幕来源、输出规格、发布平台全部写进一个 `project.json`，换模板/换素材只改配置，不改代码。
- 引入**模板适配层**：自动读模板的 `guide.json` / `contract`，探测可用路线（native / motion-kit）与素材槽位，生成 `template-profile.json`，由适配器把统一配置翻译成该模板的参数。
- 把散落脚本收敛成**一条可续跑的流水线**：阶段化、幂等、失败可单跑、中文报错、状态与日志可见。
- 固化**运行时依赖缓存与国内镜像**，不再重复下载 numpy/scipy/opencv。
- 接入 `02-录屏素材`：统一预处理为 60fps 插片，按「画面归属表」绑定到口播时间段。
- 新增**抖音发布规格**：双版本导出（16:9 母版 + 9:16 安全版）、封面、标题/文案/话题、字幕烧录与安全区、响度与编码规范。
- 新增**自动 QC 门**：时长、分辨率、帧率、响度、峰值、黑帧、字幕覆盖率、音画同步，任何一项不过就不允许标记「可发布」。
- 交付目录补 `流程说明.md`、`素材清单.md`、`发布包/`。
- **BREAKING**：零散命令与一次性试探脚本不再作为流程入口，统一由流水线调用（旧脚本保留只读参考）。

## Impact

- Affected specs：`produce-landscape-narration-video`（成片目标不变；本 spec 负责通用化、工具层与发布规格）
- Affected code：
  - `横屏口播\_work\`（新增 `pipeline.py`、`adapter/`、`configs/`、`state.json`、`logs/`、`clips/`）
  - `横屏口播\03-成片\`（新增 `流程说明.md`、`素材清单.md`、`发布包\`）
  - `横屏口播\02-录屏素材\`（只读输入）
  - 模板包 `模板\*.zip` 只读，不修改、不覆盖

## ADDED Requirements

### Requirement: 项目配置化
系统 SHALL 用一份 `project.json` 描述一支片子的全部输入与输出，换模板或换素材时只改配置。

#### Scenario: 换模板
- **WHEN** 用户放入新的 `.motion` 包并改 `project.json` 的 `template` 字段
- **THEN** 流水线重新探测模板能力并生成参数，不需要改任何脚本
- **AND** 若新模板缺少当前用到的槽位（如视频插片），给出中文提示与降级方案

#### Scenario: 换素材
- **WHEN** 口播素材或录屏素材目录变化
- **THEN** 按 `project.json` 的 `sources` 重新扫描，已存在的中间产物（转写/母版/字幕）按内容哈希判断是否复用

### Requirement: 模板适配与能力探测
系统 SHALL 把「模板怎么用」从代码里抽出来，形成可复用的适配层。

#### Scenario: 探测
- **WHEN** 首次使用某个模板
- **THEN** 读取包内 `guide.json` 与 `contract`，记录可用路线、必填参数、素材槽位、帧率约束，写入 `_work\template-profile.json`
- **AND** 记录版本、许可与入口 sha256，校验不一致时拒绝使用

#### Scenario: 参数翻译
- **WHEN** 生成 `params.json`
- **THEN** 由适配器从 `project.json` + `template-profile.json` 翻译，不手写参数
- **AND** 已知约束自动满足：`durationFrames = 秒 × 60`、场景时长之和覆盖全片、素材路径用相对 `--inputs` 的文件名、音乐显式 `none` 或绑定

### Requirement: 统一流水线与断点续跑
系统 SHALL 提供一条命令跑完整个制作，并在任意阶段可中断续跑。

#### Scenario: 全流程
- **WHEN** 执行流水线
- **THEN** 依次执行 `prep → captions → params → check → plan → prepare → preview → clips → render → qc → publish`
- **AND** 每阶段打印「阶段 / 输入 / 产物 / 耗时」，失败时原文进日志、屏幕给中文摘要

#### Scenario: 续跑
- **WHEN** 某阶段失败后重跑
- **THEN** 已完成阶段凭产物与哈希跳过，只重跑失败阶段
- **AND** `_work\state.json` 记录当前阶段、失败原因、上次成功时间

### Requirement: 运行时复用
系统 SHALL 复用已装好的依赖缓存，避免重复下载。

#### Scenario: 重跑
- **WHEN** 再次进入流程
- **THEN** 直接复用 `mg-cache4`，不新建缓存目录
- **AND** 需要新装依赖时走 `PIP_INDEX_URL` 国内镜像，并在日志记录下载速率与耗时

#### Scenario: 缓存缺失
- **WHEN** 缓存被清理或损坏
- **THEN** 提示「需重建依赖缓存」及预计体积（约 340MB），不静默卡住

### Requirement: 录屏插片
系统 SHALL 把 `02-录屏素材` 纳入成片。

#### Scenario: 预处理
- **WHEN** 进入 clips 阶段
- **THEN** 每条录屏裁出可用区间，统一 1920×1080 / 60fps / H.264，输出 `_work\clips\`
- **AND** 冻结率 > 70% 的片段不直接用，走 0.85× 慢放补帧或截图动效

#### Scenario: 绑定
- **WHEN** 插片就绪
- **THEN** 按 `project.json` 的「画面归属表」绑定到口播时间段
- **AND** 模板无视频槽位时改走 overlay 贴片，并在说明文档标注

### Requirement: 抖音发布规格
系统 SHALL 产出可直接发布到抖音的成品与元数据。

#### Scenario: 双版本导出
- **WHEN** 母版渲染完成
- **THEN** 输出 16:9 母版（1920×1080）与 9:16 安全版（1080×1920）
- **AND** 模板支持 portrait 布局时直接重渲染；不支持时用合成方式生成（画面居中、上下放品牌底），不裁掉关键信息

#### Scenario: 画质与声音
- **WHEN** 导出发布版
- **THEN** H.264 High / AAC 48kHz / 30 或 60fps / 视频码率 8—12 Mbps
- **AND** 响度 -14 LUFS、峰值 ≤ -1 dBTP（适配平台归一化）
- **AND** 无黑帧、无夹帧、无水印、无第三方 logo

#### Scenario: 字幕安全区
- **WHEN** 字幕烧录
- **THEN** 底部留出平台 UI 安全区（约下 15%），字号在手机端可读
- **AND** 同时外挂 `master.srt` 供二次编辑

#### Scenario: 发布包
- **WHEN** 成片定稿
- **THEN** `发布包\` 内含：竖版成片、横版成片、封面（1080×1440）、`标题与文案.txt`（标题 + 正文 + 话题标签）、`master.srt`、`素材清单.md`
- **AND** 标题不超过平台上限，正文含首句钩子与结尾引导

### Requirement: 自动 QC
系统 SHALL 在标记「可发布」前自动质检。

#### Scenario: 质检不通过
- **WHEN** 任一项不达标（时长/分辨率/帧率/响度/峰值/黑帧/字幕覆盖率/音画同步偏差 > 120ms）
- **THEN** QC 阶段失败，输出中文问题清单与对应时间点
- **AND** 不生成「可发布」标记

### Requirement: 进度可见
系统 SHALL 让用户随时知道当前在做什么。

#### Scenario: 查看状态
- **WHEN** 用户执行 `--status`
- **THEN** 输出当前阶段、已完成产物、剩余阶段、最近一次失败原因
- **AND** 阶段日志按名归档在 `_work\logs\`

## MODIFIED Requirements

### Requirement: 模板套用与导出（原 spec）
在原「先预览再导出」基础上：参数错误由流水线翻译成中文，原始英文报错保留在日志；预览阶段抽帧生成对照图，供人工快速验收。

## REMOVED Requirements

### Requirement: 一次性试探脚本作为流程入口
**Reason**：靠改参数文件试错、重复装依赖，耗时且不可见，换模板即失效。
**Migration**：脚本保留作参考；统一入口读取同一份 `params.json` / `captions.json`，行为等价。
