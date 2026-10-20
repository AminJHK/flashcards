import { ScreenSync } from '../components/ScreenSync';
import { useEffect, useState } from 'react';
import type { AccentKey, FontScale, Settings as SettingsT, ThemePref } from '../../core/model/types';
import { requestPersistence } from '../../adapters/files/share';
import { chooseScheduler, saveSettings } from '../../adapters/storage/repo';
import { onVoicesChanged, speak, SYSTEM_DEFAULT_VOICE, ttsSupported, voicesFor } from '../../adapters/tts/webSpeech';
import { daysSince, runBackup, runRestore, runStudyExport } from '../backup';
import { Row, Segmented, Stepper, Switch } from '../components/Controls';
import { useDecks, useScheduler, useSettings } from '../hooks';
import { Icon, type IconName } from '../components/Icon';
import { go } from '../router';
import { langName, noVoiceMessage } from '../langs';
import { ACCENTS, prefersDark } from '../theme';
import { useToast } from '../toast';
import { usePwaInstall } from '../usePwaInstall';
import { applyUpdate, currentVersion, fetchLatestVersion } from '../../adapters/update/update';
import { DriveSettings } from './DriveSettings';
import { GeminiSettings, VoiceTest } from './GeminiSettings';
import { fullscreenSupported } from '../../adapters/display/fullscreen';
import { isNativeApp } from '../../adapters/native/platform';
import { nativeEngines, nativeVoices, voiceChoices, type NativeEngine, type NativeVoice } from '../../adapters/tts/nativeTts';
import { speakDevice } from '../../adapters/tts/device';
import { notifyPermissions, openExactAlarmSettings, requestNotifyPermission, scheduleAlarms } from '../../adapters/native/reviewNotify';
import { DEFAULT_NOTIFY_PREFS } from '../../core/notify/plan';

const SAMPLE: Record<string, string> = {
  'zh-CN': '你好，我们一起学习中文吧。',
  'id-ID': 'Selamat pagi, apa kabar?',
  'ko-KR': '안녕하세요, 오늘도 화이팅!',
  'en-US': 'Hello, nice to meet you.',
  'ja-JP': 'こんにちは、よろしくお願いします。',
  'es-ES': 'Hola, ¿dónde está la estación de tren?',
};

type Section = 'study' | 'display' | 'voice' | 'backup' | 'about';

const SECTIONS: { key: Section; title: string; icon: IconName }[] = [
  { key: 'study', title: '복습', icon: 'decks' },
  { key: 'voice', title: '음성', icon: 'speaker' },
  { key: 'display', title: '화면', icon: 'sun' },
  { key: 'backup', title: '백업·동기화', icon: 'cloud' },
  { key: 'about', title: '앱 정보', icon: 'info' },
];

const THEME_LABEL: Record<ThemePref, string> = { system: '시스템 테마', light: '라이트', dark: '다크' };
const FONT_LABEL: Record<FontScale, string> = { s: '글자 작게', m: '글자 보통', l: '글자 크게' };

/** 설정: 첫 화면은 항목 목록(지금 상태 요약)만, 누르면 그 항목의 상세 화면 (#/settings/voice 등) */
export function Settings({ section }: { section?: string }) {
  const s = useSettings();
  const decks = useDecks();
  if (!s || !decks) return <div className="screen" />;
  const sec = SECTIONS.find((x) => x.key === section);
  if (!sec) return <SettingsHub s={s} />;
  return (
    <div className="screen" style={{ gap: 12 }}>
      <ScreenSync />
      <button type="button" className="back-btn" onClick={() => go('settings')}>
        <Icon name="chevronLeft" size={20} />
        설정
      </button>
      <div className="screen-head" style={{ marginBottom: 6 }}>
        <h1 className="title">{sec.title}</h1>
      </div>
      {sec.key === 'study' && <StudySettings s={s} />}
      {sec.key === 'study' && isNativeApp() && <ReviewNotifySettings s={s} />}
      {sec.key === 'display' && <DisplaySettings s={s} />}
      {sec.key === 'voice' && <VoiceSettings s={s} />}
      {sec.key === 'backup' && <BackupSettings s={s} />}
      {sec.key === 'about' && <AboutSettings />}
    </div>
  );
}

