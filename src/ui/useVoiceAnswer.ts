import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '../core/model/types';
import { recorderSupported, startRecording, type Recording } from '../adapters/audio/recorder';
import { STT_MODELS, transcribe } from '../adapters/gemini/stt';
import { listen, SpeechError, sttSupported, type Listening } from '../adapters/stt/webSpeech';

export type VoiceState = 'idle' | 'starting' | 'listening' | 'transcribing';

const GEMINI_HINT = ' · 설정에서 자연스러운 음성(Gemini)을 연결하면 훨씬 잘 알아들어요';

/**
 * 말해서 답하기. Gemini가 연결돼 있으면 녹음 → Gemini 받아쓰기, 아니면 브라우저 음성 인식.
 * toggle(): 처음 누르면 듣기 시작, 다시 누르면 끝내고 글자로 바꾼다.
 * 결과가 없거나 실패하면 언제나 onError로 이유를 알린다 (조용히 끝나지 않게).
 */
export function useVoiceAnswer(settings: Settings | undefined, onText: (t: string) => void, onError: (m: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  /** 기기 음성 인식이 지금까지 알아들은 글자 (실시간) */
  const [partial, setPartial] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  const [maxMs, setMaxMs] = useState(60_000);
  const autoStop = useRef<() => void>(() => {});
  const stateRef = useRef<VoiceState>('idle');
  const rec = useRef<Recording | undefined>(undefined);
  const web = useRef<Listening | undefined>(undefined);
  const useGemini = !!settings?.gemini?.apiKey && settings.gemini.useStt && recorderSupported();
  const supported = useGemini || sttSupported();

  const go = (s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  };

  const cancel = useCallback(() => {
    rec.current?.cancel();
    web.current?.cancel();
    rec.current = undefined;
    web.current = undefined;
    stateRef.current = 'idle';
    setState('idle');
  }, []);

  useEffect(() => cancel, [cancel]);

  const toggle = useCallback(
    async (lang: string) => {
      const now = stateRef.current;
      if (now === 'starting' || now === 'transcribing') return; // 권한 창이 떠 있거나 받아쓰는 중

      if (useGemini) {
        if (now === 'idle') {
          go('starting');
          try {
            rec.current = await startRecording(undefined, () => autoStop.current());
            setStartedAt(rec.current.startedAt);
            setMaxMs(rec.current.maxMs);
            go('listening');
          } catch (e) {
            go('idle');
            onError((e as Error).message);
          }
          return;
        }
        const r = rec.current;
        rec.current = undefined;
        if (!r) return go('idle');
        go('transcribing');
        try {
          const audio = await r.stop();
          const text = await transcribe(audio, lang, STT_MODELS, settings!.gemini!.apiKey);
          if (text) onText(text);
          else onError('말소리를 알아듣지 못했어요. 조금 더 크게, 가까이서 말해 보세요');
        } catch (e) {
          onError((e as Error).message || '받아쓰지 못했어요');
        } finally {
          go('idle');
        }
        return;
      }

      // 브라우저 음성 인식
      if (now === 'listening') {
        go('transcribing');
        web.current?.stop();
        return;
      }
      setPartial('');
      const l = listen(lang, setPartial);
      web.current = l;
      setStartedAt(l.startedAt);
      setMaxMs(l.maxMs);
      go('listening');
      l.result
        .then((t) => t && onText(t))
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : '알아듣지 못했어요';
          const blocked = e instanceof SpeechError && ['service-not-allowed', 'empty', 'network', 'language-not-supported', 'start', 'no-speech'].includes(e.code);
          onError(blocked ? msg + GEMINI_HINT : msg);
        })
        .finally(() => {
          web.current = undefined;
          setPartial('');
          go('idle');
        });
    },
    [useGemini, settings, onText, onError],
  );

  // 최대 녹음 시간이 되면 직접 멈춘 것처럼 받아쓴다
  const lastLang = useRef('zh-CN');
  autoStop.current = () => {
    if (stateRef.current === 'listening') void toggle(lastLang.current);
  };
  const toggleWithLang = useCallback(
    (lang: string) => {
      lastLang.current = lang;
      return toggle(lang);
    },
    [toggle],
  );
  /** 지금 소리 크기 0~1. 기기 음성 인식은 소리 크기를 알 수 없어서 -1 */
  const level = useCallback(() => (rec.current ? rec.current.level() : -1), []);

  return { supported, state, toggle: toggleWithLang, cancel, viaGemini: useGemini, partial, startedAt, maxMs, level };
}
