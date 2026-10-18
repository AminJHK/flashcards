package io.github.aminjhk.flashcards;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 안드로이드 음성 엔진(삼성, 구글 …)을 직접 쓰는 플러그인. 웹앱(Web Speech)으로는 엔진을 고를 수 없고,
 * 속도·높낮이를 브라우저가 늘 덮어써서 휴대폰 설정 값이 안 쓰였다.
 * - engine: 엔진 패키지 이름. 없으면 휴대폰 기본 엔진.
 * - rate·pitch: 주면 그 값, 안 주면 휴대폰 설정(텍스트 음성 변환)의 속도·높낮이를 그대로 쓴다.
 * - voice: 엔진 안의 목소리 이름. 없으면 그 언어의 엔진 기본 목소리.
 * speak는 다 읽거나 멈추면 끝난다 ({ ok }).
 */
@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {
    private TextToSpeech tts;
    /** 지금 만든 tts의 엔진 ("" = 기본 엔진) */
    private String ttsEngine;
    /** setSpeechRate/setPitch를 부른 적이 있으면 true. 휴대폰 설정 값으로 돌아가려면 새로 만들어야 한다 */
    private boolean customized;
    private boolean ready;
    private int initStatus = TextToSpeech.SUCCESS;
    private final List<Runnable> pending = new ArrayList<>();
    private final Map<String, PluginCall> waiting = new ConcurrentHashMap<>();
    private final AtomicInteger ids = new AtomicInteger();

    @Override
    protected void handleOnDestroy() {
        if (tts != null) tts.shutdown();
        tts = null;
    }

    /**
     * 엔진이 준비되면 run을 돌린다. 엔진이 바뀌었거나 휴대폰 설정 값으로 돌아가야 하면 새로 만든다.
     * wantCustom: 읽을 때 앱이 속도·높낮이를 정하는지 (null = 읽지 않는 호출이라 상관없음)
     */
    private synchronized void withTts(String engine, Boolean wantCustom, Runnable run) {
        String want = engine == null ? "" : engine;
        if (tts != null && (!want.equals(ttsEngine) || (wantCustom != null && customized && !wantCustom))) {
            tts.shutdown();
            tts = null;
        }
        if (tts == null) {
            ready = false;
            customized = false;
            ttsEngine = want;
            pending.clear();
            pending.add(run);
            TextToSpeech.OnInitListener onInit = status -> {
                List<Runnable> todo;
                synchronized (NativeTtsPlugin.this) {
                    ready = true;
                    initStatus = status;
                    todo = new ArrayList<>(pending);
                    pending.clear();
                }
                for (Runnable r : todo) r.run();
            };
            tts = want.isEmpty() ? new TextToSpeech(getContext(), onInit) : new TextToSpeech(getContext(), onInit, want);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String id) {}

                @Override
                public void onDone(String id) {
                    finish(id, true);
                }

                @Override
                public void onError(String id) {
                    finish(id, false);
                }

                @Override
                public void onStop(String id, boolean interrupted) {
                    finish(id, false);
                }
            });
            return;
        }
        if (!ready) {
            pending.add(run);
            return;
        }
        run.run();
    }

    private void finish(String id, boolean ok) {
        PluginCall call = waiting.remove(id);
        if (call == null) return;
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void getEngines(PluginCall call) {
        // 엔진 목록은 아무 엔진에서나 볼 수 있으니, 이미 있는 것을 그대로 쓴다 (읽던 소리를 끊지 않게)
        withTts(tts != null ? ttsEngine : null, null, () -> {
            JSArray list = new JSArray();
            for (TextToSpeech.EngineInfo e : tts.getEngines()) {
                JSObject o = new JSObject();
                o.put("name", e.name);
                o.put("label", e.label);
                list.put(o);
            }
            JSObject r = new JSObject();
            r.put("engines", list);
            r.put("defaultEngine", tts.getDefaultEngine());
            call.resolve(r);
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        String lang = call.getString("lang", "");
        withTts(call.getString("engine"), null, () -> {
            JSArray list = new JSArray();
            String want = Locale.forLanguageTag(lang).getLanguage();
            Set<Voice> voices = null;
            try {
                voices = tts.getVoices();
            } catch (Exception ignored) {
                // 엔진에 따라 목록을 못 줄 수 있다
            }
            if (voices != null) {
                for (Voice v : voices) {
                    if (!want.isEmpty() && !v.getLocale().getLanguage().equals(want)) continue;
                    if (v.getFeatures() != null && v.getFeatures().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                    JSObject o = new JSObject();
                    o.put("name", v.getName());
                    o.put("lang", v.getLocale().toLanguageTag());
                    o.put("network", v.isNetworkConnectionRequired());
                    list.put(o);
                }
            }
            JSObject r = new JSObject();
            r.put("voices", list);
            call.resolve(r);
        });
    }

    /** 이 엔진이 이 언어를 읽을 수 있는지 ({ available }) */
    @PluginMethod
    public void check(PluginCall call) {
        String lang = call.getString("lang", "");
        withTts(call.getString("engine"), null, () -> {
            int res = initStatus == TextToSpeech.SUCCESS ? tts.isLanguageAvailable(Locale.forLanguageTag(lang)) : TextToSpeech.LANG_NOT_SUPPORTED;
            JSObject r = new JSObject();
            r.put("available", res >= TextToSpeech.LANG_AVAILABLE);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "");
        Double rate = call.getDouble("rate");
        Double pitch = call.getDouble("pitch");
        String voiceName = call.getString("voice");
        boolean add = "add".equals(call.getString("queue"));
        withTts(call.getString("engine"), rate != null || pitch != null, () -> {
            if (initStatus != TextToSpeech.SUCCESS) {
                call.reject("음성 엔진을 시작하지 못했어요", "init");
                return;
            }
            int res = tts.setLanguage(Locale.forLanguageTag(lang));
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                call.reject("이 엔진에 이 언어 음성이 없어요", "missing");
                return;
            }
            if (voiceName != null && !voiceName.isEmpty()) {
                try {
                    for (Voice v : tts.getVoices()) {
                        if (v.getName().equals(voiceName)) {
                            tts.setVoice(v);
                            break;
                        }
                    }
                } catch (Exception ignored) {
                    // 목소리를 못 고르면 엔진 기본 목소리로 읽는다
                }
            }
            if (rate != null) {
                tts.setSpeechRate(rate.floatValue());
                customized = true;
            }
            if (pitch != null) {
                tts.setPitch(pitch.floatValue());
                customized = true;
            }
            String id = "u" + ids.incrementAndGet();
            waiting.put(id, call);
            if (tts.speak(text, add ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
                waiting.remove(id);
                call.reject("읽지 못했어요", "speak");
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        for (String id : new ArrayList<>(waiting.keySet())) finish(id, false);
        call.resolve();
    }
}
