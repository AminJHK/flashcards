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
  - 짧은 복습(직전 복습~다음 복습이 하루 미만)은 카드마다 그 시각에 **미리 예약**(최대 30개). 휴대폰이 **한 번에 하나만** 보여 준다: 다른 카드 알림이 떠 있으면 FIRE를 건너뛰고, 답하거나 밀어서 지우면(`ACTION_DISMISS`) 기다리던 가장 이른 카드를 바로 띄운다 (`nextDueCard`). "남은 짧은 복습 N장"도 휴대폰이 센다. 이미 떠 있는 알림은 다시 예약하지 않는다(소리가 다시 나지 않게). 한때 웹 계획에서 카드를 하나만 보냈더니, 답한 뒤 앱을 못 깨우면 다음 알림이 아예 없어서 "알람이 안 와"가 됐다 (2026-10-21).
  - 며칠 간격 카드는 `pileMin`(기본 10)장 이상 쌓이면 알림. 앱을 닫은 뒤 3시간부터, 3시간 간격, 하루 4번까지, 7일 앞까지.
  - 조용한 시간은 없앴다 (사용자: 알아서 하겠다, 방해 금지 모드). 계산(`outOfQuiet`)은 남아 있지만 앱은 늘 시작=끝(없음)으로 보낸다.
  - 덱마다 끌 수 있다 (`reviewNotify.offDecks`, 끈 덱만 적어 둬서 새로 추가한 덱은 켜진 채로).
- `src/adapters/native/reviewNotify.ts` + `src/ui/useReviewNotify.ts`: 복습 기록·설정이 바뀔 때마다(liveQuery, 0.8초 뒤) 계획을 다시 보낸다(`schedule`). 처음에는 앱을 내릴 때(visibilitychange)만 보냈는데 실제 폰에서 알림이 안 왔다 → 앱 안 WebView는 그 신호가 안 올 수 있어서 기다리지 않는다. 앱 화면이 보이는 동안 울릴 알림은 ReviewReceiver가 띄우지 않는다 (`appVisible`). 설정의 "다음 알림" 줄이 마지막으로 보낸 계획(개수·다음 시각·오류)을 보여 준다 (localStorage, 확인용). 설정 › 복습 › 복습 알림(`Settings.reviewNotify`, 기본 꺼짐).
- 휴대폰 쪽 (`android/.../`):
  - `ReviewAlarms.java`: 계획 저장(SharedPreferences), AlarmManager 예약(`setExactAndAllowWhileIdle`, "알람 및 리마인더" 허락이 없으면 `setAndAllowWhileIdle`), 알림 띄우기(카드: 앞면+[뜻 보기] → 뒷면+[다시][어려움][알았음], 쌓임: 장수), 답 저장(누른 시각, id).
  - 카드 알림은 눌러도 앱을 열지 않는다 (글씨를 누르면 뜻 보기, 뜻이 나온 뒤에는 버튼으로만 답). 처음 버전은 글씨를 누르면 앱이 열려서 사용자가 답하려다 자꾸 앱으로 들어갔다. 쌓임 알림만 누르면 앱을 연다.
  - 뒷면은 한국어 뜻만 (`notifyText`, 예문·영어 뜻·발음 빼고). 뜻을 보면 알림을 지우고 `review_answer` 채널(중요도 높음, 소리·진동 없음)로 새로 띄워 화면 위에 펼쳐진 채로 버튼이 보이게 한다 (같은 알림을 고치면 접힌 채라 화살표를 눌러야 했다).
  - `ReviewReceiver.java`: FIRE(앱 화면이 보이면 안 띄움)·REVEAL·ANSWER·BOOT_COMPLETED/MY_PACKAGE_REPLACED(다시 예약).
  - 답하면 바로 앱을 깨운다: 앱이 켜져 있으면 `ReviewNotifyPlugin.notifyAnswers()` → 웹의 'answers' 소식, 꺼져 있으면 `HeadlessRunner.java`가 화면 없는 WebView로 같은 주소를 열고 `window.FlashcardsHeadless`를 넣는다 → `src/headless.ts`(main.tsx가 화면을 그리지 않음)가 `applyAnswers`(같은 `recordReview`, 누른 시각) → 새 계획 → `done()`. 9초 안에 못 끝내면 답은 남아 있다가 다음에 앱이 켜질 때 들어간다.
  - 누른 시각이 이미 있는 기록보다 앞이면 `recordReview`가 로그로 다시 계산한다 (순서 보장).
