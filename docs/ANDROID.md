# 안드로이드 앱

설계 결정 D1(PWA를 Capacitor로 감싼다)에 따라 만든 안드로이드 앱. 2026-10-18 시작.

## 구조

- `capacitor.config.ts`: 앱 id `io.github.aminjhk.flashcards`, 이름 "단어 카드".
  앱은 **배포된 웹앱(`https://aminjhk.github.io/flashcards/`)을 그대로 불러온다** (`server.url`).
  그래서 화면·기능 업데이트는 웹 배포만으로 들어오고, 새 APK는 안드로이드 쪽이 바뀔 때만 필요하다.
  인터넷이 없어 처음 화면을 못 불러오면 `android-web/offline.html`을 보여 준다 (`server.errorPath`). 한 번 열면 서비스 워커가 캐시한다.
- `android/`: `npx cap add android`로 만든 프로젝트. 고친 곳:
  - `NativeTtsPlugin.java`: 음성 엔진 플러그인 (엔진 목록, 목소리 목록, 언어 확인, 읽기, 멈춤). rate/pitch를 안 주면 휴대폰 설정(텍스트 음성 변환)의 속도·높낮이를 쓴다. `MainActivity`에서 등록.
  - `AndroidManifest.xml`: 녹음 권한(말해서 답하기), TTS 엔진 목록을 보기 위한 `<queries>`.
  - `app/build.gradle`: `versionCode`를 빌드 번호로 (`-PappVersionCode`).
  - 아이콘·시작 화면: `node scripts/icons.mjs`가 `public/icon.svg`로 만든다.
- 웹 쪽: `src/adapters/native/platform.ts`(`isNativeApp`), `src/adapters/tts/nativeTts.ts`(플러그인), `src/adapters/tts/device.ts`(앱이면 플러그인, 브라우저면 Web Speech).
  설정 › 음성 › 기기 음성은 앱이면 `NativeVoiceSettings`(엔진·목소리·"휴대폰 설정의 속도·높낮이 쓰기", `Settings.nativeTts`).
  백업 파일 내보내기는 앱이면 `@capacitor/filesystem` + `@capacitor/share` (앱 안 브라우저는 다운로드를 못 한다).

## 빌드

- 이 클라우드 환경에서는 `dl.google.com`이 막혀 있어서 안드로이드 SDK를 못 받는다 → **GitHub Actions**(`.github/workflows/android.yml`)가 빌드한다.
  `android/**`, `capacitor.config.ts`, `package*.json` 등이 바뀌어 main 또는 claude/mvp에 올라가면 돈다 (수동 실행도 가능).
- 결과: **서명하지 않은** APK를 릴리스 `android-latest`에 올린다 (`flashcards-<브랜치>-<번호>-unsigned.apk`). 공개 릴리스라 서명 키는 CI에 없다.

## 서명

- 안드로이드는 서명한 APK만 설치하고, **업데이트는 처음과 같은 키로 서명해야** 덮어 설치된다 (키가 다르면 지우고 다시 깔아야 하고, 그러면 앱 안 데이터가 지워진다).
- 키(`flashcards-release.jks`, alias `flashcards`)는 **저장소에 넣지 않는다** (`android/.gitignore`에 `*.jks`, `*.keystore`). 인증서 SHA-256: `59:83:6C:E0:84:3B:71:53:8A:85:34:74:36:92:7F:5B:DD:52:B7:31:B5:05:7A:C5:F5:37:11:1F:0F:66:D2:A6`.
- 서명 도구: SDK가 없으니 `uber-apk-signer`(GitHub 릴리스 jar, apksig 포함)로 v2/v3 서명. 예:
  `java -jar uber-apk-signer-1.3.0.jar -a app-release-unsigned.apk --ks flashcards-release.jks --ksAlias flashcards --ksPass <비밀번호> --ksKeyPass <비밀번호>`
- 키는 사용자가 받아서 자기 Google Drive에 보관한다 (2026-10-18, 사용자 결정). 새 APK를 서명할 때는 사용자에게 키 파일을 다시 받아야 한다. 저장소·CI에는 넣지 않는다.

## 상태표시줄 겹침 (2026-10-20)

- 안드로이드 앱의 WebView는 화면 맨 위(상태표시줄 밑)까지 펼쳐진다(`viewport-fit=cover` + Capacitor 8 `SystemBars`). 그래서 `.app`에 `padding-top: var(--safe-top)`(= `env(safe-area-inset-top)`)을 둔다. 브라우저·PWA에서는 0이다. 웹 배포만으로 적용된다.
- 상태표시줄을 아예 숨기고 싶으면 `capacitor.config.ts`의 `plugins.SystemBars.hidden: true` (새 APK 필요, 시계·배터리가 안 보임).

## 음성 엔진 목록 (2026-10-20)

