# Tasks

- [ ] Task 1: 建立项目配置与模板说明
  - [ ] SubTask 1.1: 新建 `_work\configs\横屏口播.json`（template / sources / captions / timings / output / publish）
  - [ ] SubTask 1.2: 依据 `guide.json`、`contract-native.json` 与实测报错，整理模板用途、输入契约、合成机制、限制
  - [ ] SubTask 1.3: 输出 `03-成片\流程说明.md`（中文：调用链、60fps 帧规则、相对路径规则、常见报错对照）

- [ ] Task 2: 模板适配层
  - [ ] SubTask 2.1: 新建 `_work\adapter\probe.py`：读包内 guide/contract，生成 `_work\template-profile.json`（路线、槽位、帧率、必填项、版本、入口 sha256）
  - [ ] SubTask 2.2: 新建 `_work\adapter\native.py`：由配置 + profile 生成 `params.json`，自动满足 `durationFrames`、场景覆盖、相对路径、`music.mode`
  - [ ] SubTask 2.3: 槽位缺失时输出中文降级方案（如无视频槽位 → overlay 贴片）

- [ ] Task 3: 统一流水线
  - [ ] SubTask 3.1: 新建 `_work\pipeline.py`，阶段 `prep → captions → params → check → plan → prepare → preview → clips → render → qc → publish`
  - [ ] SubTask 3.2: 每阶段声明输入/产物，产物齐全即跳过（幂等）；`--stage` 可单跑
  - [ ] SubTask 3.3: 失败写 `_work\state.json` 与 `_work\logs\<stage>.log`，屏幕输出中文摘要
  - [ ] SubTask 3.4: `--status` 输出当前阶段、已完成产物、剩余阶段、上次失败原因

- [ ] Task 4: 运行时复用
  - [ ] SubTask 4.1: 默认复用 `mg-cache4`，不新建缓存目录
  - [ ] SubTask 4.2: 安装依赖统一走 `PIP_INDEX_URL` 国内镜像，日志记录速率与耗时
  - [ ] SubTask 4.3: 缓存缺失时提示重建与预计体积（约 340MB）

- [ ] Task 5: 录屏插片
  - [ ] SubTask 5.1: 按冻结检测结果裁可用区间，输出 `_work\clips\*.mp4`（1920×1080 / 60fps / H.264）
  - [ ] SubTask 5.2: 冻结率 > 70% 的片段走 0.85× 慢放补帧；仍不达标改截图位移动效
  - [ ] SubTask 5.3: 在配置里写「画面归属表」，把每条插片绑定到口播时间段

- [ ] Task 6: 抖音发布规格
  - [ ] SubTask 6.1: 探测模板是否支持 portrait；支持则重渲染竖版，不支持则用合成生成 1080×1920 安全版
  - [ ] SubTask 6.2: 导出编码规范：H.264 High / AAC 48k / 8—12 Mbps / 响度 -14 LUFS / 峰值 ≤ -1 dBTP
  - [ ] SubTask 6.3: 生成封面 1080×1440（三帧候选：钩子句 / 成品全景 / 关键数据）
  - [ ] SubTask 6.4: 生成 `发布包\标题与文案.txt`（标题 + 正文 + 话题标签），首句钩子、结尾引导
  - [ ] SubTask 6.5: 字幕安全区检查（下 15% 避开 UI），同时输出外挂 `master.srt`

- [ ] Task 7: 自动 QC
  - [ ] SubTask 7.1: 检查时长、分辨率、帧率、视频码率、响度、峰值
  - [ ] SubTask 7.2: 检查黑帧、夹帧、静音段、音画同步偏差（≤120ms）
  - [ ] SubTask 7.3: 检查字幕覆盖率与最长行宽；失败输出中文问题清单与时间点，禁止打「可发布」标记

- [ ] Task 8: 交付归档
  - [ ] SubTask 8.1: `03-成片\` 放入 `master.mp4`、`master.srt`、`流程说明.md`、`素材清单.md`
  - [ ] SubTask 8.2: `发布包\` 放入竖版/横版成片、封面、`标题与文案.txt`、`master.srt`
  - [ ] SubTask 8.3: `素材清单.md` 记录模板版本、许可、素材来源、插片区间

# Task Dependencies

- Task 2 依赖 Task 1（配置字段先定）
- Task 3 依赖 Task 1 / 2
- Task 4 与 Task 3 可并行
- Task 5 依赖 Task 3（走 clips 阶段）
- Task 6 依赖 Task 3 / 5
- Task 7 依赖 Task 3 / 6
- Task 8 依赖 Task 6 / 7
