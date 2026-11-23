/**
 * Simplified Chinese titles and one-line descriptions for the generated
 * catalogs the translated pages list: example storyboards, ad library
 * concepts, recipes and the model hub. Each line translates the English
 * catalog entry. A slug with no entry here falls back to the English text,
 * and `tests/e2e/zh-pages.spec.ts` fails until it is added.
 */
import type { StoryboardCategory } from "@/data/storyboards";
import type { Modality } from "@/data/modelEntries";

type Line = { title: string; body: string };

export const ZH_STORYBOARD_CATEGORIES: Record<StoryboardCategory, Line> = {
  commercial: { title: "广告", body: "产品短片和社交媒体短广告，逐个镜头呈现。" },
  film: { title: "电影", body: "有动作、对白和氛围的场景。" },
  animation: { title: "动画", body: "黏土、水墨和发条的世界。" },
  nature: { title: "自然", body: "纪录片风格的野生动物和风景。" },
};

export const ZH_STORYBOARDS: Record<string, Line> = {
  "bowl-time": { title: "开饭时间", body: "狗听到狗粮落进碗里的声音，全家都知道了。" },
  "clay-monday": { title: "黏土星期一", body: "一个黏土动画角色挣扎着起床，给自己煮咖啡。" },
  "clockwork-heart": { title: "发条之心", body: "微距镜头深入一颗黄铜机械心脏，看它开始跳动。" },
  "cold-brew-pour": { title: "冷萃倾倒", body: "一支冰冷萃咖啡广告，围绕一次缓慢的倾倒和第一口冰凉。" },
  "dawn-run": { title: "黎明奔跑", body: "日出时分，跑者一步不停地穿过安静的城市大桥。" },
  "dew-drop-serum": { title: "露珠精华", body: "一支护肤广告，跟随一滴精华落到皮肤上。" },
  "diver-and-the-whale": { title: "潜水员与鲸", body: "自由潜水员悬停在开阔的蓝色海水中，一头座头鲸近得伸手可及。" },
  "duel-in-the-wheat": { title: "麦田决斗", body: "两名剑客在风中的麦田对峙。一击定胜负。" },
  "dust-ballet": { title: "尘埃芭蕾", body: "舞者在废弃剧院里独舞，光线从屋顶的破洞照进来。" },
  "fox-in-snow": { title: "雪中狐狸", body: "一只红狐听到雪下的老鼠，一头扎进雪里。" },
  "ink-dragon": { title: "水墨龙", body: "一滴黑墨在水中晕开，化作一条水墨龙。" },
  "mars-greenhouse": { title: "火星温室", body: "宇航员在火星温室里发现第一颗成熟的番茄。" },
  "morning-syrup": { title: "清晨糖浆", body: "一支松饼广告，围绕一次完美的枫糖浆倾倒。" },
  "mountain-pass-drift": { title: "山口漂移", body: "夜里一辆车在发夹弯漂移，车灯划破浓雾。" },
  "movement-in-gold": { title: "金色机芯", body: "把一块奢华腕表拍成一台活的机械，从齿轮到手腕。" },
  "noise-off": { title: "静音", body: "戴上耳机的一刻，高峰时段的列车安静下来。" },
  "puddle-strike": { title: "踏水", body: "一支球鞋广告，一步踩过城市水洼，溅起一圈水冠。" },
  "rooftop-run": { title: "屋顶奔跑", body: "黄金时刻，跑酷者跃过三座屋顶。" },
  "silent-arrival": { title: "无声抵达", body: "黎明时分，一辆电动车几乎无声地穿过沙漠。" },
  "silk-and-glass": { title: "丝与玻璃", body: "一支香水广告，围绕飘落的丝绸和玻璃上的水珠。" },
  "suite-morning": { title: "套房清晨", body: "酒店套房在海景中醒来，从窗帘到阳台上的咖啡。" },
  "summit-reveal": { title: "登顶", body: "登山者攀上峰顶，脚下的云层散开。" },
  "the-interrogation": { title: "审讯", body: "两个人，一张桌子，两句对白揭穿一个谎言。" },
  "the-long-hallway": { title: "长廊", body: "夜班护士在医院走廊尽头看到了什么。" },
  "under-the-bed": { title: "床底下", body: "孩子用手电筒照向床底，发现一只比她还害怕的怪物。" },
};

