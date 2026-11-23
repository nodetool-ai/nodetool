/**
 * Japanese titles and one-line descriptions for the generated catalogs the
 * translated pages list: example storyboards, ad library concepts, recipes and
 * the model hub. Each line translates the English catalog entry: a storyboard's
 * title and description, an ad concept's title and objective, a recipe's name
 * and outcome. A slug with no entry here falls back to the English text.
 */
import type { StoryboardCategory } from "@/data/storyboards";
import type { Modality } from "@/data/modelEntries";

type Line = { title: string; body: string };

export const JA_STORYBOARD_CATEGORIES: Record<StoryboardCategory, Line> = {
  commercial: { title: "広告", body: "ショットごとに見せる、商品の短編映像とソーシャル向けの短い広告。" },
  film: { title: "映画", body: "アクション、セリフ、雰囲気のあるシーン。" },
  animation: { title: "アニメーション", body: "粘土、墨、ぜんまい仕掛けの世界。" },
  nature: { title: "自然", body: "ドキュメンタリー調の野生動物と風景。" },
};

export const JA_STORYBOARDS: Record<string, Line> = {
  "bowl-time": { title: "ごはんの時間", body: "フードが器に落ちる音を聞いた犬。家じゅうがそれに気づきます。" },
  "clay-monday": { title: "クレイな月曜日", body: "粘土アニメのキャラクターが、ベッドから這い出してコーヒーを淹れます。" },
  "clockwork-heart": { title: "ぜんまいの心臓", body: "真鍮の機械仕掛けの心臓が鼓動し始めるまでを、マクロで追います。" },
  "cold-brew-pour": { title: "コールドブリューを注ぐ", body: "ゆっくり注ぐ一杯と、最初のひと口の冷たさで見せるアイスコールドブリューの広告。" },
  "dawn-run": { title: "夜明けのラン", body: "日の出の静かな街の橋を、ランナーが止まらず駆け抜けます。" },
  "dew-drop-serum": { title: "露のしずく美容液", body: "一滴の美容液が肌に落ちるまでを追うスキンケア広告。" },
  "diver-and-the-whale": { title: "ダイバーとクジラ", body: "フリーダイバーが青い海に浮かび、ザトウクジラが手の届く距離まで近づきます。" },
  "duel-in-the-wheat": { title: "麦畑の決闘", body: "風に揺れる麦畑で向かい合う二人の剣士。勝負は一太刀です。" },
  "dust-ballet": { title: "ほこりのバレエ", body: "屋根の穴から光が差す廃劇場で、ダンサーがひとり踊ります。" },
  "fox-in-snow": { title: "雪の中のキツネ", body: "雪の下のネズミの音を聞いたアカギツネが、頭から飛び込みます。" },
  "ink-dragon": { title: "墨の龍", body: "水に落とした一滴の黒い墨が、水墨画の龍に広がります。" },
  "mars-greenhouse": { title: "火星の温室", body: "宇宙飛行士が、火星の温室で熟し始めた最初のトマトを見つけます。" },
  "morning-syrup": { title: "朝のシロップ", body: "メープルシロップを一度完璧に注ぐ、パンケーキの広告。" },
  "mountain-pass-drift": { title: "峠のドリフト", body: "夜、霧の中をヘッドライトが切り裂き、一台の車がヘアピンをドリフトします。" },
  "movement-in-gold": { title: "金色のムーブメント", body: "歯車から手首まで、高級腕時計を生きた機構として見せます。" },
  "noise-off": { title: "ノイズオフ", body: "ヘッドホンを着けた瞬間に、ラッシュアワーの電車が静まります。" },
  "puddle-strike": { title: "水たまりの一歩", body: "街の水たまりを踏む一歩が、水の王冠になるスニーカーの広告。" },
  "rooftop-run": { title: "屋上を駆ける", body: "ゴールデンアワーに、パルクールのランナーが三つの屋上を渡ります。" },
  "silent-arrival": { title: "静かな到着", body: "夜明けの砂漠を、電気自動車がほとんど音を立てずに横切ります。" },
  "silk-and-glass": { title: "シルクとガラス", body: "舞い落ちるシルクとガラスの水滴で見せる香水の広告。" },
  "suite-morning": { title: "スイートの朝", body: "カーテンからバルコニーのコーヒーまで、オーシャンビューのスイートが目覚めます。" },
  "summit-reveal": { title: "山頂の景色", body: "登山者が山頂に立つと、足もとの雲が切れます。" },
  "the-interrogation": { title: "尋問", body: "二人の人物、一つのテーブル、二つのセリフで暴かれる一つの嘘。" },
  "the-long-hallway": { title: "長い廊下", body: "夜勤の看護師が、病院の廊下の突き当たりに何かを見ます。" },
  "under-the-bed": { title: "ベッドの下", body: "女の子がベッドの下を懐中電灯で照らすと、彼女より怖がっているモンスターがいました。" },
};

