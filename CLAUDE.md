# CLAUDE.md

개인용 SRS 단어 카드 PWA. 작업 전에 반드시 `docs/DESIGN.md`를 읽을 것.
설계 결정(D1–D8)을 바꿔야 할 것 같으면 코드를 고치기 전에 사용자에게 먼저 물어볼 것.

## 절대 규칙

- **공개 repo다.**
  - API 키, 토큰, 사용자 카드 데이터, 백업 파일, `.env`를 커밋하지 않는다.
  - 테스트 데이터는 가짜 단어만 쓴다.
- **외부로 데이터를 보내지 않는다.**
  - 분석 도구, 외부 CDN 폰트, 추적 스크립트를 추가하지 않는다.
  - 예외는 사용자가 직접 연결한 Gemini API(음성 재생·받아쓰기) 하나뿐이다 (docs/DESIGN.md §6).
  - Gemini API 키는 기기 설정에만 저장하고, 백업 파일·로그·코드에 절대 넣지 않는다.
- **모두 무료여야 한다.** 유료 API나 결제가 필요한 서비스를 추가하지 않는다.
- **`ReviewLog`는 추가만 한다.**
  - update/delete 하지 않는다.
  - 취소는 `void`, 초기화는 `reset` 이벤트로 처리한다.
  - 카드의 FSRS 상태는 캐시이므로 `rebuildFromLogs`로 항상 재현 가능해야 한다.
- **`src/core/`는 순수 TypeScript로 유지한다.**
  - React, DOM, Dexie, `window`를 import하지 않는다.
  - 브라우저 기능은 `src/adapters/`에 둔다.
- **카드 종류의 필드 `key`와 카드 종류 `id`는 바꾸지 않는다.**
  - 구조를 바꿀 때는 `version`을 올리고 마이그레이션을 작성한다.

## 명령

- `npm run check`: lint + 타입 검사 + 단위 테스트. 푸시 전에 반드시 통과시킨다.
- `npm run e2e`: Playwright 화면 테스트. 클라우드 환경에서는 `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`을 붙인다.
- `node scripts/icons.mjs`: `public/icon.svg`로 PNG 아이콘을 다시 만든다.

## 관례

- UI 문구는 한국어로 쓴다.
- 색상은 테마 토큰(CSS 변수)만 쓴다. 라이트/다크 양쪽에서 확인한다.
- 새 카드 종류는 `src/core/cardTypes/`에 모듈 하나로 추가하고 `registry.ts`에 등록한다 (docs/DESIGN.md §5.3). 화면은 `view()`가 돌려주는 블록만 그리므로 보통 UI는 고치지 않는다.
- 시각은 UTC 밀리초로 다룬다. "오늘" 계산은 `dayStartHour` 기준이다.
- 푸시 전에 lint, 타입 검사, 단위 테스트를 모두 통과시킨다.
