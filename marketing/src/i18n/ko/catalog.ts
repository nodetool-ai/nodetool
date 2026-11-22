/**
 * Korean titles and one-line descriptions for the generated catalogs the
 * translated pages list: example storyboards, ad library concepts, recipes
 * and the model hub. Each line translates the English catalog entry
 * (storyboards: title and description, ad library: title and objective,
 * recipes: name and outcome). A slug with no entry here falls back to the
 * English text.
 */
import type { StoryboardCategory } from "@/data/storyboards";
import type { Modality } from "@/data/modelEntries";

type Line = { title: string; body: string };

export const KO_STORYBOARD_CATEGORIES: Record<StoryboardCategory, Line> = {
  commercial: { title: "광고", body: "샷 단위로 보여 주는 제품 영상과 소셜 미디어용 짧은 광고." },
  film: { title: "영화", body: "행동, 대사, 분위기가 있는 장면." },
  animation: { title: "애니메이션", body: "점토, 수묵, 태엽의 세계." },
  nature: { title: "자연", body: "다큐멘터리 스타일의 야생동물과 풍경." },
};

export const KO_STORYBOARDS: Record<string, Line> = {
  "bowl-time": { title: "밥 시간", body: "사료가 그릇에 떨어지는 소리를 들은 개, 그리고 온 집안이 알게 됩니다." },
  "clay-monday": { title: "클레이 먼데이", body: "점토 애니메이션 캐릭터가 힘겹게 침대에서 일어나 커피를 내립니다." },
  "clockwork-heart": { title: "태엽 심장", body: "황동 기계 심장이 뛰기 시작하는 순간까지, 매크로 시점으로 들어갑니다." },
  "cold-brew-pour": { title: "콜드브루 푸어", body: "천천히 붓는 한 번의 푸어와 첫 모금의 차가움으로 만든 아이스 콜드브루 광고." },
  "dawn-run": { title: "새벽 달리기", body: "해가 뜰 무렵, 한 번도 멈추지 않는 걸음으로 조용한 도시의 다리를 건너는 러너." },
  "dew-drop-serum": { title: "이슬 세럼", body: "피부 위에 떨어지는 세럼 한 방울을 따라가는 스킨케어 광고." },
  "diver-and-the-whale": { title: "다이버와 고래", body: "탁 트인 푸른 바다에 떠 있는 프리다이버, 손이 닿을 만큼 가까이 미끄러져 오는 혹등고래." },
  "duel-in-the-wheat": { title: "밀밭의 결투", body: "바람 부는 밀밭에서 마주 선 두 검객. 단 한 번의 일격." },
  "dust-ballet": { title: "먼지 발레", body: "지붕의 구멍으로 빛이 들어오는 버려진 극장에서 혼자 춤추는 무용수." },
  "fox-in-snow": { title: "눈 속의 여우", body: "눈 밑에서 나는 생쥐 소리를 들은 붉은 여우가 머리부터 뛰어듭니다." },
  "ink-dragon": { title: "먹물 용", body: "물에 떨어진 검은 먹물 한 방울이 번지며 수묵화 속 용이 됩니다." },
  "mars-greenhouse": { title: "화성 온실", body: "화성의 온실에서 처음으로 익어 가는 토마토를 발견한 우주비행사." },
  "morning-syrup": { title: "아침의 시럽", body: "메이플 시럽을 완벽하게 한 번 붓는 장면으로 만든 팬케이크 광고." },
  "mountain-pass-drift": { title: "산길 드리프트", body: "밤의 헤어핀 코너에서 드리프트하는 자동차 한 대, 안개를 가르는 헤드라이트." },
  "movement-in-gold": { title: "황금 무브먼트", body: "기어에서 손목까지, 살아 있는 기계로 담아낸 고급 시계." },
  "noise-off": { title: "노이즈 오프", body: "헤드폰을 쓰는 순간 출퇴근 시간의 열차가 조용해집니다." },
  "puddle-strike": { title: "물웅덩이 한 걸음", body: "도시의 물웅덩이를 한 걸음 밟자 왕관 모양의 물보라가 솟는 운동화 광고." },
  "rooftop-run": { title: "옥상 질주", body: "골든아워에 세 개의 옥상을 가로지르는 파쿠르 러너." },
  "silent-arrival": { title: "소리 없는 도착", body: "새벽에 거의 아무 소리 없이 사막을 건너는 전기차." },
  "silk-and-glass": { title: "실크와 유리", body: "떨어지는 실크와 유리 위의 물방울로 만든 향수 광고." },
  "suite-morning": { title: "스위트룸의 아침", body: "커튼에서 발코니의 커피까지, 오션뷰 속에서 깨어나는 호텔 스위트룸." },
  "summit-reveal": { title: "정상의 순간", body: "아래의 구름이 걷히는 순간 정상에 오르는 등반가." },
  "the-interrogation": { title: "심문", body: "두 사람, 탁자 하나, 두 줄의 대사로 드러나는 하나의 거짓말." },
  "the-long-hallway": { title: "긴 복도", body: "야간 근무 간호사가 병원 복도 끝에서 무언가를 봅니다." },
  "under-the-bed": { title: "침대 밑", body: "아이가 침대 밑을 손전등으로 비추자, 자기보다 더 겁먹은 괴물이 있습니다." },
};

