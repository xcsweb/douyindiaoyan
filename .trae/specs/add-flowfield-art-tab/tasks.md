# Tasks

- [x] Task 1: 接入第 5 个 tab 与星流骨架
  - [x] SubTask 1.1: 在 `#modes` 中「地球」与「1024」之间新增 `<button data-mode="flow">星流</button>`，并在 `MODE_NAME` 增加 `flow: '星流'`
  - [x] SubTask 1.2: 在 `apply()` 增加 `flow` 分支，调用 `layoutFlow()`，输出与现有布局一致的 `{W,H,sz,showNames:false,apexY}` 结构
  - [x] SubTask 1.3: 在 `setMode()` 的进入/离开路径中启动与停止流场帧循环，离开时清空轨迹画布
  - [x] SubTask 1.4: 新增星流准圆头像样式与控制条（文字输入、上传图片、预设画廊、回到星流），仅在 `body[data-mode="flow"]` 下显示
  - [x] SubTask 1.5: 舞台内新增 `#flow` 轨迹画布层（位于头像层之下），设置绝对定位与 `pointer-events:none`

- [x] Task 2: 实现流场引擎
  - [x] SubTask 2.1: 内置轻量 2D 噪声函数（不引第三方库），由噪声梯度构造 curl 向量场，带缓慢时间演化
  - [x] SubTask 2.2: 为 600 位成员初始化位置/速度/尺寸/旋转，逐帧只写 `transform`，统一在单个 rAF 中批量更新
  - [x] SubTask 2.3: 在轨迹画布上以成员平均色绘制低透明度点/短线，形成点彩拖尾；画布按 0.5 倍分辨率渲染控制开销
  - [x] SubTask 2.4: 鼠标/触摸产生涡旋或排斥力，离开后自然衰减恢复
  - [x] SubTask 2.5: 页面隐藏、切出 tab、`prefers-reduced-motion` 三种情况下停止或跳过动画；`REDUCED` 时只绘制一帧静态构图
  - [x] SubTask 2.6: 性能自测：1440×900 下连续运行 10s，统计平均帧率，目标 ≥50fps，低于 40fps 时降低拖尾分辨率或点数

- [x] Task 3: 文字收束
  - [x] SubTask 3.1: 复用 `textSlots(text, W, H, people.length)` 生成文字槽位，限制输入 1–12 字符，默认「1024」
  - [x] SubTask 3.2: 为成员分配槽位并用缓动飞入；未分配槽位的成员淡出，避免遮挡
  - [x] SubTask 3.3: 停留阶段保留极轻微呼吸位移，输入改变时重新计算并二次收束
  - [x] SubTask 3.4: 「回到星流」按钮清空收束状态、恢复透明度与速度，继续自由流动

- [x] Task 4: 图片收束
  - [x] SubTask 4.1: 用 `input[type=file]` + `URL.createObjectURL` 读图，按 cover 裁切绘制到离屏 `canvas`，降采样为当前精度格网
  - [x] SubTask 4.2: 用成员主色调做最近色匹配（含复用惩罚），复用现有 `computeAvgColors()` 的缓存，不修改主角秀匹配逻辑
  - [x] SubTask 4.3: 600 位成员飞入对应格位，格内按 `cell` 尺寸裁切头像，收束完成后可导出
  - [x] SubTask 4.4: 处理非图片文件、解码失败、极小图片三种边界情况，给出提示且不中断当前画面
  - [x] SubTask 4.5: 收束后再次上传图片时，直接在两种图案间平滑过渡，不出现乱飞或残留

- [x] Task 5: 名画与吉祥物预设
  - [x] SubTask 5.1: 选定时使用公有领域作品（梵高《星月夜》《向日葵》、葛饰北斋《神奈川冲浪里》、修拉《大碗岛的星期天下午》、莫奈《睡莲》、蒙克《呐喊》、维米尔《戴珍珠耳环的少女》），逐张裁切降采样为目标色
  - [x] SubTask 5.2: 用一次性脚本把每张预设转成 150×144 的微型 PNG data URL（同时作为画廊缩略图），连同作者/年份/版权字段内嵌到 `index.html`，不保留运行时外链
  - [x] SubTask 5.3: 按 TRAE 官方 IP「TRAE 宝」形象（圆角方块电视头、无天线、两枚发光菱形眼、小身体）绘制正面预设，署名为「TRAE 社区《TRAE 宝》2025 · 官方素材」
  - [x] SubTask 5.4: 在星流控制条内实现横向滑动预设画廊：缩略图 + 名称，点击即收束；当前预设高亮，下方显示作者/年份/版权署名
  - [x] SubTask 5.5: 预设之间、预设与自由流动之间切换时复用同一套缓动收束逻辑，避免乱飞与残留
  - [x] SubTask 5.6: 校验断网打开单文件时所有预设正常显示，无网络请求
  - [x] SubTask 5.7: 精度分四档（20×19 / 25×24 / 35×34 / 50×48），格数超过 600 时用附加节点池让同一成员占多格

- [x] Task 6: 导出适配星流
  - [x] SubTask 6.1: 在 `exportPNG()` 增加 `mode === 'flow'` 分支：按当前 `p.x/p.y`、`p.rs`、旋转与透明度绘制，不再重新布局
  - [x] SubTask 6.2: 标题使用 `MODE_NAME[mode]`，导出文件名带「星流」；预设/图片收束时在画布角落绘制当前预设署名
  - [x] SubTask 6.3: 校验自由流动、文字收束、上传图、名画预设四种状态导出的 PNG 与屏幕一致

- [x] Task 7: 全链路验收与交付
  - [x] SubTask 7.1: 无头浏览器依次切换 5 个 tab、搜索、主角秀、导出，确认 0 控制台报错
  - [x] SubTask 7.2: 校验 1024 当天（模拟时间）首 tab 仍为「主角秀」、星流 tab 可正常进入
  - [x] SubTask 7.3: 运行 `node build-single.mjs` 重新打包，并用打包产物复测一次
  - [x] SubTask 7.4: 更新 `1024作品秀投稿文案.md`：形态由 4 种改为 5 种，补充星流与名画预设玩法说明、体积数字与版权说明

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 2
- Task 5 依赖 Task 4
- Task 6 依赖 Task 1
- Task 7 依赖 Task 3、Task 4、Task 5、Task 6
