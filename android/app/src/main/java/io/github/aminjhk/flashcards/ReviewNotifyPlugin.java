package io.github.aminjhk.flashcards;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONException;

/**
 * 복습 알림 플러그인 (웹 쪽 src/adapters/native/reviewNotify.ts).
 * schedule: 앱이 계산한 알림 계획을 예약 / clear: 모두 끔 / pending·ack: 알림에서 누른 답을 가져가고 지움.
 * 앱이 뒤에 켜져 있을 때 알림에서 답하면 'answers' 소식을 보내 바로 처리하게 한다.
 */
@CapacitorPlugin(name = "ReviewNotify", permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") })
public class ReviewNotifyPlugin extends Plugin {
    /** 앱 화면이 보이는 동안 true (그때는 알림을 띄우지 않는다) */
    static volatile boolean appVisible;
    private static volatile ReviewNotifyPlugin live;

    @Override
    public void load() {
        live = this;
        appVisible = true;
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        appVisible = false;
    }

    /** 앱이 켜져 있으면 답이 왔다고 알린다. 알렸으면 true */
    static boolean notifyAnswers() {
        ReviewNotifyPlugin p = live;
        if (p == null || p.getBridge() == null) return false;
        p.notifyListeners("answers", new JSObject());
        return true;
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray alarms = call.getArray("alarms", new JSArray());
        ReviewAlarms.scheduleAll(getContext(), alarms);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        ReviewAlarms.clear(getContext());
        call.resolve();
    }

    @PluginMethod
    public void pending(PluginCall call) {
        JSObject r = new JSObject();
        try {
            r.put("answers", new JSArray(ReviewAlarms.answers(getContext()).toString()));
        } catch (JSONException e) {
            r.put("answers", new JSArray());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void ack(PluginCall call) {
        JSONArray ids = call.getArray("ids", new JSArray());
        ReviewAlarms.ack(getContext(), ids);
        call.resolve();
    }

    private JSObject state() {
        JSObject r = new JSObject();
        r.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("exact", ReviewAlarms.canExact(getContext()));
        return r;
    }

    @PluginMethod
    public void permissions(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(state());
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(state());
    }

    /** "알람 및 리마인더" 허락 화면 (안드로이드 12+) */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }
}