export const KO_AD_LIBRARY: Record<string, Line> = {
  "kinetic-offer-wall": { title: "키네틱 오퍼 월", body: "제품 라인업을 보여 주면서 정당한 혜택 하나를 읽기 쉽게 전달합니다." },
  "product-cutout-shuffle": { title: "제품 누끼 셔플", body: "정적인 카탈로그를 SKU나 맛별 짧은 광고로 바꿉니다." },
  "one-hub-three-product-benefits": { title: "하나의 허브, 세 가지 제품 혜택", body: "읽을 수 없는 전체 대시보드를 보여 주지 않고 SaaS나 서비스 번들을 설명합니다." },
  "benefit-led-dashboard-punch-in": { title: "혜택 중심 대시보드 펀치인", body: "제품의 동작 하나와 그 결과를 구체적으로 보여 줍니다." },
  "fast-footage-plus-kinetic-captions": { title: "빠른 영상과 키네틱 자막", body: "기존 영상을 명확한 세로형 광고로 다시 구성합니다." },
  "editorial-image-panels": { title: "에디토리얼 이미지 패널", body: "적은 소재로 소리 없이도 고급스러운 광고를 만듭니다." },
  "binary-choice-participation-card": { title: "이지선다 참여 카드", body: "MP4가 인터랙티브인 척하지 않으면서 분명한 A/B 응답을 유도합니다." },
  "desktop-chaos-to-one-clean-result": { title: "어수선한 바탕화면에서 깔끔한 결과 하나로", body: "업무 흐름의 불편과 그 해결을 시각화합니다." },
  "headline-plus-inset-motion-module": { title: "헤드라인과 삽입 모션 모듈", body: "많은 모션 소재를 일관된 세로형 광고 시리즈로 만듭니다." },
  "integration-puzzle-that-snaps-together": { title: "딱 맞물리는 연동 퍼즐", body: "연결된 제품이나 연동을 만족스러운 조립으로 표현합니다." },
  "hero-artwork-becomes-a-type-stage": { title: "히어로 아트워크가 타이포 무대로", body: "하나의 아트워크 체계를 신규 유입용과 브랜드용 버전에 재사용합니다." },
  "fixed-glyph-changing-world": { title: "고정된 글리프, 변하는 세계", body: "일관된 시각적 기준점으로 기억에 남는 제품 약속을 만듭니다." },
  "calm-breathing-shape-loop": { title: "차분하게 숨 쉬는 도형 루프", body: "의도적으로 차분한 제품 데모나 웰니스 스타일의 광고를 만듭니다." },
  "macro-feature-proof": { title: "매크로 기능 증명", body: "특정 하드웨어나 제품의 디테일을 보여 준 다음, 그것이 왜 중요한지 설명합니다." },
  "result-seen-through-the-product": { title: "제품을 통해 보는 결과", body: "인상적인 결과물을 그것을 만든 제품에 곧바로 연결합니다." },
  "a-capability-journey-on-connected-paths": { title: "연결된 경로 위의 기능 시퀀스", body: "온보딩이나 서비스 여정을 간결한 다이어그램으로 설명합니다." },
};

export const KO_RECIPES: Record<string, Line> = {
  "directed-campaign-kit": { title: "연출형 캠페인 키트", body: "제품 이미지 하나를 역동적인 캠페인 히어로, 서로 맞춘 소셜 포맷, 한 번의 통제된 수정으로 바꿉니다." },
  "ugc-product-video": { title: "UGC 제품 영상", body: "크리에이터와 제품 레퍼런스를 15초짜리 일상 이야기로 바꿉니다. 컵이 든든한 동반자가 됩니다." },
  "viral-video-ad-engine": { title: "제품 광고 영상", body: "제품에 이야기를 입히세요. 샷을 연출하고, 사운드를 다듬고, 타임라인에서 광고를 마무리합니다." },
  "multilingual-video-dubber": { title: "다국어 영상", body: "번역을 검토하고, 목소리를 고르고, 대사를 한 줄씩 다듬습니다. 새 언어의 보이스오버나 별도의 립싱크 작업으로 마무리합니다." },
  "ecommerce-sku-visual-factory": { title: "제품 카탈로그 소재", body: "제품 레퍼런스 하나를 스튜디오 이미지, 시즌 장면, 짧은 모션 클립 세트로 바꿉니다." },
  "storyboard-to-trailer": { title: "스토리보드에서 트레일러로", body: "이야기 아이디어를 6샷 스토리보드로 만든 뒤, 같은 작업 공간에서 목소리, 모션, 편집까지 이어 갑니다." },
  "impossible-product-worlds": { title: "불가능한 제품 세계", body: "거대한 컵 속에 숨은 수영장까지 수영하는 사람을 따라간 뒤, 그 컵으로 물을 마시며 원래 크기로 돌아옵니다." },
};

export const KO_MODALITY: Record<Modality, string> = {
  "text-to-video": "텍스트 투 비디오",
  "image-to-video": "이미지 투 비디오",
  "text-to-image": "텍스트 투 이미지",
  "image-to-image": "이미지 투 이미지",
};

/** Vendor names a Korean reader knows by their Korean name. Names that stay Latin are omitted. */
export const KO_VENDOR: Record<string, string> = {
  Kuaishou: "콰이쇼우",
  ByteDance: "바이트댄스",
  "ByteDance Seed": "바이트댄스 Seed",
  Alibaba: "알리바바",
  "Alibaba Qwen": "알리바바 Qwen",
  Tencent: "텐센트",
  Baidu: "바이두",
  Google: "구글",
  "Google DeepMind": "구글 딥마인드",
  Meta: "메타",
  Microsoft: "마이크로소프트",
  NVIDIA: "엔비디아",
};
