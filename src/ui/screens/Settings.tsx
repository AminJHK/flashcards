import { useEffect, useState } from 'react';
import type { AccentKey, FontScale, Settings as SettingsT, ThemePref } from '../../core/model/types';
import { requestPersistence } from '../../adapters/files/share';
import { saveSettings } from '../../adapters/storage/repo';
import { onVoicesChanged, speak, ttsSupported, voicesFor } from '../../adapters/tts/webSpeech';
import { daysSince, runBackup, runRestore } from '../backup';
import { Row, Segmented, Stepper, Switch } from '../components/Controls';
import { useDecks, useScheduler, useSettings } from '../hooks';
import { langName } from '../langs';
import { ACCENTS, prefersDark } from '../theme';
import { useToast } from '../toast';
import { DriveSettings } from './DriveSettings';
import { GeminiSettings, VoiceTest } from './GeminiSettings';

const SAMPLE: Record<string, string> = {
  'zh-CN': '你好，我们一起学习中文吧。',
  'id-ID': 'Selamat pagi, apa kabar?',
  'ko-KR': '안녕하세요, 오늘도 화이팅!',
  'en-US': 'Hello, nice to meet you.',
  'ja-JP': 'こんにちは、よろしくお願いします。',
};

export function Settings() {
  const s = useSettings();
  const decks = useDecks();
  const scheduler = useScheduler(s);
  const toast = useToast();
  const [, setVoicesTick] = useState(0);
  const [persisted, setPersisted] = useState<boolean>();

  useEffect(() => onVoicesChanged(() => setVoicesTick((n) => n + 1)), []);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false));
  }, []);

  if (!s || !decks) return <div className="screen" />;
  const set = (patch: Partial<SettingsT>) => saveSettings(patch);
  const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark());

  // 덱에서 쓰는 언어 + 중국어·인도네시아어
  const langs = [...new Set(['zh-CN', 'id-ID', ...decks.flatMap((d) => [d.settings.langs.front, d.settings.langs.back]).filter((l) => l !== 'ko-KR')])];
  const backupDays = daysSince(s.lastBackupAt);

  return (
    <div className="screen" style={{ gap: 12 }}>
      <div className="screen-head" style={{ marginBottom: 6 }}>
        <h1 className="title">설정</h1>
      </div>

      <span className="section-label">
        자연스러운 음성
      </span>
      <GeminiSettings s={s} />
      <VoiceTest s={s} />

      <span className="section-label" style={{ paddingTop: 8 }}>화면</span>
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
        <Row title="완전 검정 배경" desc="다크 모드에서 OLED 화면용">
          <Switch label="완전 검정 배경" checked={s.amoled} onChange={(v) => set({ amoled: v })} />
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
      </div>

      <span className="section-label" style={{ paddingTop: 8 }}>
        복습
      </span>
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
        <Row title="목표 기억률" desc="높이면 덜 잊지만 복습이 늘어요. 보통 90%를 권해요.">
          <Stepper label="목표 기억률" value={Math.round(s.desiredRetention * 100)} min={80} max={97} format={(v) => `${v}%`} onChange={(v) => set({ desiredRetention: v / 100 })} />
        </Row>
        <Row title="하루 시작" desc="이 시각에 '오늘'이 바뀌어요">
          <Stepper label="하루 시작 시각" value={s.dayStartHour} min={0} max={8} format={(v) => (v === 0 ? '자정' : `새벽 ${v}시`)} onChange={(v) => set({ dayStartHour: v })} />
        </Row>
        <Row title="알고리즘" desc="FSRS-7은 라이브러리 정식판이 나오면 추가해요. 바꿔도 기록으로 다시 계산해요.">
          <span className="faint" style={{ fontSize: 15 }}>
            {scheduler.label}
          </span>
        </Row>
      </div>

      <span className="section-label" style={{ paddingTop: 8 }}>
        기기 음성 {s.gemini?.apiKey ? '(Gemini를 못 쓸 때 대신 읽어요)' : ''}
      </span>
      <div className="group">
        {!ttsSupported() && <Row title="이 브라우저에서는 발음을 쓸 수 없어요" desc="안드로이드 Chrome에서 열어 주세요." />}
        {ttsSupported() &&
          langs.map((lang) => {
            const voices = voicesFor(lang);
            return (
              <Row key={lang} title={langName(lang)} desc={voices.length ? undefined : '음성이 없어요. 안드로이드 설정 › 텍스트 음성 변환에서 음성 데이터를 설치해 주세요.'}>
                {voices.length > 0 && (
                  <select
                    className="select"
                    aria-label={`${langName(lang)} 음성`}
                    value={s.voices[lang] ?? voices[0]!.name}
                    onChange={(e) => set({ voices: { ...s.voices, [lang]: e.target.value } })}
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn-plain" style={{ border: 'none' }} onClick={() => speak([{ text: SAMPLE[lang] ?? 'Hello', lang }], s.voices)}>
                  듣기
                </button>
              </Row>
            );
          })}
      </div>

      <span className="section-label" style={{ paddingTop: 8 }}>
        데이터
      </span>
      <DriveSettings s={s} />
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
        <Row
          title="영구 저장"
          desc={persisted ? '브라우저가 이 앱의 데이터를 함부로 지우지 않아요.' : '켜 두면 저장 공간이 부족해도 데이터가 지워지지 않아요. 홈 화면에 설치하면 보통 허용돼요.'}
        >
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
        카드와 복습 기록은 이 기기에만 저장돼요. 다른 기기로 옮기려면 백업 파일을 쓰세요.
      </span>
    </div>
  );
}
