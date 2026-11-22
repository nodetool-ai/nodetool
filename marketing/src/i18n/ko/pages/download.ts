import type { LocalizedPageContent } from "@/i18n/content";
import { UI_LANGUAGE_LINE } from "../shared";

/** Translates /download (app/download/page.tsx, components/DownloadPanel.tsx). */
export const download: LocalizedPageContent = {
  route: "/download",
  name: "다운로드",
  title: "NodeTool Studio 다운로드 | macOS, Windows, Linux용 무료 오픈소스",
  description:
    "NodeTool Studio 데스크톱 앱을 내려받으세요. macOS, Windows, Linux용 무료 오픈소스(AGPL-3.0)입니다. 프로젝트, 키, 파일은 내 컴퓨터에 남습니다.",
  hero: {
    kicker: "다운로드",
    h1: "NodeTool Studio를 내려받으세요.",
    lead: "무료 오픈소스(AGPL-3.0) 데스크톱 스튜디오입니다. 프로젝트, 키, 파일은 내 컴퓨터에 남습니다.",
    primary: { label: "설치 파일 고르기", href: "#installers" },
  },
  sections: [
    {
      kind: "installers",
      id: "installers",
      title: "내 컴퓨터에 맞는 빌드를 고르세요.",
      intro: "설치하고 싶지 않으신가요? NodeTool Cloud는 같은 작업 공간을 브라우저 탭에서 실행합니다. 알파 단계이므로 본격적인 작업에는 Studio를 쓰세요.",
    },
    {
      kind: "cards",
      id: "needs",
      title: "필요한 것.",
      cards: [
        {
          title: "API 키 하나, 또는 없이도 가능",
          body: "앱을 열고, 워크플로를 가져오고, 무엇이든 연결하기 전에 그 안의 모든 노드를 읽어 보세요. 호스팅 모델을 호출하는 워크플로를 실행하려면 해당 프로바이더의 키가 필요하고, 프로바이더에 직접 결제합니다.",
        },
        {
          title: "앱을 둘 공간만 있으면 됩니다",
          body: "설치 파일 크기는 위의 각 버튼에 표시되어 있습니다. 오픈 웨이트 모델은 선택 사항입니다. 내 컴퓨터에서 추론을 실행하고 싶을 때만 내려받으세요. 기본 세트는 대략 20 GB가 필요합니다. 아무것도 저절로 내려받지 않습니다.",
        },
        {
          title: "그래픽 카드는 필요 없습니다",
          body: "GPU는 로컬 모델에서만 의미가 있습니다. 호스팅 프로바이더로 작업한다면 평범한 노트북이면 충분하고, 렌더링은 내가 고른 프로바이더에서 이루어집니다.",
        },
        {
          title: "한국어 화면",
          body: UI_LANGUAGE_LINE,
        },
      ],
    },
    {
      kind: "table",
      id: "first-launch",
      title: "처음 실행하기.",
      head: ["시스템", "단계"],
      rows: [
        ["macOS", ".dmg를 열고 NodeTool을 응용 프로그램으로 끌어다 놓으세요. 응용 프로그램에서 NodeTool을 열고 처음 실행 시 나오는 확인 창에서 허용하세요."],
        ["Windows", ".exe 설치 프로그램을 실행하고 설치 위치를 고르세요. 새 릴리스에서는 SmartScreen이 경고할 수 있습니다. \"추가 정보\"를 선택한 다음 \"실행\"을 선택하세요."],
        ["Linux", "AppImage에 실행 권한을 주세요: chmod +x Nodetool-*.AppImage. 직접 실행하거나, 같은 릴리스에서 Flatpak을 설치하세요."],
      ],
    },
    {
      kind: "text",
      id: "next",
      title: "설치했다면 다음은?",
      body: [
        "모든 가이드는 파일 하나로 가져올 수 있는 워크플로 모음이고, 페이지에는 실행 결과가 함께 있습니다. 하나를 가져와 읽어 보고, 실행하고 싶을 때 키를 추가하세요.",
      ],
      links: [
        { label: "단계별 가이드 둘러보기", href: "/recipes" },
        { label: "설치 가이드", href: "https://docs.nodetool.ai/installation" },
        { label: "빠른 시작", href: "https://docs.nodetool.ai/getting-started" },
        { label: "문제 해결", href: "https://docs.nodetool.ai/troubleshooting" },
      ],
    },
  ],
  closing: {
    title: "무료 오픈소스, 설치하면 바로 쓸 수 있습니다.",
    body: "Studio는 NodeTool의 완성된 에디션입니다. Cloud는 설치 없이 써 보는 알파 단계의 미리 보기입니다.",
    primary: { label: "설치 파일 고르기", href: "#installers" },
    secondary: { label: "브라우저에서 사용해 보기(알파)", href: "https://app.nodetool.ai" },
  },
};
