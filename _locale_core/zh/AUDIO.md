# Audio preservation / 原声保留

Preserve the complete supplied narration. Source video and audio share the container origin, including leading silence, variable frame timestamps and internal gaps. Never reset the audio alone, stretch speech, infer silence from a low volume threshold, or cast normalized float samples directly to int16. The normal adapter checks decoded samples before planning, extracts with FFmpeg, and compares final encoded audio against the actual pre-encode mix. Digital silence is a binding error; scene effects do not prove narration survived. Extremely quiet audio needs listening, not automatic rejection.

优先保留用户完整口播视频原声。视频与音频共用源容器起点，保留开头与中间间隙；不要单独移动音轨、变速口播，或把归一化浮点直接转为整数。全零音频必须重新从原文件抽取，不能以“存在音轨、有时长、有音效”冒充人声正常。声音很小应试听，不能按阈值当静音丢弃。

626: bind media.voice.mode=presenter for embedded presenter audio, or file for an explicit separate track. An explicit none requires discardPresenterAudio=true if a presenter video has sound; set this only for an actual user-requested mute. Other component timelines preserve embedded presenter audio when voiceover is empty; a separate voiceover takes priority. presenter.audio=mute is an explicit user-requested mute. Native talking-video inputs preserve original narration. Explicit partial narrationRange is for a user-approved excerpt, never a workaround for short scene capacity.

For background music, inspect the verified personal package and its current official API capabilities. Use its official music-recommend/music-prepare path for authorized existing music when available. A source-stage apiEnabled=false declaration is historical, not a denial of a personal package's current capabilities. Check music.search, music.match and music.generate separately; do not invent support, keys or credentials. Keep license receipts and cover the full film. Ask only when materials or authorization are actually missing. Paid generation needs the user's authorization.

配乐按当前已验签个人包的官网能力查询；不要由旧作者源码的 apiEnabled=false 判定无配乐。检索、匹配与生成分别检查，已有授权曲使用随包官方准备流程并保留许可记录。不得伪造 Key、能力或授权，不擅自调用付费生成。

Before delivery, listen to the first sentence, a middle passage, the last sentence, and the final encoded mix. Verify speech remains intelligible against music and effects. Record technical audio validation and actual listening separately; neither sample metrics nor a transcript proves intelligibility or meaning.
