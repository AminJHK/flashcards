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
            rec.current = await startRecording();
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
      const l = listen(lang);
      web.current = l;
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
          go('idle');
        });
    },
    [useGemini, settings, onText, onError],
  );

  return { supported, state, toggle, cancel, viaGemini: useGemini };
}
