package io.github.aminjhk.flashcards;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에서 만든 플러그인은 super.onCreate 전에 등록한다
        registerPlugin(NativeTtsPlugin.class);
        registerPlugin(NativeGooglePlugin.class);
        registerPlugin(ReviewNotifyPlugin.class);
        registerPlugin(BackgroundJobPlugin.class);
        super.onCreate(savedInstanceState);
        // 뒤로 가기 버튼: Capacitor는 App 플러그인이 없으면 앱을 바로 닫아 버린다. 앱 안에서 앞 화면으로 돌아가게 한다
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                goBackInApp();
            }
        });
    }

    /**
     * 1) 열린 창(확인창·단어 창 등)이 있으면 그것만 닫고 (웹이 window.__flashcardsBack()으로 알려 줌)
     * 2) 없으면 웹뷰의 앞 화면(#/ 주소 기록)으로, 3) 더 갈 곳이 없으면 앱을 뒤로 물러나게 한다.
     */
    private void goBackInApp() {
        final WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript(
            "(function(){try{return !!(window.__flashcardsBack&&window.__flashcardsBack());}catch(e){return false;}})()",
            handled -> {
                if ("true".equals(handled)) return;
                if (web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            });
    }
}