- 실제 폰(갤럭시 폴드)에서 엔진 목록에 Google만 나왔다. `<queries>`(TTS_SERVICE)는 있다. 삼성 One UI 7(안드로이드 15)부터 **삼성 TTS는 삼성 앱에서만 쓸 수 있게 막혀** 있다는 보고가 있다 (삼성 인터넷에서는 됐던 이유). 앱에서 고칠 방법이 없어 설정 설명에 적었다.
- 목소리 이름(`id-id-x-ide-local` …)은 `voiceChoices`(nativeTts.ts)가 "목소리 1, 2 …"로 바꾼다: -local/-network는 하나로 묶고 저장된 판(local)을 먼저 고르며, `…-language`(엔진 기본과 같음)는 뺀다. 예전에 고른 이름은 `members`로 찾는다.

## 복습 알림 (2026-10-20)

- 사용자 요청: 1분·10분 뒤 같은 짧은 복습을 앱에 들어가지 않고 알림에서 바로 답하고 싶다. 정확한 시간에. 답은 3버튼(다시·어려움·알았음).
- 계산은 전부 앱(웹 코드)이 한다: `src/core/notify/plan.ts`(`planAlarms`)가 카드의 due(FSRS-7)로 알림 계획을 만든다.
  - 짧은 복습(직전 복습~다음 복습이 하루 미만)은 카드마다 그 시각에 카드 알림 (최대 30개). 듣기 카드는 빼고 쌓임에 센다.
  - 며칠 간격 카드는 `pileMin`(기본 10)장 이상 쌓이면 알림. 앱을 닫은 뒤 3시간부터, 3시간 간격, 하루 4번까지, 7일 앞까지.
  - 조용한 시간(기본 22~8시, 휴대폰 시각)은 끝나는 시각으로 미룬다.
- `src/adapters/native/reviewNotify.ts` + `src/ui/useReviewNotify.ts`: 앱 화면이 보이면 알림을 모두 끄고(`clear`), 앱을 내리면 계획을 보낸다(`schedule`). 설정 › 복습 › 복습 알림(`Settings.reviewNotify`, 기본 꺼짐).
- 휴대폰 쪽 (`android/.../`):
  - `ReviewAlarms.java`: 계획 저장(SharedPreferences), AlarmManager 예약(`setExactAndAllowWhileIdle`, "알람 및 리마인더" 허락이 없으면 `setAndAllowWhileIdle`), 알림 띄우기(카드: 앞면+[뜻 보기] → 뒷면+[다시][어려움][알았음], 쌓임: 장수), 답 저장(누른 시각, id).
  - `ReviewReceiver.java`: FIRE(앱 화면이 보이면 안 띄움)·REVEAL·ANSWER·BOOT_COMPLETED/MY_PACKAGE_REPLACED(다시 예약).
  - 답하면 바로 앱을 깨운다: 앱이 켜져 있으면 `ReviewNotifyPlugin.notifyAnswers()` → 웹의 'answers' 소식, 꺼져 있으면 `HeadlessRunner.java`가 화면 없는 WebView로 같은 주소를 열고 `window.FlashcardsHeadless`를 넣는다 → `src/headless.ts`(main.tsx가 화면을 그리지 않음)가 `applyAnswers`(같은 `recordReview`, 누른 시각) → 새 계획 → `done()`. 9초 안에 못 끝내면 답은 남아 있다가 다음에 앱이 켜질 때 들어간다.
  - 누른 시각이 이미 있는 기록보다 앞이면 `recordReview`가 로그로 다시 계산한다 (순서 보장).
- 권한: POST_NOTIFICATIONS(켤 때 묻는다), SCHEDULE_EXACT_ALARM(설정의 "허용하기" → 시스템 화면), RECEIVE_BOOT_COMPLETED.
- 실제 기기에서 아직 확인 못 함: 정확한 시각, 화면 없는 WebView가 9초 안에 끝나는지, 잠금 화면 버튼.

## 알려진 한계 · 할 일

- **Google 로그인(Drive 동기화·백업):** Google은 앱 안 브라우저(WebView)의 로그인 창을 막는다 → 앱에서는 `NativeGooglePlugin`(play-services-auth의 `AuthorizationClient`)으로 drive.file·openid·email 권한 토큰을 받는다 (`auth.ts`의 `nativeToken`). 한 번 허용하면 창 없이 새 토큰을 받으므로 자동 동기화도 된다 (`silentToken`).
  사용자의 Google Cloud 프로젝트에 **Android OAuth 클라이언트**(패키지 `io.github.aminjhk.flashcards`, SHA-1 `AD:05:E5:15:2A:AE:BC:CB:A1:5A:54:2D:D5:0C:56:83:99:30:4B:6B`)가 있어야 한다. 앱의 Drive 연결 화면에 안내가 있다 (`AndroidClientHelp`). 브라우저용 클라이언트 ID는 그대로 입력한다 (토큰 캐시 키로만 쓰임). 실제 기기 확인 전.
- 브라우저 음성 인식(webkitSpeechRecognition)은 WebView에 없다 → 말해서 답하기는 Gemini 받아쓰기로만.
- 복습 알림, Fish Audio 등은 다음 단계.
- 실제 기기에서 아직 확인 못 함.
