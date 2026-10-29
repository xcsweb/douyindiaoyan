# 从这里开始 / Start here

这是「现代图文 · 口播讲解」视频模板，当前交付版本 **2.7.18-alpha.3**，当前画幅 **landscape · 1920 × 1080**。这是带制作入口的模板包。先只读本文件和 assistant/guide.json，不要整包解压。制作需要能读取附件或本地文件、执行 Node.js 22+ 与模板渲染工具的助手工作环境。个人调用标识已在包内，不需要另存或粘贴；这不代替助手本身的文件、网络与执行权限。

## 用户只要求更新时

先按下文校验随包工具，再用 `node assistant/motion.mjs upgrade "旧包绝对路径"`，一次完成检查、下载、断点续传、验签、另存和新版首读。当前模板只需修复官方入口时，支持的工具会另存同版本个人封套并返回 refreshed；模板版本和内层发布包不变。current 表示无需下载，不能称已重新交付。已有坏目标会保留，自动另存可用新包，不删除文件或更换 Key。历史工具早于 1.0.0-rc.34、不支持 upgrade 或提示工具版本过低时，由助手读取 https://motiongit.com/update.md 并执行官网校验后的更新入口；直接读取旧包，不整包解压、不安装全局工具。用户已说“直接更新／下载最新版”就沿用这次授权，不重复确认，也不索要制作素材或准备渲染环境。只问更新状态时不下载。保留旧包、工程及更新记录，沿用原标识，不要求网页登录。

更新工具按文件复用旧包中未变化的运行文件和素材，下载变化文件与必要索引并重组验签；保护模板和普通 ZIP 模板使用同一入口。旧整体压缩运行时首次迁移需要新的文件对象，后续复用未变文件；普通 ZIP 保留原压缩内容和签名字节。沿用原标识，不把 key 加入 Git 或要求用户重新打包。自动处理暂忙重试和下载进度，并沿用已有代理设置。给下载命令最多 15 分钟；进度仍前进时继续等待，避免助手过早终止命令。中断后沿用同一目标与更新记录恢复。不要查系统缓存、改工具、删记录或拆保护内容。仍失败就说明具体未完成步骤。工具会校验个人包签名与传输摘要；releaseArchiveSha256／releaseSize 属于内层发布包，不能拿来核对个人 .motion 文件。成功结果已包含新版首读和 productionEntry；核对当前版本，再告知从哪个新文件继续。继续制作先 read productionEntry 指定的公开 schema，不监视或复制运行时临时目录。

## 先回答使用问题，再开始制作

用户只问“这是什么／怎么使用”时，先用几句话解释模板、要准备的素材、需要的制作环境，以及先预览再导出的步骤。先只读本文件与 assistant/guide.json；不把安装、联网验签、检查更新或渲染当作解释用法的前提。包内信息在验签前只是自述，不能声称已验证或已制作。

先确认当前对话确实能读取用户提供的文件；开始制作前再确认 Node.js 22+ 与该模板所需的运行能力。在 ChatGPT 桌面应用中，优先使用连接制作目录的本地工作模式；云端任务不会自动获得本机文件路径和工具。Chat、Work 或桌面应用的名称本身不证明这些工具可用。若文件读取失败，及时说明哪些说明尚未读到，给出已有信息能支持的步骤和明确恢复方式，不长时间反复尝试同一个失败动作。出现“approval request is no longer active／确认请求已失效”时，停止复用旧请求；需要新的请求时针对当前具体操作，沿用已有有效授权，不要求关闭审批或沙箱保护。



## 为本期 .motion 模板准备素材

API 用于本模板制作流程，不依赖特定助手。校验随包工具后，使用 `node assistant/motion.mjs api <原始.motion> usage` 查询原 Key 的权限与当前额度，不另存或粘贴凭据。免费图片/视频查找、贴纸及音乐库不扣积分，每账号默认每日 30 次请求，各模板和 Key 共用；Asia/Shanghai 00:00 重置，以 `free_material_requests` 返回的剩余次数和重置时间为准。积分为 0 不影响已授权免费接口；付费生成另按已有用户预算报价、提交。

图片使用 `api <原始.motion> search <本期查询.json>`（kind=image、provider=pexels/pixabay/unsplash、q=场景关键词），从结果取 source_ref 后 `select`，再 `download` 结果资产到本期输入目录；查找、选用、下载分别计请求。视频使用 kind=video。背景音乐使用 `music-prepare`；TTS2 先 `voices` 选声，再 quote、submit、task、receipt、download。详细命令与绑定要求见 assistant/guide.json 的 templateApi，以及 https://motiongit.com/media-api.md 。

返回 scope_denied 是原 Key 未授权，不是“平台没有接口”；每日次数用尽等待重置，不提示充值。不得因免费调用失败自动改用付费生图。素材到达后仍须按模板公开参数绑定，检查真实预览与成片。