function summary(key: Section, s: SettingsT): string {
  if (key === 'study') return `답 버튼 ${s.buttons}개 · 목표 기억률 ${Math.round(s.desiredRetention * 100)}% · 미리 보기 ${s.learnAheadMin ? `${s.learnAheadMin}분` : '끔'}`;
  if (key === 'display') return `${THEME_LABEL[s.theme]} · ${FONT_LABEL[s.fontScale]}`;
  if (key === 'voice') {
    if (!s.gemini?.apiKey) return '기기 음성 · Gemini 연결 안 됨';
    if (!s.gemini.useTts) return 'Gemini 연결됨 · 음성은 기기 음성';
    return `Gemini 연결됨 · ${s.gemini.cardTts ? '이야기·단어 카드' : '이야기 읽기'}에 사용`;
  }
  if (key === 'backup') {
    if (s.googleDrive?.clientId) return `Google Drive 연결됨${s.googleDrive.email ? ` · ${s.googleDrive.email}` : ''}`;
    const days = daysSince(s.lastBackupAt);
    return days === undefined ? '아직 백업하지 않았어요' : days === 0 ? '오늘 백업했어요' : `마지막 백업 ${days}일 전`;
  }
  return `버전 ${currentVersion()}`;
}

function SettingsHub({ s }: { s: SettingsT }) {
  const backupWarn = !s.googleDrive?.clientId && (daysSince(s.lastBackupAt) ?? 99) >= 7;
  return (
    <div className="screen" style={{ gap: 12 }}>
      <ScreenSync />
      <div className="screen-head" style={{ marginBottom: 6 }}>
        <h1 className="title">설정</h1>
      </div>
      <div className="group">
        {SECTIONS.map((x) => (
          <button key={x.key} type="button" className="row nav-row" onClick={() => go(`settings/${x.key}`)}>
            <span className="nav-icon" aria-hidden="true">
              <Icon name={x.icon} size={20} />
            </span>
            <span className="row-text">
              <span className="row-title">{x.title}</span>
              <span className="row-desc" style={x.key === 'backup' && backupWarn ? { color: 'var(--again)' } : undefined}>
                {summary(x.key, s)}
              </span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function StudySettings({ s }: { s: SettingsT }) {
  const scheduler = useScheduler(s);
  const toast = useToast();
  const set = (patch: Partial<SettingsT>) => saveSettings(patch);
  return (
    <div className="group">
      <Row col title="답 버튼">
        <Segmented<2 | 4>
          label="답 버튼"
          options={[
            [2, '2개 · 다시/알았음'],
            [4, '4개'],
          ]}
          value={s.buttons}
          onChange={(v) => set({ buttons: v })}
        />
      </Row>
      <Row title="목표 기억률" desc="높이면 덜 잊지만 복습이 늘어요. 보통 90%.">
        <Stepper label="목표 기억률" value={Math.round(s.desiredRetention * 100)} min={80} max={97} format={(v) => `${v}%`} onChange={(v) => set({ desiredRetention: v / 100 })} />
      </Row>
      <Row col title="기다리는 카드 미리 보기" desc="'몇 분 뒤 다시' 카드만 남았을 때, 이 시간 안이면 기다리지 않고 바로 보여 줘요.">
        <Segmented<number>
          label="기다리는 카드 미리 보기"
          options={[
            [0, '끄기'],
            [5, '5분'],
            [20, '20분'],
          ]}
          value={s.learnAheadMin}
          onChange={(v) => set({ learnAheadMin: v })}
        />
      </Row>
      <Row title="하루 시작" desc="이 시각에 '오늘'이 바뀌어요">
        <Stepper label="하루 시작 시각" value={s.dayStartHour} min={0} max={8} format={(v) => (v === 0 ? '자정' : `새벽 ${v}시`)} onChange={(v) => set({ dayStartHour: v })} />
      </Row>
      <Row col title="알고리즘" desc="복습 날짜를 계산하는 방법이에요. 바꾸면 지금까지의 복습 기록으로 다시 계산해서 기록은 그대로예요. FSRS-7은 최신 방법(시험판)이에요.">
        <Segmented<string>
          label="알고리즘"
          options={[
            ['fsrs-7', 'FSRS-7'],
            ['fsrs-6', 'FSRS-6'],
          ]}
          value={scheduler.id}
          onChange={(v) => {
            if (v === scheduler.id) return;
            void chooseScheduler(v).then(
              () => toast(`${v === 'fsrs-7' ? 'FSRS-7로' : 'FSRS-6으로'} 바꾸고 다시 계산했어요`),
              () => toast('바꾸지 못했어요. 다시 시도해 주세요'),
            );
          }}
        />
      </Row>
    </div>
  );
}

/**
 * 안드로이드 앱의 복습 알림 (adapters/native/reviewNotify.ts). 켤 때 알림 허락을 묻는다.
 * 정확한 시간에 울리려면 "알람 및 리마인더" 허락이 따로 필요하다 (안드로이드 12+).
 */
function ReviewNotifySettings({ s }: { s: SettingsT }) {
  const toast = useToast();
  const n = { ...DEFAULT_NOTIFY_PREFS, ...s.reviewNotify, enabled: s.reviewNotify?.enabled === true };
  const [perm, setPerm] = useState<{ notifications: boolean; exact: boolean }>();
  useEffect(() => {
    const refresh = () => void notifyPermissions().then(setPerm, () => {});
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  const set = (patch: Partial<typeof n>) => saveSettings({ reviewNotify: { ...n, ...patch } });
  const hour = (h: number) => (h === 0 ? '자정' : h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : `오후 ${h - 12}시`);
  return (
    <>
      <span className="section-label" style={{ paddingTop: 8 }}>
        복습 알림
      </span>
      <div className="group">
        <Row title="복습 알림" desc="짧은 복습(1분·10분 뒤 등)은 그 시각에 카드 알림이 와요. 알림에서 뜻을 보고 바로 다시·어려움·알았음으로 답해요. 며칠 뒤 복습은 카드가 쌓이면 알려요. 앱을 보고 있을 때는 울리지 않아요.">
          <Switch
            label="복습 알림"
            checked={n.enabled}
            onChange={async (v) => {
              if (v) {
                const r = await requestNotifyPermission().catch(() => ({ notifications: false }));
                if (!r.notifications) {
                  toast('휴대폰 설정 › 애플리케이션 › 단어 카드 › 알림에서 허용해 주세요');
                  return;
                }
              }
              await set({ enabled: v });
              void scheduleAlarms().catch(() => {});
              void notifyPermissions().then(setPerm, () => {});
            }}
          />
        </Row>
        {n.enabled && perm && !perm.exact && (
          <Row title="정확한 시간에 울리기" desc="허용하지 않으면 휴대폰이 알림을 몇 분 늦게 울릴 수 있어요. 열리는 화면에서 '알람 및 리마인더'를 켜 주세요.">
            <button type="button" className="btn-soft" style={{ border: 'none' }} onClick={() => void openExactAlarmSettings()}>
              허용하기
            </button>
          </Row>
        )}
        {n.enabled && (
          <>
            <Row title="조용한 시간 시작" desc="이 시각부터는 울리지 않고, 끝나는 시각에 모아서 알려요">
              <Stepper label="조용한 시간 시작" value={n.quietStart} min={0} max={23} format={hour} onChange={(v) => set({ quietStart: v })} />
            </Row>
            <Row title="조용한 시간 끝">
              <Stepper label="조용한 시간 끝" value={n.quietEnd} min={0} max={23} format={hour} onChange={(v) => set({ quietEnd: v })} />
            </Row>
            <Row title="쌓임 알림" desc="며칠 간격 카드가 이만큼 쌓이면 알려요 (최소 3시간 간격, 하루 4번까지)">
              <Stepper label="쌓임 알림 기준" value={n.pileMin} min={5} max={100} step={5} format={(v) => `${v}장`} onChange={(v) => set({ pileMin: v })} />
            </Row>
          </>
        )}
      </div>
    </>
  );
}

function DisplaySettings({ s }: { s: SettingsT }) {
  const set = (patch: Partial<SettingsT>) => saveSettings(patch);
  const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark());
  return (
    <div className="group">
      <Row col title="테마">
        <Segmented<ThemePref>
          label="테마"
          options={[
            ['system', '시스템'],
            ['light', '라이트'],
            ['dark', '다크'],
          ]}
          value={s.theme}
          onChange={(v) => set({ theme: v })}
        />
      </Row>
      <Row title="강조 색">
        <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="강조 색">
          {(Object.keys(ACCENTS) as AccentKey[]).map((k) => (
            <button key={k} type="button" className="swatch" aria-label={ACCENTS[k].label} aria-pressed={s.accent === k} onClick={() => set({ accent: k })}>
              <span style={{ background: dark ? ACCENTS[k].dark : ACCENTS[k].light }} />
            </button>
          ))}
        </div>
      </Row>
      <Row col title="카드 글자 크기">
        <Segmented<FontScale>
          label="카드 글자 크기"
          options={[
            ['s', '작게'],
            ['m', '보통'],
            ['l', '크게'],
          ]}
          value={s.fontScale}
          onChange={(v) => set({ fontScale: v })}
        />
      </Row>
      <Row title="완전 검정 배경" desc="다크 모드에서 OLED 화면용">
        <Switch label="완전 검정 배경" checked={s.amoled} onChange={(v) => set({ amoled: v })} />
      </Row>
      {fullscreenSupported() && (
        <Row title="전체 화면" desc="상태 표시줄과 내비게이션 바를 숨겨요.">
          <Switch label="전체 화면" checked={s.immersive} onChange={(v) => set({ immersive: v })} />
        </Row>
      )}
    </div>
  );
}

function VoiceSettings({ s }: { s: SettingsT }) {
  const decks = useDecks() ?? [];
  // 덱에서 쓰는 언어 + 중국어·인도네시아어
  const langs = [...new Set(['zh-CN', 'id-ID', ...decks.flatMap((d) => [d.settings.langs.front, d.settings.langs.back]).filter((l) => l !== 'ko-KR')])];
  return (
    <>
      <span className="section-label">Gemini (자연스러운 음성 · 무료 키)</span>
      <GeminiSettings s={s} />
      {s.gemini?.apiKey && <VoiceTest s={s} />}
      <span className="section-label" style={{ paddingTop: 8 }}>
        기기 음성 {s.gemini?.apiKey ? '· 단어 카드와 Gemini를 못 쓸 때' : ''}
      </span>
      {isNativeApp() ? <NativeVoiceSettings s={s} langs={langs} /> : <WebVoiceSettings s={s} langs={langs} />}
    </>
  );
}

/** 브라우저(PWA)의 기기 음성: Web Speech. 엔진은 휴대폰 설정을 따르고, 속도·높낮이는 앱이 정한다 */
function WebVoiceSettings({ s, langs }: { s: SettingsT; langs: string[] }) {
  const toast = useToast();
  const [, setVoicesTick] = useState(0);
  useEffect(() => onVoicesChanged(() => setVoicesTick((n) => n + 1)), []);
  const set = (patch: Partial<SettingsT>) => saveSettings(patch);
  return (
    <>
      <div className="group">
        {!ttsSupported() && <Row title="이 브라우저에서는 발음을 쓸 수 없어요" desc="안드로이드 Chrome에서 열어 주세요." />}
        {ttsSupported() &&
          langs.map((lang) => {
            const voices = voicesFor(lang);
            const saved = s.voices[lang];
            // 목록에 음성이 있으면 고른 목소리가 없을 때 "휴대폰 기본 목소리". 목록에 없으면 기본은 "읽지 않음"(영어 음성이 억지로 읽지 않게)이고,
            // "휴대폰 기본 목소리"를 고르면 그래도 엔진에 맡겨 읽어 본다 (목록을 덜 보여 주는 브라우저용)
            const value = voices.some((v) => v.name === saved) ? saved! : voices.length || saved === SYSTEM_DEFAULT_VOICE ? SYSTEM_DEFAULT_VOICE : '';
            return (
              <Row key={lang} title={langName(lang)} desc={voices.length ? undefined : '이 언어 음성이 안 보여요. 휴대폰 설정 › 텍스트 음성 변환에서 설치하거나, "휴대폰 기본 목소리"로 읽어 보세요.'}>
                <select
                  className="select"
                  aria-label={`${langName(lang)} 음성`}
                  value={value}
                  onChange={(e) => {
                    const { [lang]: _old, ...rest } = s.voices;
                    set({ voices: e.target.value ? { ...rest, [lang]: e.target.value } : rest });
                  }}
                >
                  {!voices.length && <option value="">읽지 않기</option>}
                  <option value={SYSTEM_DEFAULT_VOICE}>휴대폰 기본 목소리</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-plain"
                  style={{ border: 'none' }}
                  onClick={() => {
                    if (!speak([{ text: SAMPLE[lang] ?? 'Hello', lang }], s.voices, s.deviceRate ?? 0.9, s.devicePitch ?? 1)) toast(noVoiceMessage([lang]));
                  }}
                >
                  듣기
                </button>
              </Row>
            );
          })}
      </div>
      {ttsSupported() && (
        <>
          <div className="group">
            <Row title="속도" desc="단어 카드를 읽는 빠르기예요. 이야기 읽기 속도는 읽기 화면의 톱니에서 따로 정해요.">
              <Stepper label="기기 음성 속도" value={Math.round((s.deviceRate ?? 0.9) * 100)} min={50} max={150} step={5} format={(v) => `${(v / 100).toFixed(2)}배`} onChange={(v) => set({ deviceRate: v / 100 })} />
            </Row>
            <Row title="높낮이" desc="1.00이 보통이에요. 낮추면 차분하고 낮은 목소리가 돼요. 단어 카드와 이야기 모두에 적용돼요.">
              <Stepper label="기기 음성 높낮이" value={Math.round((s.devicePitch ?? 1) * 100)} min={50} max={150} step={5} format={(v) => (v / 100).toFixed(2)} onChange={(v) => set({ devicePitch: v / 100 })} />
            </Row>
          </div>
          <span className="faint small" style={{ padding: '0 4px', lineHeight: 1.6 }}>
            휴대폰 설정(텍스트 음성 변환)의 속도·높낮이는 앱에서 쓰이지 않아요. 브라우저가 앱의 값을 직접 보내기 때문이에요. 어떤 엔진(삼성, 구글 등)으로 읽을지는 휴대폰 설정의 기본 엔진을 따라요.
          </span>
        </>
      )}
    </>
  );
}

function BackupSettings({ s }: { s: SettingsT }) {
  const toast = useToast();
  const [persisted, setPersisted] = useState<boolean>();
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false));
  }, []);
  const backupDays = daysSince(s.lastBackupAt);
  return (
    <>
      <span className="section-label">Google Drive (폰·PC 동기화)</span>
      <DriveSettings s={s} />
      <span className="section-label" style={{ paddingTop: 8 }}>
        백업 파일
      </span>
      <div className="group">
        <Row title="백업 파일로 저장" desc={backupDays === undefined ? '아직 백업하지 않았어요' : backupDays === 0 ? '오늘 백업했어요' : `마지막 백업 ${backupDays}일 전`}>
          <button type="button" className="btn-soft" style={{ border: 'none' }} onClick={() => runBackup(toast)}>
            지금 백업
          </button>
        </Row>
        <Row title="백업 파일로 복원" desc="지금 데이터는 백업 내용으로 바뀌어요">
          <button type="button" className="btn-plain" style={{ border: 'none' }} onClick={() => runRestore(toast)}>
            파일 고르기
          </button>
        </Row>
        <Row title="AI에게 보여 줄 학습 기록" desc="단어마다 상태·떠올릴 확률·복습 횟수·틀린 횟수·최근 답이 한 줄씩 든 파일(CSV)이에요. ChatGPT 같은 AI에 첨부하면 내 기록을 보고 덱을 고칠 곳을 찾아 줘요. 파일은 직접 보낼 때만 나가요.">
          <button type="button" className="btn-plain" style={{ border: 'none' }} onClick={() => runStudyExport(toast)}>
            내보내기
          </button>
        </Row>
        <Row title="영구 저장" desc={persisted ? '브라우저가 이 앱의 데이터를 함부로 지우지 않아요.' : '저장 공간이 부족해도 데이터가 지워지지 않게 해요.'}>
          {persisted ? (
            <span className="faint" style={{ fontSize: 15 }}>
              켜짐
            </span>
          ) : (
            <button
              type="button"
              className="btn-plain"
              style={{ border: 'none' }}
              onClick={async () => {
                const ok = await requestPersistence();
                setPersisted(ok);
                toast(ok ? '영구 저장을 켰어요' : '브라우저가 허용하지 않았어요. 홈 화면에 설치한 뒤 다시 해 보세요');
              }}
            >
              켜기
            </button>
          )}
        </Row>
      </div>
      <span className="faint small" style={{ padding: '4px 4px 0', lineHeight: 1.6 }}>
        카드와 복습 기록은 이 기기에 저장돼요. Google Drive를 연결하지 않았다면 백업 파일로 옮기세요.
      </span>
    </>
  );
}

function AboutSettings() {
  return (
    <>
      <InstallRow />
      <div className="group">
        <UpdateRow />
      </div>
    </>
  );
}

/** 지금 깔린 버전과 수동 업데이트. 새 버전이 있으면 이 줄에만 알려 준다 (다른 화면에는 알림을 띄우지 않는다). 덱·기록은 그대로 */
function UpdateRow() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<string>();
  useEffect(() => {
    void fetchLatestVersion().then((v) => v && v !== currentVersion() && setLatest(v));
  }, []);
  const check = async () => {
    setBusy(true);
    const v = latest ?? (await fetchLatestVersion());
    if (!v) {
      toast('버전을 확인하지 못했어요. 인터넷 연결을 확인해 주세요');
    } else if (v === currentVersion()) {
      toast('최신 버전이에요');
    } else {
      toast(`새 버전(${v})으로 업데이트해요`);
      await applyUpdate(v);
      return;
    }
    setBusy(false);
  };
  return (
    <Row title={`버전 ${currentVersion()}`} desc={latest ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>새 버전 {latest}이 있어요</span> : '새 버전이 나오면 여기서 업데이트해요. 덱과 기록은 그대로예요.'}>
      <button type="button" className={latest ? 'btn-soft' : 'btn-plain'} style={{ border: 'none' }} onClick={check} disabled={busy}>
        {busy ? '확인 중…' : latest ? '지금 업데이트' : '업데이트 확인'}
      </button>
    </Row>
  );
}

/** 컴퓨터·폰에 앱 아이콘으로 설치 (브라우저 주소창 없이 바로 열린다) */
function InstallRow() {
  const { installed, canInstall, install } = usePwaInstall();
  const toast = useToast();
  return (
    <div className="group">
      <Row
        title="앱으로 설치"
        desc={
          installed
            ? '앱으로 열려 있어요. 이 창이 앱 창이에요.'
            : canInstall
              ? '시작 메뉴·바탕화면 아이콘으로 바로 열 수 있어요. 지금까지의 덱과 기록은 그대로 쓰여요.'
              : '크롬·엣지 주소창 오른쪽의 설치 아이콘(⊕ 또는 모니터 모양)을 누르거나, 메뉴(⋮) › 앱으로 설치를 고르세요.'
        }
      >
        {!installed && canInstall && (
          <button type="button" className="btn-soft" style={{ border: 'none' }} onClick={async () => toast((await install()) ? '설치했어요' : '설치하지 않았어요')}>
            설치
          </button>
        )}
      </Row>
    </div>
  );
}

/**
 * 안드로이드 앱의 기기 음성: 음성 엔진(삼성, 구글 …)과 엔진 안의 목소리를 고르고,
 * 속도·높낮이는 기본으로 휴대폰 설정(텍스트 음성 변환) 값을 그대로 쓴다.
 */
function NativeVoiceSettings({ s, langs }: { s: SettingsT; langs: string[] }) {
  const toast = useToast();
  const n = s.nativeTts ?? {};
  const [engines, setEngines] = useState<{ engines: NativeEngine[]; defaultEngine: string }>();
  const [voices, setVoices] = useState<Record<string, NativeVoice[]>>({});
  const engine = n.engine || engines?.defaultEngine;
  const set = (patch: Partial<NonNullable<SettingsT['nativeTts']>>) => saveSettings({ nativeTts: { ...n, ...patch } });
  useEffect(() => {
    nativeEngines()
      .then(setEngines)
      .catch(() => setEngines({ engines: [], defaultEngine: '' }));
  }, []);
  useEffect(() => {
    if (!engines) return;
    let alive = true;
    void Promise.all(langs.map(async (l) => [l, await nativeVoices(l, engine).catch(() => [])] as const)).then((r) => alive && setVoices(Object.fromEntries(r)));
    return () => {
      alive = false;
    };
  }, [engines, engine, langs.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const system = n.systemRatePitch !== false;
  return (
    <>
      <div className="group">
        <Row title="음성 엔진" desc="휴대폰에 설치된 엔진 중에서 골라요. 삼성 음성 엔진은 삼성 앱(삼성 인터넷 등)에서만 쓸 수 있게 막혀 있어서 이 앱 목록에는 안 나와요.">
          <select className="select" aria-label="음성 엔진" value={engine ?? ''} onChange={(e) => set({ engine: e.target.value, voices: {} })}>
            {(engines?.engines ?? []).map((e) => (
              <option key={e.name} value={e.name}>
                {e.label}
              </option>
            ))}
          </select>
        </Row>
        {langs.map((lang) => {
          const list = voiceChoices(voices[lang] ?? []);
          const saved = n.voices?.[lang];
          return (
            <Row key={lang} title={langName(lang)}>
              <select
                className="select"
                aria-label={`${langName(lang)} 음성`}
                value={list.find((v) => saved && v.members.includes(saved))?.name ?? ''}
                onChange={(e) => {
                  const { [lang]: _old, ...rest } = n.voices ?? {};
                  set({ voices: e.target.value ? { ...rest, [lang]: e.target.value } : rest });
                }}
              >
                <option value="">엔진 기본 목소리</option>
                {list.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-plain"
                style={{ border: 'none' }}
                onClick={async () => {
                  if (!(await speakDevice([{ text: SAMPLE[lang] ?? 'Hello', lang }], s))) toast(`이 엔진에는 ${langName(lang)} 음성이 없어요. 다른 엔진을 고르거나 엔진 설정에서 음성을 내려받아 주세요.`);
                }}
              >
                듣기
              </button>
            </Row>
          );
        })}
      </div>
      <div className="group">
        <Row title="휴대폰 설정의 속도·높낮이 쓰기" desc="켜 두면 휴대폰 설정 › 텍스트 음성 변환에서 맞춘 속도와 높낮이로 읽어요. 이야기 읽기도 같아요.">
          <Switch label="휴대폰 설정의 속도·높낮이 쓰기" checked={system} onChange={(v) => set({ systemRatePitch: v })} />
        </Row>
        {!system && (
          <>
            <Row title="속도" desc="단어 카드를 읽는 빠르기예요. 이야기 읽기 속도는 읽기 화면의 톱니에서 따로 정해요.">
              <Stepper label="기기 음성 속도" value={Math.round((s.deviceRate ?? 0.9) * 100)} min={50} max={150} step={5} format={(v) => `${(v / 100).toFixed(2)}배`} onChange={(v) => saveSettings({ deviceRate: v / 100 })} />
            </Row>
            <Row title="높낮이" desc="1.00이 보통이에요. 낮추면 차분하고 낮은 목소리가 돼요.">
              <Stepper label="기기 음성 높낮이" value={Math.round((s.devicePitch ?? 1) * 100)} min={50} max={150} step={5} format={(v) => (v / 100).toFixed(2)} onChange={(v) => saveSettings({ devicePitch: v / 100 })} />
            </Row>
          </>
        )}
      </div>
    </>
  );
}
