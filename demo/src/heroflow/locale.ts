/**
 * The hero flow's words, per locale. `data.ts` holds the project (media,
 * cut points, entity ids and kinds) and its English text. A locale here
 * replaces only the text, so every cut uses the same real film, stills,
 * clips and reference images, and the clock is shared.
 *
 * The Japanese cut keeps the English reel's models. The Chinese cut swaps the agent's model for DeepSeek V3, which NodeTool
 * calls directly and which mainland users can reach. The still and clip
 * models stay Seedream 4 and Seedance Pro, because those made the film.
 * Product terms follow the app's zh-CN catalog (web/src/i18n/locales).
 */
import React from "react";

import {
  BEATS,
  BRIEF,
  CLIP_MODEL,
  ENTITIES,
  MODEL,
  SCORE,
  STILL_MODEL,
  TITLE,
  type Beat,
  type Entity,
  type EntityKind
} from "./data";

export type HeroLocale = "en" | "zh" | "ja";

type BeatText = Pick<Beat, "label" | "slug" | "line" | "framing" | "movement">;
type EntityText = Pick<Entity, "name" | "descriptor">;

export type HeroCopy = {
  brief: string;
  title: string;
  model: string;
  stillModel: string;
  clipModel: string;
  score: string;
  entities: Record<string, EntityText>;
  beats: BeatText[];
  /** CSS font stack for the whole stage. */
  font: string | null;
  ui: {
    agent: string;
    ask: string;
    steps: readonly string[];
    beatSheet: string;
    entities: string;
    storyboard: (title: string) => string;
    finalCut: (title: string) => string;
    kind: Record<EntityKind, string>;
    pill: Record<"queued" | "rendering" | "animating" | "clip" | "still", string>;
    shot: (n: number, label: string) => string;
    aspect: (seconds: number) => string;
    writingBeats: (i: number, n: number) => string;
    beatsWritten: (n: number) => string;
    renderingRefs: (i: number, n: number) => string;
    refsReady: (n: number) => string;
    renderingStills: (i: number, n: number) => string;
    animatingClips: (i: number, n: number) => string;
    clipsReady: (n: number) => string;
    assembling: string;
    assembled: (seconds: number) => string;
  };
};

const EN: HeroCopy = {
  brief: BRIEF,
  title: TITLE,
  model: MODEL,
  stillModel: STILL_MODEL,
  clipModel: CLIP_MODEL,
  score: SCORE,
  entities: Object.fromEntries(
    ENTITIES.map((e) => [e.id, { name: e.name, descriptor: e.descriptor }])
  ),
  beats: BEATS.map(({ label, slug, line, framing, movement }) => ({
    label,
    slug,
    line,
    framing,
    movement
  })),
  font: null,
  ui: {
    agent: "Agent",
    ask: "What are we making today?",
    steps: ["Prompt", "Beat sheet", "Entities", "Storyboard", "Timeline"],
    beatSheet: "Beat sheet",
    entities: "Entities",
    storyboard: (title) => `${title} — Storyboard`,
    finalCut: (title) => `${title} — Final cut`,
    kind: {
      character: "character",
      location: "location",
      prop: "prop",
      style: "style"
    },
    pill: {
      queued: "Queued",
      rendering: "Rendering",
      animating: "Animating",
      clip: "Clip",
      still: "Still"
    },
    shot: (n, label) => `Shot ${n} · ${label}`,
    aspect: (s) => `16:9 · ${s} s`,
    writingBeats: (i, n) => `Writing beats · ${i} of ${n}`,
    beatsWritten: (n) => `${n} beats written`,
    renderingRefs: (i, n) => `Rendering references · ${i} of ${n}`,
    refsReady: (n) => `${n} references ready`,
    renderingStills: (i, n) => `Rendering stills · ${i} of ${n}`,
    animatingClips: (i, n) => `Animating clips · ${i} of ${n}`,
    clipsReady: (n) => `${n} clips ready`,
    assembling: "Assembling cut",
    assembled: (s) => `Cut assembled · ${s.toFixed(1)} s`
  }
};

/**
 * Inter draws the Latin and the digits. The Chinese and Japanese glyphs come
 * from Noto Sans SC and Noto Sans JP, pinned as subsets under
 * demo/public/promo/ (see cjkFont.ts), with the common system faces behind.
 */
