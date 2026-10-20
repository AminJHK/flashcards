package io.github.aminjhk.flashcards;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에서 만든 플러그인은 super.onCreate 전에 등록한다
        registerPlugin(NativeTtsPlugin.class);
        registerPlugin(NativeGooglePlugin.class);
        registerPlugin(ReviewNotifyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