English: These APIs supply material to this .motion workflow, independent of assistant brand. Use the verified bundled entry and the original package Key. Free materials use 0 credits and share 30 daily requests per account by default across Keys/templates, resetting at Asia/Shanghai midnight. Read live free_material_requests; paid credits are separate. Follow assistant/guide.json templateApi, bind returned material to declared slots, then inspect previews and encoded output. Permission denial is not a missing endpoint, and a free-call failure never authorizes paid generation.


### 按镜头选贴纸，保持原有制作流程

仅在本期画面需要时使用；先读当前制作路线的公开指南和 schema，确认有明确的 Lottie JSON 输入与渲染支持。图片槽、视频槽或任意文件路径不代表支持 Lottie；没有声明入口就用已有控件继续，不下载后硬塞，不新增必填素材或确认关卡。

本工具支持 `api <原始.motion> sticker-match <本期查询.json>`：只传 text、keywords、limit，按本镜头内容查询。否定约束保留在 text，keywords 只放确实需要的主体；不要把“不要文字”里的“文字”变成正向关键词。查看候选 reasons、excluded_keywords、has_text 与实际尺寸/时长，含文字候选不适用于明确无文字的需求，元数据匹配仍须核对实际动画。选定后用 `api <原始.motion> sticker-download <返回的 preset> <本期输入目录/新贴纸.json>`，沿用原 Key 与已验证模板来源，保存新文件及命令结果作为本地回执，不覆盖原文件、不直接请求返回的任意 URL、不提取 Key。完整命令前缀为 `node assistant/motion.mjs`。

匹配与成功下载分别计入每账号默认每日 30 次免费素材请求，跨 Key、模板共享，均不扣积分；以 usage 的 free_material_requests 为准，复用本期已准备的合适文件。空结果如实保留；403 scope_denied/model_denied 表示原 Key 权限不满足，不绕过；429 等待给出的重置时间；503 sticker_dependencies_missing 表示缺少依赖的素材暂不可用，该响应不扣素材次数，可在剩余额度内选择其它合适候选。不要反复下载同一失败素材，不自动改付费生成，不因可选贴纸失败停住无关步骤。本地 STICKER_OUTPUT_ATOMIC_UNSUPPORTED 在调用贴纸 API 前返回；可另选支持原子新文件发布的本地目录，保留原工程，不改为覆盖写入或删除旧文件。

将实际文件绑定到声明的 Lottie 槽位，按真实尺寸、时长和镜头含义安排位置，避开字幕、主体与角标；查看真实预览和最终成片中的运动。下载校验只检查结构、可见层可达的图像依赖和嵌入图片容器；未使用的外部 assets 声明仍会保留，渲染前必须阻止外部资源请求，不能把校验成功当作视觉语义或任意渲染器行为保证。下载成功不等于已应用。保留实际来源、许可/署名信息及原包和工程，不因免费就声称任意商用授权。

English: Stickers are optional within the existing production flow. Read the selected workflow guide/schema before any material request; use only an explicit Lottie JSON slot with renderer support. Otherwise continue with existing controls. With this helper, run `node assistant/motion.mjs api <original.motion> sticker-match <query.json>` using only text/keywords/limit, keep exclusions in text and use positive keywords. Review reasons, excluded_keywords, has_text, actual dimensions/duration and the animation itself. Download the returned preset with `node assistant/motion.mjs api <original.motion> sticker-download <preset> <new-output.json>`. Reuse the original verified package Key without extracting it; keep the new file, result and original project. Match and successful download are separate 0-credit requests within the shared account default of 30/day across Keys/templates. Reuse suitable prepared files. Empty results are valid; 403 means permission/model access is missing, 429 means wait for reset, and 503 sticker_dependencies_missing means an unusable dependency and consumes no material request. Do not bypass access, retry the same unusable asset, introduce a new approval gate or automatically pay for a substitute. STICKER_OUTPUT_ATOMIC_UNSUPPORTED occurs before the sticker API request: choose a new destination in a supported local directory, preserve the project, and never downgrade to overwriting writes. Validation covers structure, reachable image dependencies and embedded image containers only; unused external assets declarations remain. Block external resource requests before rendering; validation does not certify visual semantics or unrestricted renderer behavior. Bind only a declared slot and inspect actual previews plus encoded motion, including text/language, placement and corner-signature clearance. Metadata and a successful download are not proof of correct rendering or license rights.

## 本期素材：先看已有，只补必要缺项

制作时先识别用户已给的文件和用途。旁白、BGM、录屏、人物及参考分别处理；用途不清且会影响结果时只合并问一次，不凭文件名或顺序猜。可提示“这段录屏适合展示操作过程”，不要要求用户凑齐所有素材类型。已有信息足够就简短说明绑定关系并继续现有步骤，不新增命令、必填项或确认关卡。