const ZH_FONT =
  "Inter, 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'WenQuanYi Zen Hei', sans-serif";

const ZH: HeroCopy = {
  brief:
    "做一支 15 秒的短片：小女孩拿手电筒照向床底，发现了一只比她还害怕的小怪兽。",
  title: "床底下",
  model: "DeepSeek V3",
  stillModel: STILL_MODEL,
  clipModel: CLIP_MODEL,
  score: "八音盒",
  entities: {
    mia: { name: "米娅", descriptor: "约 7 岁的女孩，黑色卷发，黄色星星睡衣" },
    monster: {
      name: "小怪兽",
      descriptor: "毛茸茸的紫色小怪兽，绿色大眼睛，短短的角"
    },
    teddy: { name: "泰迪熊", descriptor: "旧旧的蜂蜜色小熊，系着红领结" },
    flashlight: { name: "手电筒", descriptor: "黑色儿童手电筒，光束始终是暖黄色" },
    bedroom: {
      name: "米娅的房间",
      descriptor: "月光透过窗户，地毯上散着玩具，星星图案的床品"
    },
    style: { name: "月光 3D", descriptor: "风格化家庭动画，蓝色月光，柔和光影" }
  },
  beats: [
    {
      label: "开场",
      slug: "月光下的卧室",
      line: "{mia}在{bedroom}里坐起身，手里握着{flashlight}。",
      framing: "全景",
      movement: "固定镜头"
    },
    {
      label: "寻找",
      slug: "打开手电筒",
      line: "{mia}探身到床边，光束照进黑暗。",
      framing: "中景",
      movement: "缓慢推进"
    },
    {
      label: "揭晓",
      slug: "床底的眼睛",
      line: "光束里睁开了两只绿色的眼睛。",
      framing: "主观镜头",
      movement: "手持"
    },
    {
      label: "反转",
      slug: "害怕的小怪兽",
      line: "{monster}用爪子捂住脸，浑身发抖。",
      framing: "特写",
      movement: "固定镜头"
    },
    {
      label: "和好",
      slug: "泰迪熊",
      line: "{mia}递出{teddy}，{monster}伸手去接。",
      framing: "中景",
      movement: "固定镜头"
    }
  ],
  font: ZH_FONT,
  ui: {
    agent: "智能体",
    ask: "今天想做点什么？",
    steps: ["提示词", "节拍表", "实体", "故事板", "时间线"],
    beatSheet: "节拍表",
    entities: "实体",
    storyboard: (title) => `${title} — 故事板`,
    finalCut: (title) => `${title} — 成片`,
    kind: { character: "角色", location: "地点", prop: "道具", style: "风格" },
    pill: {
      queued: "排队中",
      rendering: "正在生成",
      animating: "生成视频",
      clip: "片段",
      still: "静帧"
    },
    shot: (n, label) => `镜头 ${n} · ${label}`,
    aspect: (s) => `16:9 · ${s} 秒`,
    writingBeats: (i, n) => `正在写节拍 · ${i}/${n}`,
    beatsWritten: (n) => `已写好 ${n} 个节拍`,
    renderingRefs: (i, n) => `正在生成参考图 · ${i}/${n}`,
    refsReady: (n) => `${n} 组参考图已就绪`,
    renderingStills: (i, n) => `正在生成静帧 · ${i}/${n}`,
    animatingClips: (i, n) => `正在生成片段 · ${i}/${n}`,
    clipsReady: (n) => `${n} 个片段已就绪`,
    assembling: "正在剪辑成片",
    assembled: (s) => `成片已完成 · ${s.toFixed(1)} 秒`
  }
};

const JA_FONT =
  "Inter, 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', 'Meiryo', sans-serif";