export const JA_AD_LIBRARY: Record<string, Line> = {
  "kinetic-offer-wall": { title: "キネティックなオファーウォール", body: "商品ラインアップを見せながら、一つのオファーを読みやすく伝えます。" },
  "product-cutout-shuffle": { title: "商品切り抜きシャッフル", body: "静的なカタログを、SKUやフレーバーの短い広告にします。" },
  "one-hub-three-product-benefits": { title: "一つのハブ、三つの製品メリット", body: "読み取れないダッシュボード全体を見せずに、SaaSやサービスのバンドルを説明します。" },
  "benefit-led-dashboard-punch-in": { title: "メリット先行のダッシュボード寄り", body: "製品の一つの操作とその結果を具体的に見せます。" },
  "fast-footage-plus-kinetic-captions": { title: "速いカット割りとキネティックキャプション", body: "既存の映像を、分かりやすい縦型広告に作り直します。" },
  "editorial-image-panels": { title: "エディトリアル調の画像パネル", body: "少ない素材から、音なしでも成立する上質な広告を作ります。" },
  "binary-choice-participation-card": { title: "二択の参加カード", body: "MP4が操作できるふりをせずに、A/Bの明確な回答を促します。" },
  "desktop-chaos-to-one-clean-result": { title: "散らかったデスクトップから一つのきれいな結果へ", body: "ワークフロー上の悩みと、その解消を視覚化します。" },
  "headline-plus-inset-motion-module": { title: "見出しと埋め込みモーションモジュール", body: "多くのモーション素材を、統一感のある縦型広告のシリーズにします。" },
  "integration-puzzle-that-snaps-together": { title: "はまり合う連携パズル", body: "つながる製品や連携を、気持ちよく組み上がる様子で表現します。" },
  "hero-artwork-becomes-a-type-stage": { title: "メインビジュアルが文字のステージになる", body: "獲得向けとブランド向けのバリエーションで、一つのアートワークを使い回します。" },
  "fixed-glyph-changing-world": { title: "固定されたグリフ、変わる世界", body: "一貫したビジュアルの軸で、記憶に残る製品の約束を伝えます。" },
  "calm-breathing-shape-loop": { title: "穏やかに呼吸する図形のループ", body: "意図的に落ち着いた、製品デモやウェルネス調の広告を作ります。" },
  "macro-feature-proof": { title: "マクロで見せる機能の証拠", body: "ハードウェアや製品の具体的なディテールを見せてから、その意味を説明します。" },
  "result-seen-through-the-product": { title: "製品を通して見える結果", body: "印象的な成果物を、それを生み出す製品に直接結び付けます。" },
  "a-capability-journey-on-connected-paths": { title: "つながる経路上の機能シーケンス", body: "オンボーディングやサービスの流れを、コンパクトな図で説明します。" },
};

export const JA_RECIPES: Record<string, Line> = {
  "directed-campaign-kit": { title: "演出するキャンペーンキット", body: "一枚の商品画像を、動きのあるキャンペーンのメインビジュアル、連動するソーシャル向けの各サイズ、範囲を絞った一度の修正に変えます。" },
  "ugc-product-video": { title: "UGC商品動画", body: "クリエイターと商品の参照から、カップが心強い相棒になる15秒の一日のストーリーを作ります。" },
  "viral-video-ad-engine": { title: "商品コマーシャル", body: "商品にストーリーを与えます。ショットを演出し、音を整え、タイムラインで広告を仕上げます。" },
  "multilingual-video-dubber": { title: "多言語動画", body: "翻訳を確認し、声を選び、セリフごとに話し方を編集します。新しい言語のナレーションか、別途リップシンクで仕上げます。" },
  "ecommerce-sku-visual-factory": { title: "商品カタログ素材", body: "一つの商品参照から、スタジオ画像、季節のシーン、短いモーションクリップのセットを作ります。" },
  "storyboard-to-trailer": { title: "絵コンテからトレーラーへ", body: "ストーリーのアイデアを六ショットの絵コンテにし、同じワークスペースで声、動き、編集まで仕上げます。" },
  "impossible-product-worlds": { title: "ありえない商品の世界", body: "巨大なカップに隠れたプールまで泳ぐ人を追い、彼女がそれを飲むときに人間のスケールへ戻ります。" },
};

export const JA_MODALITY: Record<Modality, string> = {
  "text-to-video": "テキストから動画",
  "image-to-video": "画像から動画",
  "text-to-image": "テキストから画像",
  "image-to-image": "画像から画像",
};

/** Vendor names a Japanese reader knows by their Japanese name. Everything else stays in Latin script. */
export const JA_VENDOR: Record<string, string> = {
  Kuaishou: "快手（Kuaishou）",
  ByteDance: "ByteDance",
  "ByteDance Seed": "ByteDance Seed",
  Alibaba: "Alibaba",
};
