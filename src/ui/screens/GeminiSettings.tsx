import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import type { Settings } from '../../core/model/types';
import { GeminiError, listModels, pickModel } from '../../adapters/gemini/api';
import { GEMINI_VOICES, synthesize, TTS_MODELS } from '../../adapters/gemini/tts';
import { generateAll, missingClips, play } from '../../adapters/speech/speech';
import { saveSettings } from '../../adapters/storage/repo';
import { Row, Switch } from '../components/Controls';
import { Icon } from '../components/Icon';
import { useVoiceAnswer } from '../useVoiceAnswer';
import { useToast } from '../toast';

const AI_STUDIO = 'https://aistudio.google.com/apikey';

const SAMPLES = [
  { text: '你好，我们一起学习中文吧。', lang: 'zh-CN' },
  { text: 'Selamat pagi, apa kabar?', lang: 'id-ID' },
];

export function GeminiSettings({ s }: { s: Settings }) {
  const g = s.gemini;
  return g?.apiKey ? <Connected s={s} g={g} /> : <Connect />;
}

function Connect() {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    const k = key.trim();
    if (!k) {
      toast('복사한 키를 붙여넣어 주세요');
      return;
    }
    setBusy(true);
    try {
      const models = await listModels(k);
      const ttsModel = pickModel(models, TTS_MODELS, /-tts/);
      if (!ttsModel) throw new GeminiError('이 키로는 음성 모델을 쓸 수 없어요', 'model');
      // 실제로 소리가 나는지 한 번 확인한다
      const blob = await synthesize('你好', 'zh-CN', 'Kore', ttsModel, k);
      await saveSettings({ gemini: { apiKey: k, ttsModel, voice: 'Kore', useTts: true, useStt: true } });
      void new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      toast('연결했어요. 이제 자연스러운 음성으로 읽어줘요');
    } catch (e) {
      toast(e instanceof Error ? e.message : '연결하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group">
      <Row col title="자연스러운 음성 연결하기 (무료)" desc="Google Gemini로 사람처럼 자연스럽게 읽어주고, 말한 답도 정확하게 받아써요. 무료 키 하나만 연결하면 돼요.">
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.55 }} className="muted">
          <li>
            아래 버튼을 눌러 Google AI Studio를 열고, Google 계정으로 로그인해요.
          </li>
          <li>
            <strong>API 키 만들기</strong>(Create API key)를 누르고, 만들어진 키 옆의 <strong>복사</strong>를 눌러요.
          </li>
          <li>이 앱으로 돌아와서 아래 칸에 붙여넣고 <strong>연결</strong>을 눌러요.</li>
        </ol>
        <a className="btn btn-soft" href={AI_STUDIO} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', fontWeight: 600 }}>
          Google AI Studio 열기
        </a>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            aria-label="Gemini API 키"
            placeholder="여기에 키 붙여넣기"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, fontSize: 15 }}
          />
          <button type="button" className="btn-plain" onClick={connect} disabled={busy} style={{ height: 52, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 }}>
            {busy ? '확인 중…' : '연결'}
          </button>
        </div>
        <span className="row-desc">
          카드 결제 정보는 필요 없어요. 키는 이 폰에만 저장되고 백업 파일에도 들어가지 않아요. 무료로 쓰면 Google이 보낸 단어와 녹음을 서비스 개선에 쓸 수 있어요.
        </span>
      </Row>
    </div>
  );
}