const JA: HeroCopy = {
  brief:
    "15秒の短編を作って：女の子が懐中電灯でベッドの下を照らすと、彼女よりも怖がっているモンスターがいた。",
  title: "ベッドの下",
  model: MODEL,
  stillModel: STILL_MODEL,
  clipModel: CLIP_MODEL,
  score: "オルゴール",
  entities: {
    mia: {
      name: "ミア",
      descriptor: "7歳くらいの女の子。黒い巻き毛、黄色い星柄のパジャマ"
    },
    monster: {
      name: "モンスター",
      descriptor: "小さくてふわふわの紫のモンスター。大きな緑の目、短い角"
    },
    teddy: { name: "テディ", descriptor: "使い込んだはちみつ色のクマ。赤い蝶ネクタイ" },
    flashlight: {
      name: "懐中電灯",
      descriptor: "子ども用の黒いライト。光はいつも温かい黄色"
    },
    bedroom: {
      name: "ミアの部屋",
      descriptor: "窓から月明かり、ラグの上におもちゃ、星柄の寝具"
    },
    style: {
      name: "月夜の3D",
      descriptor: "様式化したファミリーアニメ。青い月明かり、柔らかい陰影"
    }
  },
  beats: [
    {
      label: "導入",
      slug: "月明かりの寝室",
      line: "{mia}が{bedroom}で身を起こす。手には{flashlight}。",
      framing: "ワイド",
      movement: "固定"
    },
    {
      label: "探索",
      slug: "懐中電灯をつける",
      line: "{mia}がベッドの端から身を乗り出す。光が暗がりを照らす。",
      framing: "ミディアム",
      movement: "ゆっくりプッシュイン"
    },
    {
      label: "発見",
      slug: "ベッドの下の目",
      line: "光の中で、緑の目が二つ開く。",
      framing: "主観",
      movement: "手持ち"
    },
    {
      label: "反転",
      slug: "怖がるモンスター",
      line: "{monster}が前足で顔を隠して震える。",
      framing: "クローズアップ",
      movement: "固定"
    },
    {
      label: "友だち",
      slug: "テディ",
      line: "{mia}が{teddy}を差し出す。{monster}が手を伸ばす。",
      framing: "ミディアム",
      movement: "固定"
    }
  ],
  font: JA_FONT,
  ui: {
    agent: "エージェント",
    ask: "今日は何を作りますか？",
    steps: ["プロンプト", "ビートシート", "エンティティ", "絵コンテ", "タイムライン"],
    beatSheet: "ビートシート",
    entities: "エンティティ",
    storyboard: (title) => `${title} — 絵コンテ`,
    finalCut: (title) => `${title} — 完成版`,
    kind: {
      character: "キャラクター",
      location: "場所",
      prop: "プロップ",
      style: "スタイル"
    },
    pill: {
      queued: "待機中",
      rendering: "生成中",
      animating: "動画を生成中",
      clip: "クリップ",
      still: "静止画"
    },
    shot: (n, label) => `ショット ${n} · ${label}`,
    aspect: (s) => `16:9 · ${s}秒`,
    writingBeats: (i, n) => `ビートを執筆中 · ${i}/${n}`,
    beatsWritten: (n) => `${n}つのビートを執筆済み`,
    renderingRefs: (i, n) => `参照画像を生成中 · ${i}/${n}`,
    refsReady: (n) => `${n}件の参照画像が完成`,
    renderingStills: (i, n) => `静止画を生成中 · ${i}/${n}`,
    animatingClips: (i, n) => `クリップを生成中 · ${i}/${n}`,
    clipsReady: (n) => `${n}本のクリップが完成`,
    assembling: "編集を組み立て中",
    assembled: (s) => `編集完了 · ${s.toFixed(1)}秒`
  }
};

export const COPY: Record<HeroLocale, HeroCopy> = { en: EN, zh: ZH, ja: JA };

export const HeroLocaleContext = React.createContext<HeroLocale>("en");

export const useCopy = (): HeroCopy => COPY[React.useContext(HeroLocaleContext)];

/** The beats with this locale's text over the shared media. */
export const useBeats = (): Beat[] => {
  const copy = useCopy();
  return BEATS.map((b, i) => ({ ...b, ...copy.beats[i] }));
};

/** The entities with this locale's names and descriptors. */
export const useEntities = (): Entity[] => {
  const copy = useCopy();
  return ENTITIES.map((e) => ({ ...e, ...copy.entities[e.id] }));
};

/** Looks an entity up by id, in this locale. */
export const useEntityOf = (): ((id: string) => Entity) => {
  const entities = useEntities();
  return (id) => {
    const found = entities.find((e) => e.id === id);
    if (!found) {
      throw new Error(`Unknown entity ${id}`);
    }
    return found;
  };
};
