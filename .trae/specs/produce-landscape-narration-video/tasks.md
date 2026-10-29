# Tasks

- [ ] Task 1: 获取并体检模板包
  - [ ] SubTask 1.1: 用户在 motiongit.com 登录并下载 `#336980 Modern Editorial` 的 `.motion` 个人包，放入 `横屏口播\模板\`
    - 现状：文件已放入，但只有 24,952,589 字节，包内 `content/release.bin` 应为 26,409,512 字节，**尾部被截断**，`inspect` 报 `PACKAGE_INVALID`
  - [x] SubTask 1.2: 只列包内条目，读 `00-START-HERE.md` 与 `assistant/guide.json`，记录版本 / sha256 / 许可
    - 版本 2.7.18-alpha.2；`assistant/motion.mjs` 836,994 字节，sha256 `7004609d…f6f3`，与官方 `1.0.0-rc.50.json` 完全一致；MIT
  - [x] SubTask 1.3: 核对运行时：Node.js 22+、Python、Chrome、FFmpeg；缺什么补什么，不额外装全局工具
    - Node v22.23.4 / Python 3.11.9 / FFmpeg 9.0.2 / Chrome 153，均已就绪，未安装任何额外软件
  - [ ] SubTask 1.4: 确认参数契约（5 个参数、素材槽位、时长策略）并写成中文对照表
    - 阻塞：需 `node assistant/motion.mjs start` 验签通过后才能读实际参数合同

- [x] Task 2: 转写 8 段口播
  - [x] SubTask 2.1: 用 faster-whisper（small / int8，CPU）逐段转写，带词级时间码
  - [x] SubTask 2.2: 输出「段号 / 实际文本 / 时长 / 静音边界」表 → `_work\transcript\转写汇总.md`
  - [x] SubTask 2.3: 与旧稿做差异表，标出缺失、改写、说错的技术点 → 已写入 `口播文案-横屏.txt` 第二节

- [x] Task 3: 按实录重写文案
  - [x] SubTask 3.1: 以实录为准确定叙事段落与镜头归属（出镜 / 录屏）
  - [x] SubTask 3.2: 重写 `口播文案-横屏.txt`（实录版），旧稿保留为 `口播文案-横屏-旧稿.txt`
  - [ ] SubTask 3.3: 同步更新飞书文档（另建一版，不覆盖已发的）

- [x] Task 4: 拼接口播母版
  - [x] SubTask 4.1: 按 Task 2 的静音边界裁头尾，段间留 0.25—0.4s → 头 0.18s / 尾 0.24s
  - [x] SubTask 4.2: 统一画幅与帧率，拼接为单条 H.264 + AAC → 1920×1080 / 30fps
  - [x] SubTask 4.3: 响度标准化到 -16 LUFS / 峰值 -1 dBTP → 实测 -16.0 LUFS / -1.0 dBTP
  - [x] SubTask 4.4: 自检：无黑帧、无爆音、总时长与转写总和误差 < 0.5s → 黑帧 0 段，母版 141.40s

- [x] Task 5: 生成并对齐 SRT
  - [x] SubTask 5.1: 用 Task 2 的词级时间码生成 SRT → `_work\master\master.srt`
  - [x] SubTask 5.2: 合并过短字幕，单条不超过 20 字 / 2 行 → 55 条，最长 20 字
  - [x] SubTask 5.3: 人工校对专有名词与数字读法 → 拼领→拼脸、新流→星流、繁体转简体

- [x] Task 6: 处理录屏卡顿素材
  - [x] SubTask 6.1: 逐段检测可用区间（freezedetect 统计）
    - 17-13-45 星座散点：冻结 0%，可用
    - 17-14-00 地球：冻结 12.7%，最长 0.28s，可用
    - 17-15-05 1024 像素画：冻结 0%，可用
    - 17-13-00 倒计时：冻结 91.7%，最长 6.82s（页面本身静态为主，取数字跳动段）
    - 17-14-26 星流乱线：冻结 72.9%，47 段微卡顿，需补帧或截短
  - [ ] SubTask 6.2: 0.85× 慢放 + 补帧到 60fps，输出统一规格
  - [ ] SubTask 6.3: 补帧不达标时，改用同形态截图做位移/缩放动效

- [ ] Task 7: 套模板并预览
  - [ ] SubTask 7.1: 按 guide.json 映射参数：母版视频、SRT、录屏插片、图片、标题
  - [ ] SubTask 7.2: 生成完整预览，逐段核对口播位置、字卡内容、插片时机
  - [ ] SubTask 7.3: 修正溢出文字、素材裁切、节奏错位

- [ ] Task 8: 导出与交付
  - [ ] SubTask 8.1: 导出 1920×1080 / 60fps 成片到 `03-成片\master.mp4`
  - [ ] SubTask 8.2: 输出 `master.srt` 与 `素材清单.md`（模板版本、许可、素材来源）
  - [ ] SubTask 8.3: 终检：时长、音画同步、黑帧、字幕一致性

# Task Dependencies

- Task 2 依赖 Task 1（至少要确认模板对输入时长的要求）
- Task 4 依赖 Task 2
- Task 5 依赖 Task 4
- Task 7 依赖 Task 1 / 4 / 5 / 6
- Task 8 依赖 Task 7
- Task 3 与 Task 6 可并行
