package io.github.aminjhk.flashcards;

import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.KeyEvent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Volume controls are captured only while the review screen explicitly enables them. */
@CapacitorPlugin(name = "ReviewKeys")
public class ReviewKeysPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean enabled;
    private int pressed;
    private boolean held;
    private final Runnable longPress = () -> {
        if (!enabled || !getActivity().hasWindowFocus() || pressed != KeyEvent.KEYCODE_VOLUME_DOWN) return;
        held = true;
        emit("undo");
    };

    @PluginMethod
    public void setEnabled(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            cancelPress();
            enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            call.resolve();
        });
    }

    public boolean consume(KeyEvent event) {
        int key = event.getKeyCode();
        if (!enabled || (key != KeyEvent.KEYCODE_VOLUME_UP && key != KeyEvent.KEYCODE_VOLUME_DOWN)) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getRepeatCount() == 0 && pressed == 0) {
                pressed = key;
                held = false;
                if (key == KeyEvent.KEYCODE_VOLUME_DOWN) handler.postDelayed(longPress, 700);
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP && pressed == key) {
            handler.removeCallbacks(longPress);
            if (!held && !event.isCanceled()) emit(key == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
            cancelPress();
        }
        return true;
    }

    private void emit(String action) {
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("key", data);
        getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
    }

    private void cancelPress() {
        handler.removeCallbacks(longPress);
        pressed = 0;
        held = false;
    }

    @Override protected void handleOnPause() { cancelPress(); }
    @Override protected void handleOnDestroy() { enabled = false; cancelPress(); }
}
