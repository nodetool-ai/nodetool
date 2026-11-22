import type { LocalizedPageContent } from "@/i18n/content";

/** Translates /alternatives/comfyui (competitorEntries.ts, the comparison template). */
export const comfyui: LocalizedPageContent = {
  route: "/alternatives/comfyui",
  name: "ComfyUI와 비교",
  title: "ComfyUI 대안 | ComfyUI 그래프는 그대로, 주변 편집기까지 · NodeTool",
  description:
    "NodeTool은 Python 환경과 자주 깨지는 커스텀 노드를, 클라우드와 로컬 모델을 지원하고 에이전트, 스토리보드, 타임라인을 갖춘 하나의 오픈소스 데스크톱 앱으로 대체합니다. 기존 ComfyUI 그래프는 API 형식으로 가져와 노드 하나로 실행할 수 있습니다.",
  hero: {
    kicker: "ComfyUI 대안",
    h1: "ComfyUI 그래프는 그대로. 주변 편집기까지 더하세요.",
    lead: "NodeTool은 Python 환경과 자주 깨지는 커스텀 노드를, 클라우드와 로컬 모델을 지원하고 에이전트, 스토리보드, 타임라인을 갖춘 하나의 오픈소스 데스크톱 앱으로 대체합니다. 기존 ComfyUI 그래프가 필요하신가요? API 형식으로 가져와 노드 하나로 실행하세요.",
    note: "데스크톱 설치 파일 하나 · 내장 에이전트 · ComfyUI API 그래프 실행",
    secondary: { label: "ComfyUI와 항목별 비교", href: "#compare" },
    media: {
      kind: "reel",
      base: "/hero-nodes",
      alt: "노드를 직접 연결하거나 에이전트에게 그래프를 만들게 합니다. 타입이 맞지 않는 연결은 실행 전에 막히고, 어느 모델이든 그 자리에서 교체할 수 있습니다.",
    },
  },
  sections: [
    {
      kind: "steps",
      id: "project",
      title: "그래프에서 완성된 프로젝트까지.",
      intro: "워크플로 캔버스는 여러 편집기 가운데 하나입니다. 스토리보드와 타임라인은 같은 프로젝트에서 작업합니다.",
      steps: [
        { title: "만들기: 에이전트와 그래프", body: "영화를 설명하세요. 에이전트가 워크플로를 쓰고, 모든 단계가 노드 편집기에 보입니다." },
        { title: "생성: 샷과 소재", body: "스토리보드에서 스틸 이미지로 룩을 확정하세요. 승인한 샷만 동영상이 됩니다." },
        { title: "마무리: 편집 가능한 컷", body: "타임라인에서 클립을 배열하고, 다듬고, 겹치세요. 또는 에이전트에게 도입부를 줄여 달라고 하세요." },
      ],
    },
    {
      kind: "table",
      id: "compare",
      title: "NodeTool과 ComfyUI",
      intro: "ComfyUI는 이미지와 동영상 생성 그래프를 위한 노드 편집기로, 샘플러와 모델 설정 하나하나를 세밀하게 제어할 수 있습니다. NodeTool은 생성 그래프가 스토리보드, 레이어 스케치, 대본, 동영상 타임라인과 나란히 있는 하나의 편집기인 창작 작업 공간입니다. ComfyUI 서버, NodeTool GPU 워커, Comfy Cloud를 그 그래프의 노드로 호출할 수 있습니다.",
      head: ["기능", "ComfyUI", "NodeTool"],
      rows: [
        ["설치", "Python 환경과 커스텀 노드 관리자", "데스크톱 설치 파일 하나 또는 Docker"],
        ["내장 에이전트", "커뮤니티 노드", "그래프를 만들고, 검증하고, 고칩니다"],
        ["미디어 종류", "지원되는 워크플로로 이미지, 동영상, 오디오", "이미지, 동영상, 오디오, 텍스트"],
        ["모델", "로컬 및 파트너의 이미지/동영상 모델", "미디어 종류를 아우르는 로컬 및 호스팅 모델"],
        ["편집 도구(마스크, 인페인트, 리라이트, 레이어)", "워크플로와 노드로 제공", "통합된 편집기와 노드"],
        ["로컬 모델", "폭넓은 로컬 디퓨전, LoRA, ControlNet 지원", "Ollama, MLX, llama.cpp, Flux, SD.cpp, Wan, 그리고 호스팅 API"],
        ["데스크톱과 브라우저", "로컬 웹 인터페이스와 Comfy Cloud", "Studio와 Cloud(알파)"],
        ["오픈소스", "예", "예"],
        ["커스텀 노드 안정성", "서드파티, 버전이 충돌할 수 있음", "내장 노드, 하나의 관리되는 코드베이스"],
        ["기기 간 워크플로 이식성", "커스텀 노드 설치가 필요할 수 있음", "같은 모델과 프로바이더 접근 권한 필요"],
        ["ComfyUI 워크플로 실행", "예", "노드로서, 내 ComfyUI 서버, NodeTool GPU 워커, Comfy Cloud에서 실행"],
      ],
    },
    {
      kind: "text",
      id: "when-comfyui",
      title: "ComfyUI가 더 맞는 경우.",
      body: [
        "그래프 자체가 작업이고 샘플러, 스케줄러, 커스텀 노드를 손으로 조정한다면 ComfyUI를 고르세요. 디퓨전 이미지뿐 아니라 텍스트 투 비디오와 이미지 투 비디오도 실행합니다. 커스텀 노드를 쓰는 공유 그래프는 다음 기기에도 같은 확장과 모델이 필요하며, 그것을 호출하는 NodeTool 워크플로도 마찬가지입니다.",
      ],
    },
    {
      kind: "table",
      id: "others",
      title: "다른 오픈소스 대안.",
      intro: "내 컴퓨터에서 쓰는 오픈소스 소프트웨어로는 NodeTool, InvokeAI, SwarmUI, Stable Diffusion WebUI Forge가 ComfyUI와 가장 가까운 대안입니다.",
      head: ["도구", "설명", "실행 환경과 라이선스"],
      rows: [
        ["InvokeAI", "통합 캔버스와 노드 기반 워크플로 편집기를 갖춘 이미지 생성 앱.", "Windows, macOS, Linux · 오픈소스(Apache-2.0)"],
        ["SwarmUI", "폼 중심의 이미지·동영상 모델 인터페이스로, 원본 그래프를 여는 Comfy Workflow 탭이 있습니다.", "Windows, Linux, Apple Silicon의 macOS · 오픈소스(MIT)"],
        ["Stable Diffusion WebUI Forge", "AUTOMATIC1111의 Stable Diffusion WebUI 기반 웹 인터페이스로, 그래프 대신 폼에 설정이 있습니다.", "로컬 실행 · 오픈소스(AGPL-3.0)"],
        ["Draw Things", "Apple 기기에서 이미지 모델을 오프라인으로 실행하는 앱.", "Mac, iPhone, iPad · 인앱 결제가 있는 무료 앱"],
      ],
    },
  ],
  faq: {
    heading: "자주 묻는 질문",
    items: [
      {
        question: "ComfyUI 워크플로는 왜 공유하거나 업데이트한 뒤에 깨지나요?",
        answer:
          "공유된 ComfyUI 그래프는 다른 기기에 없는 커스텀 노드나 모델을 참조할 수 있습니다. ComfyUI Manager가 빠진 노드 설치를 도울 수 있습니다. 공유하기 전에 확장과 모델 요구 사항을 확인하세요. NodeTool 워크플로도 같은 모델과 프로바이더 접근 권한이 필요하지만, 핵심 편집 화면은 앱과 함께 제공됩니다.",
      },
      {
        question: "NodeTool이 내 기존 ComfyUI 워크플로를 실행할 수 있나요?",
        answer:
          "네, 워크플로를 API(prompt) 형식으로 내보냈다면 가능합니다. Run ComfyUI Workflow 노드가 이를 내가 운영하는 ComfyUI 서버, ComfyUI 앞단에 있는 NodeTool GPU 워커, 또는 COMFY_API_KEY를 쓰는 Comfy Cloud로 보냅니다. 서버에는 해당 워크플로의 커스텀 노드와 모델이 있어야 합니다.",
      },
      {
        question: "Mac이나 Linux용 ComfyUI 대안이 있나요?",
        answer:
          "네. NodeTool Studio는 Apple Silicon과 Intel Mac용 .dmg, Windows 설치 프로그램, Linux AppImage를 제공합니다. macOS 14 이상의 Apple Silicon에서는 로컬 모델이 Apple의 MLX 프레임워크에서 실행될 수 있습니다. InvokeAI도 macOS와 Linux에서 실행되고, SwarmUI는 Linux와 Apple Silicon Mac에서 실행되며, Draw Things는 이미지 모델을 오프라인으로 실행하는 Mac, iPhone, iPad용 무료 앱입니다.",
      },
      {
        question: "ComfyUI의 가장 좋은 온라인 대안은 무엇인가요?",
        answer:
          "설치 없이 쓰는 호스팅 캔버스로는 Figma Weave, Flora, Krea가 브라우저에서 실행되며, 각각 자체 모델 목록과 크레딧을 씁니다. Comfy Cloud는 ComfyUI의 자체 호스팅 버전입니다. NodeTool Cloud도 브라우저에서 실행되며 알파 단계이므로, 대가를 받는 작업에는 데스크톱의 NodeTool Studio를 쓰세요.",
      },
      {
        question: "ComfyUI보다 쉬운 대안이 있나요?",
        answer:
          "어떤 부분이 어려운지에 따라 다릅니다. 그래프가 걸림돌이라면 Stable Diffusion WebUI Forge는 설정을 폼에 두고, SwarmUI는 폼을 먼저 보여 주고 그래프는 별도 탭에 둡니다. 설치가 걸림돌이라면 Krea나 Flora 같은 호스팅 캔버스는 설치가 필요 없습니다. NodeTool에서는 원하는 결과를 설명하면 에이전트가 워크플로를 만들고 검증하거나, 템플릿에서 시작할 수 있고, 호스팅 모델에는 그래픽 카드도 모델 다운로드도 필요 없습니다.",
      },
      {
        question: "무료 오픈소스 ComfyUI 대안이 있나요?",
        answer:
          "네. NodeTool은 AGPL-3.0, InvokeAI는 Apache-2.0, SwarmUI는 MIT, Stable Diffusion WebUI Forge는 AGPL-3.0으로 무료 오픈소스입니다. 네 가지 모두 내 컴퓨터에서 로컬 모델을 실행합니다. NodeTool은 내 프로바이더 키로 호스팅 모델도 호출하며, 프로바이더가 정가로 결제를 청구합니다.",
      },
    ],
  },
  readMore: {
    heading: "더 읽어 보기",
    links: [
      { label: "노드 워크플로", href: "/node-based-workflows" },
      { label: "모든 대안", href: "/alternatives" },
      { label: "지원 모델", href: "/models" },
    ],
  },
  closing: {
    title: "설치 부담은 덜고, 제어권은 그대로.",
    body: "macOS, Windows, Linux용 Studio를 내려받으세요. 에이전트로 새 그래프를 만들거나, 기존 ComfyUI API 워크플로를 노드로 가져오세요.",
  },
};
