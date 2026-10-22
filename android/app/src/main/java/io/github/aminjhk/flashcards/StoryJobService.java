package io.github.aminjhk.flashcards;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 이야기·음성 만들기를 앱을 닫아도 계속하는 서비스 (사용자 요청 2026-10-22: 만드는 동안 다른 일을 하고 싶다).
 * 알림 표시줄에 "만드는 중"을 띄운 채(포그라운드 서비스) 화면 없는 WebView로 앱을 켜고(HeadlessRunner),
 * 웹 쪽 src/headless.ts가 같은 코드(adapters/stories/jobs.ts)로 이야기와 음성을 만들어 저장한다.
 * 진행 소식은 알림에 보여 주고, 앱이 켜져 있으면 BackgroundJobPlugin으로 화면에도 보낸다.
 */
public class StoryJobService extends Service {
    static final String EXTRA_TASK = "task";
    private static final String CH = "story_job";
    private static final int ID_RUNNING = 7401;
    private static final int ID_DONE = 7402;
    /** 이야기 만들기 + 음성 만들기가 이보다 오래 걸리면 멈춘다 */
    private static final long TIMEOUT_MS = 20 * 60_000;

    /** 지금 하고 있는 일 (없으면 null) */
    static volatile String running;
    private String title;
    private String result;

    static boolean start(Context context, String task) {
        if (running != null) return false;
        Context c = context.getApplicationContext();
        ContextCompat.startForegroundService(c, new Intent(c, StoryJobService.class).putExtra(EXTRA_TASK, task));
        return true;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void channel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CH, "이야기 만들기", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("이야기와 음성을 만드는 동안과 다 됐을 때");
        nm.createNotificationChannel(ch);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification progress(String text, int pct) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH)
            .setSmallIcon(R.drawable.ic_stat_review)
            .setContentTitle(title != null ? "「" + title + "」" : "이야기 만드는 중")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp());
        if (pct >= 0) b.setProgress(100, pct, false);
        else b.setProgress(0, 0, true);
        return b.build();
    }

    private void update(String text, int pct) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(ID_RUNNING, progress(text, pct));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String task = intent != null ? intent.getStringExtra(EXTRA_TASK) : null;
        if (task == null || running != null) {
            if (running == null) stopSelf();
            return START_NOT_STICKY;
        }
        running = task;
        title = null;
        result = null;
        channel();
        String first = task.contains("\"audio\"") ? "음성을 준비하는 중…" : "이야기를 쓰는 중…";
        Notification n = progress(first, -1);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID_RUNNING, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID_RUNNING, n);
        HeadlessRunner.run(this, task, this::onEvent, TIMEOUT_MS, this::finish);
        return START_NOT_STICKY;
    }

    /** 웹 쪽 JobEvent (adapters/stories/jobs.ts) */
    private void onEvent(String json) {
        BackgroundJobPlugin.forward(json);
        try {
            JSONObject e = new JSONObject(json);
            switch (e.optString("kind")) {
                case "step": {
                    JSONObject step = e.optJSONObject("step");
                    String stage = step != null ? step.optString("stage") : "";
                    int pct = step != null && step.has("pct") ? (int) Math.round(step.optDouble("pct") * 100) : -1;
                    String text = "waiting".equals(stage) ? "Gemini 서버가 붐벼서 기다리는 중…" : "checking".equals(stage) ? "아는 단어 비율을 확인하는 중…" : "revising".equals(stage) ? "모르는 단어를 줄여 다시 쓰는 중…" : "이야기를 쓰는 중…";
                    update(text, pct);
                    break;
                }
                case "done":
                    title = e.optString("title");
                    result = "이야기 「" + title + "」가 완성됐어요";
                    update("이야기 완성 · 음성을 준비하는 중…", -1);
                    break;
                case "error":
                    result = "이야기를 만들지 못했어요 · " + e.optString("message");
                    break;
                case "audio": {
                    JSONObject a = e.optJSONObject("audio");
                    if (a == null) break;
                    int done = a.optInt("done");
                    int total = a.optInt("total");
                    if (a.optBoolean("running")) update("음성 준비 중 " + done + "/" + total + "문장", total > 0 ? done * 100 / total : -1);
                    else if (result == null || result.startsWith("이야기 「")) {
                        String head = title != null ? "「" + title + "」 " : "";
                        result = total > 0 && done >= total ? head + "음성까지 준비됐어요" : head + "음성 " + done + "/" + total + "문장 준비" + (a.has("note") ? " · " + a.optString("note") : "");
                    }
                    break;
                }
                default:
            }
        } catch (JSONException ignored) {
            // 모르는 소식은 넘긴다
        }
    }

    private void finish() {
        running = null;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null && result != null) {
            nm.notify(ID_DONE, new NotificationCompat.Builder(this, CH)
                .setSmallIcon(R.drawable.ic_stat_review)
                .setContentTitle(result)
                .setContentText("눌러서 읽기")
                .setAutoCancel(true)
                .setContentIntent(openApp())
                .build());
        }
        BackgroundJobPlugin.forward("{\"kind\":\"finished\"}");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }
}