export const ZH_AD_LIBRARY: Record<string, Line> = {
  "kinetic-offer-wall": { title: "动态优惠墙", body: "在展示产品系列的同时，让一个真实的优惠清晰可读。" },
  "product-cutout-shuffle": { title: "产品抠图轮换", body: "把静态产品目录变成一支 SKU 或口味的短广告。" },
  "one-hub-three-product-benefits": { title: "一个中心，三个产品卖点", body: "讲清一个 SaaS 或服务套餐，而不展示看不清的完整仪表盘。" },
  "benefit-led-dashboard-punch-in": { title: "以卖点为先的仪表盘推近", body: "把一个产品操作及其结果讲具体。" },
  "fast-footage-plus-kinetic-captions": { title: "快剪素材加动态字幕", body: "把现有素材重新包装成一支清晰的竖版广告。" },
  "editorial-image-panels": { title: "杂志风图片分格", body: "用少量素材做一支无需声音的高级感广告。" },
  "binary-choice-participation-card": { title: "二选一互动卡", body: "邀请观众做一个清晰的 A/B 选择，而不假装 MP4 可以交互。" },
  "desktop-chaos-to-one-clean-result": { title: "从桌面混乱到一个干净结果", body: "把一个工作流痛点和它的解决画出来。" },
  "headline-plus-inset-motion-module": { title: "标题加内嵌动态模块", body: "把大量动态素材整理成风格一致的竖版广告系列。" },
  "integration-puzzle-that-snaps-together": { title: "严丝合缝的集成拼图", body: "把互联的产品或集成表现为一次令人满足的拼合。" },
  "hero-artwork-becomes-a-type-stage": { title: "主视觉变成文字舞台", body: "在拉新和品牌版本之间复用同一套视觉。" },
  "fixed-glyph-changing-world": { title: "固定符号，变化的世界", body: "用一个固定的视觉锚点，做出让人记住的产品承诺。" },
  "calm-breathing-shape-loop": { title: "平静的呼吸形状循环", body: "做一支刻意平静的产品演示或健康类广告。" },
  "macro-feature-proof": { title: "微距功能证明", body: "展示一个具体的硬件或产品细节，再说明它为什么重要。" },
  "result-seen-through-the-product": { title: "透过产品看到的结果", body: "把出色的成果直接和创造它的产品联系起来。" },
  "a-capability-journey-on-connected-paths": { title: "连接路径上的能力序列", body: "用一张紧凑的图讲清一个上手流程或服务旅程。" },
};

export const ZH_RECIPES: Record<string, Line> = {
  "directed-campaign-kit": { title: "导演式营销套件", body: "一张干净的杯子参考图，变成一个动感的发布视觉世界、两种社交媒体尺寸和一次有边界的修改。" },
  "ugc-product-video": { title: "UGC 产品视频", body: "一次有自知之明的购物变成小小的安慰，同一个杯子陪伴混乱的一天。" },
  "viral-video-ad-engine": { title: "产品广告片", body: "新鲜咖啡倒入杯中，她享受片刻安静，然后带着杯子出门。三个镜头跟随一个清晨仪式。" },
  "multilingual-video-dubber": { title: "多语言视频", body: "英文主持人重新配音为西班牙语。编辑译文，逐句修改配音。" },
  "ecommerce-sku-visual-factory": { title: "产品目录素材", body: "把一张产品照片变成抠图、棚拍图和季节场景。" },
  "storyboard-to-trailer": { title: "从故事板到预告片", body: "The Next Tide：一个六镜头故事板，角色、场景和道具共享。" },
  "impossible-product-worlds": { title: "不可能的产品世界", body: "沙漠上空的飞行揭开一只巨大杯子里的泳池。她跳进去，然后以正常比例喝着同一款产品。" },
};

export const ZH_MODALITY: Record<Modality, string> = {
  "text-to-video": "文生视频",
  "image-to-video": "图生视频",
  "text-to-image": "文生图",
  "image-to-image": "图生图",
};

/** Vendor names a Chinese reader knows by their Chinese name. */
export const ZH_VENDOR: Record<string, string> = {
  Kuaishou: "快手",
  ByteDance: "字节跳动",
  "ByteDance Seed": "字节跳动 Seed",
  MiniMax: "MiniMax",
  Alibaba: "阿里巴巴",
  "Alibaba Qwen": "阿里巴巴通义千问",
  "Tongyi-MAI": "通义实验室",
  Tencent: "腾讯",
  Baidu: "百度",
  "HiDream.ai": "智象未来 HiDream.ai",
};
