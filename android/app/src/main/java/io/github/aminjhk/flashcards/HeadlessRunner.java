package io.github.aminjhk.flashcards;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.CapConfig;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * 앱이 완전히 꺼져 있을 때 알림에서 답하면, 화면 없는 WebView로 앱(같은 주소, 같은 저장소)을 잠깐 켠다.
 * 웹 쪽 src/headless.ts가 답을 복습 기록에 넣고(앱과 같은 코드·같은 FSRS-7) 새 알림 계획을 보낸 뒤 done()을 부른다.
 * 오래 걸리면(TIMEOUT_MS) 그냥 끝낸다: 넣지 못한 답은 남아 있다가 다음에 앱이 켜질 때 들어간다.
 */
final class HeadlessRunner {
    private static final long TIMEOUT_MS = 9000;

    private HeadlessRunner() {}

    @SuppressLint("SetJavaScriptEnabled")
    static void run(Context context, Runnable finish) {
        Context c = context.getApplicationContext();
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
            WebView wv;
            try {
                wv = new WebView(c);
            } catch (RuntimeException e) {
                finish.run();
                return;
            }
            WebSettings s = wv.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            final boolean[] ended = { false };
            Runnable end = () -> {
                if (ended[0]) return;
                ended[0] = true;
                wv.destroy();
                finish.run();
            };
            wv.addJavascriptInterface(new Bridge(c, () -> main.post(end)), "FlashcardsHeadless");
            String url = CapConfig.loadDefault(c).getServerUrl();
            wv.loadUrl(url != null ? url : "https://aminjhk.github.io/flashcards/");
            main.postDelayed(end, TIMEOUT_MS);
        });
    }

    /** 웹 쪽 adapters/native/reviewNotify.ts의 HeadlessBridge */
    static final class Bridge {
        private final Context c;
        private final Runnable done;

        Bridge(Context c, Runnable done) {
            this.c = c;
            this.done = done;
        }

        @JavascriptInterface
        public String pending() {
            return ReviewAlarms.answers(c).toString();
        }

        @JavascriptInterface
        public void ack(String json) {
            try {
                ReviewAlarms.ack(c, new JSONArray(json));
            } catch (JSONException ignored) {
                // 잘못된 값이면 지우지 않는다
            }
        }

        @JavascriptInterface
        public void schedule(String json) {
            try {
                ReviewAlarms.scheduleAll(c, new JSONArray(json));
            } catch (JSONException ignored) {
                // 계획을 못 읽으면 예전 계획을 둔다
            }
        }

        @JavascriptInterface
        public void done() {
            done.run();
        }
    }
}
