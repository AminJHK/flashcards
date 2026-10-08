# flashcards

안드로이드 폰에서 쓰는 개인용 단어 카드 앱입니다. 홈 화면에 설치하는 웹앱(PWA) 형태입니다.

- **복습 일정:** FSRS 알고리즘이 정합니다. 지금은 FSRS-6이고, FSRS-7 라이브러리 정식판이 나오면 바꿉니다.
- **카드 종류:**
  - 중국어 단어 (한자/병음/뜻, 병음 자동 입력)
  - 기본 (앞/뒤)
  - 중국어 작문 (쓰기·말하기로 답하기)
- **발음:** 기기에 내장된 음성으로 중국어, 인도네시아어 등을 읽어줍니다.
- **데이터:** 카드와 복습 기록은 모두 사용하는 기기 안에만 저장됩니다. 이 저장소에는 앱 코드만 있습니다.

설계 문서는 [docs/DESIGN.md](docs/DESIGN.md)에 있습니다.

## 폰에 설치하기

1. 안드로이드 Chrome에서 앱 주소(`https://aminjhk.github.io/flashcards/`)를 엽니다.
2. 메뉴(⋮)에서 **홈 화면에 추가** 또는 **앱 설치**를 누릅니다.
3. 설치한 뒤에는 인터넷이 없어도 열립니다. 음성 인식(말하기로 답하기)만 인터넷이 필요합니다.

## 개발

```bash
npm install
npm run dev        # 개발 서버
npm run check      # lint + 타입 검사 + 단위 테스트
npm run build      # dist/ 에 빌드
npm run e2e        # Playwright 화면 테스트 (Chromium 필요)
```

`main` 브랜치에 올리면 GitHub Actions가 검사한 뒤 GitHub Pages로 배포합니다.
