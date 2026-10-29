<!-- motiongit.public-narration-contract/1 -->
Read NATIVE-INPUTS.md for current route-specific presenter/crop/texture requirements and the actual example entry. Pure narration without a person uses the declared motion-kit route; do not assume native hiding. 先读该公开说明，按已有素材选择已实现路线，不把示例当成本期内容。

# 本期制作先按素材选择路线

先读 `NARRATION-VISUAL.md`。已有原声或文稿就直接继续，不重复索取。新制作可用本包已声明的 `motion-kit` 同风格控件路线，参数合同为 `kit.params.schema.json`；作者源码入口为 `adapter/motion_kit_entry.py`，正式个人包仍使用已验签随包助手的对应 workflow。原生组的时长或动作含义不合适时，使用这条已实现的路线承接内容，不反复把短句凑成长时间静态镜头。有人物时保留本期 presenter。已有工程继续原路线，不跨引擎强行混排。

本机有可用语音识别工具时先复用，保留实际原始记录；单个在线转写工具等待异常时改用可用的本地核对方式，审批设置保持。路线与时间绑定由助手完成，不增加用户必填步骤。

先读 AUDIO.md 与 NARRATION-MAP.md：保留完整原声，核实 ASR，再按句意和真实时间绑定动作。

Read AUDIO.md and NARRATION-MAP.md: preserve original speech, verify ASR, and bind actual actions to measured phrases.

时长与选镜头请先读[DURATION.md](DURATION.md)：保留用户完整口播，单镜头容量不是整片时长上限。

# 当前使用入口

从官网下载的一个 .motion 内含下载者自己的原账号 Key。无需另行下载或保存 Key，上传者的 Key 不进入此包。内部作者上传文件由官网个人下载服务封装。

先由官方 motion helper 验签并读取 guide.json、参数、预设及许可，再按用户文案选动画并创建独立实例。示例素材只用于明确的演示；正式制作绑定本期人物、字幕、数据和授权素材。人物横竖适配以本模板实际支持和实测裁切为准，不能把占位示例当真人跟踪证据。

motion inspect VIDEO.motion
motion read VIDEO.motion guide.json
motion new VIDEO.motion INSTANCE
motion run VIDEO.motion --instance INSTANCE --cache CACHE plan PARAMETERS --inputs INPUTS --out INSTANCE/plan --language zh

先核对实际计划的内容、媒体、原速动作窗和语音时钟，再按合同确认计划，准备并检查真实预览后导出。变更参数、素材或工程后重新预览。原生和新增工作流分别制作，不宣称有跨引擎统一混排时间轴。

可选在线服务：motion api VIDEO.motion usage；motion api VIDEO.motion voices zh；motion update VIDEO.motion。官方宿主从已验签包读取 Key，模板子进程与成片工程不接收凭据。先查实时能力、报价、许可和额度，再按用户授权生成；停用 Key 后新的在线请求拒绝。离线模板制作仍可继续。更新以服务器实际返回的已发布版本和固定下载地址为准。

组件/模板源码随发行冻结；后续库升级要比较合同、文字容量、时间、颜色材质及安全区，经验证后发布新的模板版本。历史服务说明只作来源记录，当前服务可用状态须现场查询。

原始工程覆盖与最终成片效果仍按来源 QA 如实记录；本次只对用户已提炼模板做封装，不重做提炼。Windows/Linux 和所有真人/长文本场景不因本轮封装而视作已验证。


Component subtitle alignment and export recovery: read CAPTIONS-EXPORT.md. 扩展控件字幕对齐及导出恢复见 CAPTIONS-EXPORT.md。


<!-- MOTIONGIT_MOTIONKIT_WINDOWS_REPAIR_V1 -->
## Windows 组件路线的依赖与浏览器恢复

本包的 `motion-kit` 路线在 `check-params`、`plan`、`preview` 和 `render` 中使用同一份已验证缓存里的 Python 与 NumPy。更新包后按正式助手的 `setup --workflow motion-kit` 和 `doctor --workflow motion-kit` 检查独立缓存，再继续计划、审阅、预览和导出。缺失或不匹配时使用新的缓存路径重新 setup；保留原包、原 Key 和旧工程。无需创建系统 `python3` 别名，也不要把另一工程的 Python 或依赖强行注入本包。

使用标准 Node.js/npm 安装；setup 通过 Node 直接调用 npm 的 JavaScript 入口，保留锁文件与禁止安装脚本的限制。已有 Chrome/Edge 时可在当前进程设置 `CHROME_PATH` 为浏览器可执行文件的完整路径（PowerShell 示例：`$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'`），再执行官方 preview。路径带空格或中文无需重命名。

音频或旁白映射校验失败时保留完整错误：Python 启动失败会带 ENOENT 等原因；NumPy 缺失、音轨、时间和映射错误保留原始诊断。依赖错误先运行对应缓存的 setup/doctor，不要通过删音轨、改时长或跳过审阅绕过校验。此修复的 Mac 与模拟测试不代表已完成 Windows 实机验收。

`check-params`、`plan` 和 `prepare` 的参数 JSON 是操作名后的第一个位置参数，`--inputs` 指向素材目录：例如 `plan <params.json> --inputs <input-folder>`，其它选项见 `guide.json`。计划目录不能直接作为成片工程；先审阅计划、执行 prepare，再执行 `preview <prepared-project>`。`preview --plan PLAN` 不会替你批准或准备工程。