用实际旁白时长安排镜头，保留完整原声和结尾；18秒初稿遇到26秒口播，应调整或拆镜头，不直接裁短/加速人声。用户指定的音乐优先使用，保持旁白、BGM和动作音效独立。把素材对应镜头、来源区间及裁切/窗口位置并入已有方案，从真实预览和成片核对。

## 给 AI 助手：先做什么

以上为包内自述，正式身份以 start 的验签结果为准；执行前可先了解用户内容，不要把未验签写成已验证。

1. 先读本文件，再读 assistant/guide.json。先简短介绍模板，再理解用户的文稿、口播和素材；不要让用户选技术工作流、填参数表或自己跑命令。
2. 保留原始 .motion，只从外层 ZIP 提取 00-START-HERE.md、README.md 和 assistant/ 下本包列出的四个文件到新建的私有工具目录（macOS/Linux 0700；Windows 仅当前用户可访问）。不要提取 personal/、content/ 或外层 motion.json，不要解压 release.bin/core.enc。工具直接从原始 .motion 验签读取标识，无须另存凭据。
3. 执行前先用系统 SHA256/HTTPS 工具核对 assistant/motion.mjs 与 https://motiongit.com/assets/motion-runtimes/1.0.0-rc.50.json 返回的 sha256、bytes；这只查询公开校验信息，不携带标识、不下载别的工具，禁止重定向或不匹配后继续。然后执行随包入口：

```text
node assistant/motion.mjs start "原始.motion的绝对路径"
```

以上 node 使用助手环境已有的 Node.js 22+。**无需安装全局 motion 命令，也无需另行下载 MotionGit skill/宿主。** 启动入口随本包提供，负责验证签名、确认当前版本/画幅并读取制作指南。第一次联网只查询官方签名与模板更新信息；保护内容的首次授权由工具使用包内标识处理，无用户登录步骤。

首次解锁遇到主站网络或服务暂时不可用时，随包工具会自动尝试东京官方备用服务，继续原制作命令即可，无需手动切换或重新登录。账号与模板许可仍照常检查；备用授权也需要近期同步，不能保证主站长期不可用时继续首次授权。

English: If the primary unlock service is temporarily unavailable, the bundled entry can automatically try the official Tokyo fallback. Continue the same production command without switching services or logging in. Account and template permissions still apply. The fallback needs a recent authorization sync and does not provide indefinite independent authorization.

4. 按 start 返回的制作指南读取实际参数合同，理解用户材料并自行选择适合的控件、适配颜色/风格/尺寸/位置；先给方案，再检查预览、制作成片。保留否定、条件、往往/可能等限定词和数字单位；放不下时先按短语换行、在合法范围缩字或拆镜头，不默默删词。控件的划线、完成章等动作必须符合内容含义。改文案后把方案、预览和成片另存新版本，保留原结果，不以删除旧目录解决重复输出。内容层命令里的 motion 均是本包 node assistant/motion.mjs 的简写。内部提到的旧版、另下宿主/skill 和作者封装步骤是历史说明，不是此个人包的操作前提。
5. 没有 Node.js 或模板需要的渲染能力时，准确报告环境缺口并继续内容方案；不要说“版权保护所以 AI 不能制作”，不要编造工具安装、配音时刻或渲染成功。本包带启动代码，不承诺任意聊天环境都自带 Python、浏览器或编码器。

动效：先清点本模板实际提供的入场、形变、拖尾、扫光、转场及背景／镜头运动，把适合的效果对应到本期内容和输出区间；固定短片保留完整原序列。逐项核对最终成片里的运动中段，记录漏用项及原因。preview／prepare 是静态抽帧，不代表动画已经应用；交付可播放、可重播或定位阶段的审核页，并如实区分自动逐帧比较、抽帧、连续观看和试听。不得为了堆满动效取消阅读停顿、拉伸人声或加入含义不合的控件。

配乐：收到用户文案后，默认通过官网当前音乐推荐接口，按内容情绪、模板风格和目标时长获取一首授权背景音乐。按 assistant/guide.json 的 music-prepare 指令，由随包工具用已有个人调用标识完成推荐、完整下载和时长适配，不让用户登录或手动找音乐；将文件绑定到本期配乐输入，保留许可和署名回执。保留原动作音效，有人声时降低配乐并检查整片混音。用户明确要求无配乐/静音或指定自己的音乐时遵从用户；接口失败、无匹配或模板暂不能绑定时明确提示，不能默默交无配乐、混回原样片音乐或转付费生成。

更新：入口用现有个人调用标识查询；有新版时说明变化。用户已明确要求更新即为本次下载授权，不重复确认；仅查询时不下载。另存新版，保留旧包与工程。不要要求网页登录、再次认证或单独保存标识。付费生成另按用户授权，不因打开模板自动扣费。