- 권한: POST_NOTIFICATIONS(켤 때 묻는다), 정확한 시각은 안드로이드 13+ `USE_EXACT_ALARM`(설치하면 바로 허락, 스토어 밖 앱이라 가능)·12는 `SCHEDULE_EXACT_ALARM`, RECEIVE_BOOT_COMPLETED. 정확한 시각 허락이 없으면 `setAndAllowWhileIdle`이라 절전 중에 한참 밀린다.
- 앱이 꺼져 있을 때 답 처리는 `HeadlessJobService`(JobScheduler, 12+는 expedited)에서 `HeadlessRunner`를 돌린다 (60초). 예전에는 BroadcastReceiver의 goAsync 안에서 9초 제한이었다.
- 삼성 폰은 배터리 설정이 "제한 없음"이 아니면 알람을 막을 수 있다 (사용자 안내).
- 실제 기기에서 아직 확인 못 함: 정확한 시각, 화면 없는 WebView가 9초 안에 끝나는지, 잠금 화면 버튼.

## 앱을 닫아도 이야기·음성 만들기 (2026-10-22)

- 사용자: 안드로이드 앱에서 이야기·음성을 만드는 동안 앱을 닫고 다른 일을 하고 싶다.
- `StoryJobService.java`: 포그라운드 서비스(dataSync, 알림 표시줄에 진행 상황). `HeadlessRunner`로 화면 없는 WebView를 켜고(렌더러 우선순위 IMPORTANT, 20분 제한) `task()`로 할 일(`{kind:'story'|'audio', …}`)을 넘긴다.
- 웹 쪽 `src/headless.ts`: task가 있으면 DB로 어휘를 만들고(`buildLexicon`) `runStory`·`runAudio`(adapters/stories/jobs.ts, 웹·서비스 워커와 같은 코드)로 만들어 저장. 진행 소식(JobEvent)은 `event(json)` → 서비스가 알림을 고치고 `BackgroundJobPlugin`으로 앱 화면에 넘긴다. 끝나면 "완성" 알림(누르면 앱).
- `src/ui/storyJob.ts`: 안드로이드 앱이면 먼저 서비스에 맡기고(`startNativeJob`), 안 되면(예전 APK) 서비스 워커·화면 안으로. 'finished' 소식이나 화면이 다시 보일 때 서비스가 끝나 있으면 저장된 이야기로 완성/실패를 맞춘다.
- 권한: FOREGROUND_SERVICE, FOREGROUND_SERVICE_DATA_SYNC.

## 알려진 한계 · 할 일

- **Google 로그인(Drive 동기화·백업):** Google은 앱 안 브라우저(WebView)의 로그인 창을 막는다 → 앱에서는 `NativeGooglePlugin`(play-services-auth의 `AuthorizationClient`)으로 drive.file·openid·email 권한 토큰을 받는다 (`auth.ts`의 `nativeToken`). 한 번 허용하면 창 없이 새 토큰을 받으므로 자동 동기화도 된다 (`silentToken`).
  사용자의 Google Cloud 프로젝트에 **Android OAuth 클라이언트**(패키지 `io.github.aminjhk.flashcards`, SHA-1 `AD:05:E5:15:2A:AE:BC:CB:A1:5A:54:2D:D5:0C:56:83:99:30:4B:6B`)가 있어야 한다. 앱의 Drive 연결 화면에 안내가 있다 (`AndroidClientHelp`). 브라우저용 클라이언트 ID는 그대로 입력한다 (토큰 캐시 키로만 쓰임). 실제 기기 확인 전.
- 브라우저 음성 인식(webkitSpeechRecognition)은 WebView에 없다 → 말해서 답하기는 Gemini 받아쓰기로만.
- 복습 알림, Fish Audio 등은 다음 단계.
- 실제 기기에서 아직 확인 못 함.
