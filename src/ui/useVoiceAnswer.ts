import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '../core/model/types';
import { recorderSupported, startRecording, type Recording } from '../adapters/audio/recorder';
import { STT_MODELS, transcribe } from '../adapters/gemini/stt';
import { listen, sttSupported, type Listening } from '../adapters/stt/webSpeech';

export type VoiceState = 'idle' | 'listening' | 'transcribing';

/**
 * 말해서 답하기. Gemini가 연결돼 있으면 녹음 → Gemini 받아쓰기, 아니면 브라우저 음성 인식.
 * toggle(): 처음 누르면 듣기 시작, 다시 누르면 끝내고 글자로 바꾼다.
 */
export function useVoiceAnswer(settings: Settings | undefined, onText: (t: string) => void, onError: (m: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const rec = useRef<Recording | undefined>(undefined);
  const web = useRef<Listening | undefined>(undefined);
  const useGemini = !!settings?.gemini?.apiKey && settings.gemini.useStt && recorderSupported();
  const supported = useGemini || sttSupported();

  const cancel = useCallback(() => {
    rec.current?.cancel();
    web.current?.cancel();
    rec.current = undefined;
    web.current = undefined;
    setState('idle');
  }, []);

  useEffect(() => cancel, [cancel]);

  const toggle = useCallback(
    async (lang: string) => {
      if (state === 'transcribing') return;
      if (useGemini) {
        if (!rec.current) {
          try {
            rec.current = await startRecording();
            setState('listening');
          } catch (e) {
            onError((e as Error).message);
          }
          return;
        }
        const r = rec.current;
        rec.current = undefined;
        setState('transcribing');
        try {
          const wav = await r.stop();
          const text = await transcribe(wav, lang, STT_MODELS, settings!.gemini!.apiKey);
          if (text) onText(text);
          else onError('잘 듣지 못했어요. 다시 말해 주세요');
        } catch (e) {
          onError((e as Error).message || '받아쓰지 못했어요');
        } finally {
          setState('idle');
        }
        return;
      }
      // 브라우저 음성 인식
      if (web.current) {
        cancel();
        return;
      }
      const l = listen(lang);
      web.current = l;
      setState('listening');
      l.result
        .then((t) => t && onText(t))
        .catch((e: Error) => onError(e.message))
        .finally(() => {
          web.current = undefined;
          setState('idle');
        });
    },
    [state, useGemini, settings, onText, onError, cancel],
  );

  return { supported, state, toggle, cancel, viaGemini: useGemini };
}