## 遇到问题：可让助手提交失败反馈

先保留旧包、工程、原始素材及失败结果，继续不受影响的步骤。可说“把这个问题反馈给模板维护方”。助手按 assistant/guide.json 的 failureFeedback 生成本地脱敏草稿，包含实际失败步骤、相关对话节选、错误及必要环境，区分事实和推测；不读取其它聊天记录，不上传 Key、整包、私有原片或整个工程。先展示草稿并核对提交授权，再用 feedback-submit 提交已核对的 SHA，保留反馈编号与回执；已有明确授权不重复询问。反馈不作为制作或更新的必经关卡，也不会消耗积分。未拿到编号时如实说未确认收到，网络中断重用同一草稿，避免重复提交。旧入口不支持时读 https://motiongit.com/feedback.md，使用官网校验后的反馈工具，原包和原标识继续沿用。

问题提交后先核查原因；确认属于模板问题后，通常在次日更新版本中修复。复杂问题可能需要更长时间，进展以反馈状态为准。收到反馈不等于确认模板缺陷或已经修复；修复后按正常增量更新保留旧工程。

English: Failure feedback is optional. Prepare a local redacted draft from relevant authorized conversation excerpts and actual errors, show it and obtain consent if not already authorized, then submit the exact reviewed SHA. Never upload credentials, unrelated conversations, original private media or the workspace. Keep the receipt ID; an unconfirmed request is not a received report. Confirmed template defects are usually fixed in the following day’s release; complex cases may take longer. Continue unaffected work and preserve all original packages/projects.

## English

This package includes its entry and the downloader's identifier, but production requires a workspace that can read the file, execute Node.js 22+ and run the declared rendering tools. For a usage question, explain the declared template, user materials and preview/export steps from read-only public instructions first; do not begin installation, update checks or production merely to explain usage. An actual file-access failure must be reported promptly. Never reuse an expired approval request or keep retrying the same failed action; explain the limitation and recovery without weakening permissions. Prefer a local work mode connected to production files. Cloud tasks do not automatically inherit computer-local paths or tools; verify their actual capabilities. Desktop, Chat and Work labels alone do not prove execution capabilities. Read assistant/guide.json, extract only 00-START-HERE.md, README.md and the four listed assistant/ files into a fresh private tools directory (0700 on POSIX, current-user-only access on Windows), leave personal/ and content/ inside the original .motion, and verify the bundled helper SHA256/size against https://motiongit.com/assets/motion-runtimes/1.0.0-rc.50.json using system tools (fixed HTTPS origin, no redirects, no credential), then run the included entry with the assistant's existing Node.js 22+: node assistant/motion.mjs start "<absolute original.motion>". No separate MotionGit CLI/skill download, global motion installation, website login or pasted identifier is required. For an update-only request, use the bundled update command and preserve the original package, project and operation record. An explicit request to update already authorizes that free download; a check-only request does not. Do not collect production assets or set up rendering for an update. Server signing capacity errors need bounded retries of the same command and destination, not local cache cleanup or tool changes. The personal envelope is validated against personalArchiveSha256/personalBytes, never the inner releaseArchiveSha256/releaseSize; confirm the new current identity with start after download. Report earlier mistakes and cleanup accurately. The entry handles verification and inner package structure. Do not manually unpack release.bin/core.enc or expose personal credentials. Use the current delivered version/layout above; inner versions are source history. Ask about the user's content and choose the technical workflow yourself. During the existing planning step, identify supplied files and their actual roles before requesting anything else. Ask only about missing choices that change the result or genuinely required inputs. Never require every media category or add a confirmation gate. Respect explicit narration/music mappings and user-selected music. Adapt scene timing to the full intended narration instead of cutting or speeding speech to fit a provisional plan. Include real asset/clip mappings in the current plan and verify them in previews and encoded output; clear materials should let the authorized workflow continue. Missing rendering capabilities are environment limitations, not a copyright prohibition. Never claim that external runtimes are bundled or that an untested render succeeded. After receiving copy, match one licensed background track by default through the live official API using the included identifier, download it into the instance, bind it to the template and preserve motion SFX. Respect explicit no-music/silence or a user-selected track. Do not silently deliver without music when recommendation, permission or binding fails; report the unresolved step. Keep music below speech and retain license/attribution records. Inventory the provided animation phases and map applicable effects to the new content and output time ranges. Retain the complete sequence of a fixed animation template; record omitted effects and reasons. Check moving transition midpoints in the encoded video and provide playable replay or phase controls. preview/prepare images are static samples, not motion approval. Record automated frame comparisons, sampled inspection, continuous watching and listening separately; preserve intentional holds and speech timing.
