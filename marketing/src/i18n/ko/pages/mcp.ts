import type { LocalizedPageContent } from "@/i18n/content";

const INSTALL = "npx -y --package=@nodetool-ai/cli-mcp nodetool-mcp install";

/** Translates /mcp (app/mcp/page.tsx, data/mcpPage.ts). */
export const mcp: LocalizedPageContent = {
  route: "/mcp",
  name: "MCP 서버",
  title: "크리에이티브 MCP 서버 | Claude Code, Codex, Cursor에 창작 스튜디오를 · NodeTool",
  description:
    "NodeTool은 오픈소스 MCP 서버로 실행됩니다. Claude Code, Codex, OpenCode, Cursor, Claude Desktop에 추가하면 에이전트가 이미지, 동영상, 음성, 음악을 생성해 편집 가능한 스토리보드, 타임라인, 워크플로에 담을 수 있습니다.",
  hero: {
    kicker: "크리에이티브 MCP 서버",
    h1: "코딩 에이전트에게 창작 스튜디오를 주세요.",
    lead: "NodeTool은 오픈소스 MCP 서버로 실행됩니다. Claude Code, Codex, OpenCode, Cursor, Claude Desktop에 추가하면 에이전트가 이미지, 동영상, 음성, 음악을 생성한 다음 열어서 편집할 수 있는 문서에 담습니다. 스토리보드, 타임라인, 대본, 스케치, 게임, 워크플로가 그 대상입니다. 내 프로바이더 키로 실행되고, 데스크톱 앱은 선택 사항입니다.",
    code: `$ ${INSTALL}`,
    note: "Node.js 22 이상이 필요합니다. 클라이언트를 다시 시작한 다음 NodeTool을 쓰라고 하세요.",
    primary: { label: "설정 방법 보기", href: "#clients" },
    secondary: { label: "Studio 다운로드(선택)", href: "/download" },
  },
  sections: [
    {
      kind: "cards",
      id: "clients",
      title: "지원하는 클라이언트.",
      cards: [
        { title: "Claude Code", body: "nodetool-mcp install이 설정합니다. 사용자 범위라서 모든 프로젝트에서 쓸 수 있습니다." },
        { title: "Codex", body: "nodetool-mcp install이 설정합니다. 긴 동영상 작업을 위해 도구 타임아웃을 900초로 지정합니다." },
        { title: "OpenCode", body: "nodetool-mcp install이 설정합니다." },
        { title: "Cursor, Windsurf 등 클라이언트", body: "nodetool-mcp config를 실행하고, 출력된 mcpServers 설정 블록을 붙여 넣으세요." },
        { title: "Claude Desktop", body: "nodetool-mcp config의 설정 블록을 붙여 넣거나, Studio의 설정 → MCP 서버에서 함께 제공되는 확장 프로그램을 설치하세요." },
      ],
    },
    {
      kind: "cards",
      id: "capabilities",
      title: "에이전트가 할 수 있는 일.",
      intro: "모든 결과는 내 NodeTool 프로젝트로 들어가므로, 에이전트의 작업을 Studio에서 열어 계속 편집할 수 있습니다.",
      cards: [
        { title: "미디어 생성", body: "이미지, 이미지 편집, 텍스트·이미지·레퍼런스로 만드는 동영상, 음성, 음악, 전사를 지정한 프로바이더와 모델로 실행합니다. find_model이 실제 모델 ID를 돌려주므로 에이전트가 추측하지 않아도 됩니다." },
        { title: "동영상 제작", body: "스토리보드를 만들고, 스틸과 클립을 렌더링하고, 대본에 목소리를 입히고, 타임라인을 조립하고, 편집하고, 프레임을 미리 보고, 컷을 렌더링합니다." },
        { title: "게임 제작", body: "2D 또는 3D 게임을 만들고, 검증된 작업으로 편집하고, 아트와 사운드를 생성해 설치하고, 헤드리스로 플레이 테스트하고, 프레임을 캡처하고, 웹 플레이어를 빌드합니다." },
        { title: "이미지 편집", body: "버전이 있는 레이어 스케치를 만들고 편집하며, view_image로 어떤 결과든 확인합니다." },
        { title: "워크플로 실행", body: "노드 워크플로를 만들고, 검증하고, 디버그하고, 실행하거나, 백그라운드 작업으로 시작해 로그를 읽습니다." },
        { title: "파일 보관", body: "파일을 에셋으로 업로드하고 결과를 내려받습니다. 로컬 연결에서는 download_asset이 프로젝트 안의 경로에 바로 씁니다." },
      ],
    },
    {
      kind: "table",
      id: "tools",
      title: "도구, 리소스, 프롬프트.",
      intro: "서버는 직접 도구를 몇 개만 등록합니다. nodetool://capabilities와 nodetool://sandbox 두 리소스가 나머지를 설명합니다. 스킬은 각각 MCP 프롬프트이므로 Claude Code가 슬래시 명령으로 보여 줍니다.",
      head: ["도구", "하는 일"],
      rows: [
        ["execute_code", "샌드박스 안에서 JavaScript를 실행하고 nodetool.<namespace>.<method>()를 호출합니다. 위의 모든 기능이 이것을 통해 호출됩니다."],
        ["view_image", "이미지를 돌려주어 에이전트가 픽셀을 볼 수 있게 합니다."],
        ["upload_asset, download_asset", "에셋 라이브러리로 파일을 옮기거나 꺼냅니다."],
        ["find_model, list_models, list_provider_models", "기능에 맞는 실제 프로바이더와 모델 ID를 찾습니다."],
        ["search_nodes, get_node_info, list_nodes", "워크플로에 쓸 노드 타입을 찾습니다."],
        ["browser, http_request, download_file, list_directory", "NodeTool의 URL 검사를 거쳐 페이지와 파일을 가져옵니다."],
        ["run_subtask", "NodeTool 도구를 가진 하위 에이전트에게 작업을 넘깁니다."],
      ],
    },
    {
      kind: "table",
      id: "modes",
      title: "Studio가 있어도 없어도 됩니다.",
      head: ["연결 방식", "설명"],
      rows: [
        ["stdio(기본)", "nodetool-mcp serve. Studio나 기존 API 서버가 127.0.0.1:7777에서 실행 중이면 요청이 그쪽으로 가고, 열려 있는 편집기에 에이전트의 변경이 실시간으로 표시됩니다. 그렇지 않으면 기본 데이터 디렉터리에서 단독으로 실행됩니다."],
        ["HTTP", "기존 API 서버가 실행 중일 때 nodetool-mcp install --http가 클라이언트를 http://127.0.0.1:7777/mcp로 연결합니다."],
        ["원격 서버", "설정 → MCP 서버 → 원격으로 에이전트 연결에서 액세스 토큰을 만들고, 클라이언트가 그 서버를 가리키게 합니다."],
      ],
    },
    {
      kind: "text",
      id: "keys",
      title: "키는 한 번만 저장하세요.",
      body: [
        "생성에는 프로바이더 키가 필요합니다. nodetool secrets store로 저장하거나 같은 이름의 환경 변수를 설정하세요. 노드 검색, 검증, 에셋, 파일 도구는 키 없이 작동합니다.",
      ],
      code: "nodetool secrets store FAL_API_KEY\nnodetool secrets store OPENAI_API_KEY",
      bullets: [
        "대부분의 기능은 별도의 MCP 도구가 아니라 execute_code 안에서 실행됩니다. execute_code 호출마다 확인할지는 클라이언트의 승인 설정이 정하며, 서버에는 자체 승인 프롬프트가 없습니다.",
        "서버의 파일 도구는 내 파일 시스템이 아니라 NodeTool 워크스페이스에서 작동합니다. 결과를 프로젝트 안의 경로에 쓰려면 로컬 연결이 필요합니다.",
        "서버에는 Node.js 22 이상이 필요합니다.",
      ],
    },
  ],
  faq: {
    heading: "MCP 서버에 대한 질문",
    items: [
      {
        question: "Claude Code에 이미지와 동영상 생성을 제공하는 MCP 서버는 무엇인가요?",
        answer: `NodeTool입니다. ${INSTALL}을 실행하고 Claude Code를 다시 시작한 다음, 이미지나 동영상을 생성해 달라고 요청하세요. fal, Replicate, OpenAI, Gemini 등의 프로바이더를 내 키로 호출하고, 결과를 다시 쓸 수 있는 에셋으로 저장합니다.`,
      },
      {
        question: "MCP 서버가 클립을 생성하는 데서 그치지 않고 동영상 타임라인도 편집할 수 있나요?",
        answer:
          "네. NodeTool의 MCP 서버를 통해 에이전트는 스토리보드와 타임라인을 만들고 편집하며, 컷을 확인하려고 프레임을 렌더링하고, 최종 동영상을 렌더링합니다. 타임라인은 NodeTool Studio에서 열어 계속 편집할 수 있습니다.",
      },
      {
        question: "Claude Code로 NodeTool에서 게임을 만들 수 있나요?",
        answer:
          "네. 게임 도구는 execute_code를 통해 실행됩니다. 게임을 만들고, 장면과 스크립트를 편집하고, 스프라이트, 타일셋, 음악, 효과음을 생성하고, 헤드리스로 플레이 테스트하고, 웹 플레이어를 빌드합니다. 엔진의 스킬은 Claude Code에서 슬래시 명령으로 나타납니다.",
      },
      {
        question: "ComfyUI MCP 서버와는 무엇이 다른가요?",
        answer:
          "ComfyUI MCP 서버는 ComfyUI 워크플로를 실행합니다. NodeTool의 서버는 에이전트가 작업할 편집 가능한 문서, 예를 들어 스토리보드, 타임라인, 스케치, 게임도 제공하고, 호스팅 프로바이더와 로컬 모델을 모두 호출합니다.",
      },
      {
        question: "데스크톱 앱이 필요한가요?",
        answer:
          "아니요. 실행 중인 기존 API 서버가 없으면 nodetool-mcp serve가 단독으로 실행됩니다. Studio가 열려 있으면 요청이 그쪽으로 가고, 에이전트의 편집이 편집기에서 이루어지는 모습을 볼 수 있습니다.",
      },
      {
        question: "스크립트나 CI에서도 쓸 수 있나요?",
        answer:
          "네. MCP 외에도 nodetool CLI로 터미널에서 워크플로와 생성을 실행할 수 있고, 서버에는 워크플로를 실행하는 REST 엔드포인트도 있습니다. 개발자 페이지를 참고하세요.",
      },
    ],
  },
  readMore: {
    heading: "더 읽어 보기",
    links: [
      { label: "MCP 서버 가이드", href: "https://docs.nodetool.ai/mcp-server" },
      { label: "에이전트: 오픈소스 크리에이티브 하니스", href: "/agents" },
      { label: "노드 워크플로", href: "/node-based-workflows" },
      { label: "개발자 페이지: CLI, REST, 셀프 호스팅", href: "/developers" },
      { label: "Claude Code에서 게임 만들기", href: "/gamedev" },
      { label: "AI 동영상 편집기", href: "/ai-video-editor" },
      { label: "npm 패키지", href: "https://www.npmjs.com/package/@nodetool-ai/cli-mcp" },
    ],
  },
  closing: {
    title: "명령어 하나로 연결됩니다.",
    body: `${INSTALL}을 실행하고, 클라이언트를 다시 시작한 다음 NodeTool을 쓰라고 하세요. 에이전트의 편집을 편집기에서 보고 싶다면 Studio도 함께 여세요.`,
  },
};
