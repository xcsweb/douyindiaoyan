# 公共示例资产

本包 talk-demo.mp4 是无口播、无真人肖像的原创几何占位动画。input-thumbnail.png 和 output-thumbnail.png 是原创流程图，不是软件录屏或真实成果证明。noise.png 为固定种子原创纹理。demo-subs.json 是展示文字，不是语音识别结果。music-demo.wav 是显式选择的原创器乐，38.9 秒样例结尾前完成衰减，并预留混响尾。

所有生成媒体按 LICENSE-ASSETS-CC0.txt 授予 CC0 1.0；生成器单独采用 MIT，见 LICENSE-GENERATOR-MIT.txt。可用 generate_demo_assets.py 重建到新的输出位置，其同名媒体拒绝覆盖，默认直接使用随包 Noto Sans SC 字体和已安装依赖；不下载图片或声音。

fonts/ 内三份字体保留原字节、OFL 许可证与来源记录。Geist/Geist Mono 按 native manifest 的八个字体 ID 精确绑定，Noto Sans SC 绑定新工程的中文、字幕及中文角标；不需系统字体。文件摘要由资产清单与包完整性清单保存。

0.1.1 新增完整 Noto Sans SC 可变字体，源为 Google Fonts 官方仓库的固定修订。未经修改的字体、完整 OFL 文本与摘要分别保存在 fonts/、../licenses/NotoSansSC-OFL.txt、noto-font-provenance.json。中文和字幕改用该字体，不再读取 Apple 字体。

可选媒体重建：使用本机依赖解释器运行 `generate_demo_assets.py --out 新目录`。输出必须在冻结包之外，拒绝覆盖已有目录。原包预览和媒体保持原字节；更换字体生成的新图片不承诺与旧图片同字节。

`music-default.m4a` is a new 180-second original CC0 oscillator instrumental, 36 arranged harmonic cells with melodic variations; no sample imports or runtime looping. Omitted music chooses it; explicit empty music remains silent. Source and SHA are in generate_default_music.py / music-default-provenance.json. Encoding is stereo AAC 64kbps at 24kHz to keep the package portable and small.