function Connected({ s, g }: { s: Settings; g: NonNullable<Settings['gemini']> }) {
  const toast = useToast();
  const set = (patch: Partial<NonNullable<Settings['gemini']>>) => saveSettings({ gemini: { ...g, ...patch } });
  const missing = useLiveQuery(() => missingClips(s), [s]);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const signal = useRef({ cancelled: false });

  const runAll = async () => {
    signal.current = { cancelled: false };
    const r = await generateAll(s, (done, total) => setProgress({ done, total }), signal.current);
    setProgress(undefined);
    if (r.stopped) toast(`${r.done}개 만들고 멈췄어요 · ${r.stopped}`);
    else if (!signal.current.cancelled) toast(r.total ? `음성 ${r.done}개를 만들었어요` : '모든 단어에 음성이 있어요');
  };

  const disconnect = () => {
    if (!window.confirm('Gemini 연결을 끊을까요? 이미 만든 음성은 계속 쓸 수 있어요.')) return;
    void saveSettings({ gemini: undefined });
  };

  const voiceName = GEMINI_VOICES.find(([v]) => v === g.voice)?.[1] ?? g.voice;

  return (
    <div className="group">
      <Row title="Gemini 음성으로 읽기" desc={`연결됨 · ${g.ttsModel}`}>
        <Switch label="Gemini 음성으로 읽기" checked={g.useTts} onChange={(v) => set({ useTts: v })} />
      </Row>
      <Row title="목소리" desc={voiceName}>
        <select className="select" aria-label="Gemini 목소리" value={g.voice} onChange={(e) => set({ voice: e.target.value })}>
          {GEMINI_VOICES.map(([v, label]) => (
            <option key={v} value={v}>
              {v} · {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-plain"
          onClick={async () => {
            const r = await play(SAMPLES, { ...s, gemini: { ...g, useTts: true } });
            if (r.error) toast(r.error);
          }}
        >
          듣기
        </button>
      </Row>
      <Row title="말한 답을 Gemini로 받아쓰기" desc="작문 카드에서 마이크로 답할 때 써요. 인터넷이 필요해요.">
        <Switch label="말한 답을 Gemini로 받아쓰기" checked={g.useStt} onChange={(v) => set({ useStt: v })} />
      </Row>
      <Row
        title="모든 단어 음성 미리 만들기"
        desc={
          progress
            ? `만드는 중… ${progress.done} / ${progress.total}`
            : missing === undefined
              ? '확인 중…'
              : missing.length
                ? `${missing.length}개 남았어요. 한 번 만들면 인터넷 없이도 들려요.`
                : '모든 단어에 음성이 있어요.'
        }
      >
        {progress ? (
          <button type="button" className="btn-plain" onClick={() => (signal.current.cancelled = true)}>
            멈추기
          </button>
        ) : (
          <button type="button" className="btn-soft" onClick={runAll} disabled={!missing?.length}>
            만들기
          </button>
        )}
      </Row>
      <Row title="연결 끊기" desc="키를 이 폰에서 지워요.">
        <button type="button" className="btn-plain" onClick={disconnect}>
          끊기
        </button>
      </Row>
    </div>
  );
}

/** 말하기 테스트: 실제 복습 화면과 같은 방법으로 녹음 → 받아쓰기를 해 보고 결과나 오류를 그대로 보여준다. */
export function VoiceTest({ s }: { s: Settings }) {
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  const voice = useVoiceAnswer(
    s,
    (t) => setResult({ ok: true, text: t }),
    (m) => setResult({ ok: false, text: m }),
  );
  const how = voice.viaGemini ? 'Gemini로 받아써요' : '기기 음성 인식을 써요';
  const status =
    voice.state === 'starting'
      ? '마이크 준비 중…'
      : voice.state === 'listening'
        ? '듣고 있어요. "你好，我是护士" 하고 말한 뒤 다시 누르세요'
        : voice.state === 'transcribing'
          ? '알아듣는 중…'
          : result
            ? result.ok
              ? `들은 말: ${result.text}`
              : result.text
            : `중국어로 말해 보세요 · ${how}`;
  return (
    <div className="group">
      <Row title="말하기 테스트" desc={status}>
        <button
          type="button"
          className="icon-btn"
          aria-label={voice.state === 'listening' ? '말하기 끝내기' : '말하기 테스트 시작'}
          aria-pressed={voice.state === 'listening'}
          disabled={!voice.supported || voice.state === 'starting' || voice.state === 'transcribing'}
          onClick={() => {
            if (voice.state === 'idle') setResult(undefined);
            void voice.toggle('zh-CN');
          }}
          style={{
            background: voice.state === 'listening' ? 'var(--accent)' : 'var(--surface2)',
            color: voice.state === 'listening' ? 'var(--on-accent)' : 'var(--text2)',
          }}
        >
          <Icon name="mic" />
        </button>
      </Row>
    </div>
  );
}
