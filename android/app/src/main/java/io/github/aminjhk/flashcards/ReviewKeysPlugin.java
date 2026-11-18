package io.github.aminjhk.flashcards;

import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
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

    @PluginMethod
    public void vibrateCombo(PluginCall call) {
        boolean eruption = Boolean.TRUE.equals(call.getBoolean("eruption", false));
        var times = call.getArray("times");
        if (times == null || times.length() < 1 || times.length() > 5) {
            call.reject("Invalid lightning timing");
            return;
        }
        long[] pattern = new long[times.length() * 2 + (eruption ? 4 : 0)];
        int[] amplitudes = new int[pattern.length];
        int end = 0;
        for (int i = 0; i < times.length(); i++) {
            int start = times.optInt(i, -1);
            if (start < end || start > 1000) {
                call.reject("Invalid lightning timing");
                return;
            }
            int duration = i % 2 == 0 ? 25 : 13;
            pattern[i * 2] = start - end;
            pattern[i * 2 + 1] = duration;
            amplitudes[i * 2 + 1] = i % 2 == 0 ? 155 : 70;
            end = start + duration;
        }
        if (eruption) {
            int index = times.length() * 2;
            pattern[index] = times.optInt(times.length() - 1) + 110 - end;
            pattern[index + 1] = 78;
            pattern[index + 2] = 185 - 78;
            pattern[index + 3] = 58;
            amplitudes[index + 1] = 255;
            amplitudes[index + 3] = 205;
        }
        Context context = getActivity();
        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= 31) {
            VibratorManager manager = context.getSystemService(VibratorManager.class);
            vibrator = manager == null ? null : manager.getDefaultVibrator();
        } else {
            vibrator = context.getSystemService(Vibrator.class);
        }
        try {
            if (vibrator != null && vibrator.hasVibrator()) {
                vibrator.vibrate(vibrator.hasAmplitudeControl()
                    ? VibrationEffect.createWaveform(pattern, amplitudes, -1)
                    : VibrationEffect.createWaveform(pattern, -1));
            }
            call.resolve();
        } catch (SecurityException error) {
            call.reject("Vibration permission unavailable", error);
        }
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
