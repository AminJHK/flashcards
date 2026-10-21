package io.github.aminjhk.flashcards;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

/**
 * 복습 알림의 휴대폰 쪽 일 (src/adapters/native/reviewNotify.ts, src/core/notify/plan.ts).
 * - 앱이 FSRS-7로 계산해 보낸 알림 계획을 저장하고, 그 시각에 울리게 AlarmManager에 맡긴다.
 * - 카드 알림: 앞면 + [뜻 보기] → 뒷면 + [다시][어려움][알았음]. 답은 누른 시각과 함께 저장해 두고 앱이 가져간다.
 * - 계산은 하지 않는다. 다음 알림 시각은 답을 받은 앱이 다시 계산해서 보낸다.
 */
final class ReviewAlarms {
    static final String ACTION_FIRE = "io.github.aminjhk.flashcards.REVIEW_FIRE";
    static final String ACTION_REVEAL = "io.github.aminjhk.flashcards.REVIEW_REVEAL";
    static final String ACTION_ANSWER = "io.github.aminjhk.flashcards.REVIEW_ANSWER";
    /** 카드 알림을 밀어서 지움 → 기다리던 다음 카드를 띄운다 */
    static final String ACTION_DISMISS = "io.github.aminjhk.flashcards.REVIEW_DISMISS";
    static final String EXTRA_ID = "id";
    static final String EXTRA_RATING = "rating";
    static final String EXTRA_ALARM = "alarm";

    private static final String PREFS = "review_notify";
    private static final String KEY_ALARMS = "alarms";
    private static final String KEY_ANSWERS = "answers";
    private static final String CH_CARD = "review_card";
    private static final String CH_PILE = "review_pile";
    /** 뜻을 본 뒤의 알림: 화면 위에 펼쳐진 채로 뜨게(버튼이 바로 보이게) 중요도 높음, 소리·진동 없음 */
    private static final String CH_ANSWER = "review_answer";
    /** 알림 tag 앞부분 (우리 알림만 골라 지울 때) */
    private static final String TAG = "review:";

    private ReviewAlarms() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized JSONArray load(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY_ALARMS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized JSONObject find(Context c, String id) {
        JSONArray a = load(c);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    private static PendingIntent fireIntent(Context c, String id) {
        Intent i = new Intent(c, ReviewReceiver.class).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, ("fire:" + id).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    /** 새 계획으로 바꾼다: 예전 예약은 지우고, 받은 알림을 모두 예약한다 */
    static synchronized void scheduleAll(Context c, JSONArray alarms) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        JSONArray old = load(c);
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.optJSONObject(i);
            if (o != null && am != null) am.cancel(fireIntent(c, o.optString("id")));
        }
        prefs(c).edit().putString(KEY_ALARMS, alarms.toString()).apply();
        // 새 계획에 없는 카드 알림이 떠 있으면 지운다 (앱에서 이미 답한 카드)
        cancelShownExcept(c, alarms);
        if (am == null) return;
        boolean exact = canExact(c);
        long now = System.currentTimeMillis();
        java.util.Set<String> shown = shownIds(c);
        for (int i = 0; i < alarms.length(); i++) {
            JSONObject o = alarms.optJSONObject(i);
            if (o == null) continue;
            // 이미 떠 있는 알림은 다시 울리지 않는다 (앱을 열었다 닫을 때마다 소리가 다시 났다)
            if (shown.contains(o.optString("id"))) continue;
            long at = Math.max(o.optLong("at"), now + 1000);
            PendingIntent pi = fireIntent(c, o.optString("id"));
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** 예약과 떠 있는 복습 알림을 모두 지운다 (앱 화면이 보이는 동안) */
    static synchronized void clear(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        JSONArray old = load(c);
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.optJSONObject(i);
            if (o != null && am != null) am.cancel(fireIntent(c, o.optString("id")));
        }
        prefs(c).edit().putString(KEY_ALARMS, "[]").apply();
        cancelShownExcept(c, new JSONArray());
    }

    static synchronized void remove(Context c, String id) {
        JSONArray a = load(c);
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !id.equals(o.optString("id"))) out.put(o);
        }
        prefs(c).edit().putString(KEY_ALARMS, out.toString()).apply();
    }

    private static void cancelShownExcept(Context c, JSONArray keep) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (int i = 0; i < keep.length(); i++) {
            JSONObject o = keep.optJSONObject(i);
            if (o != null) ids.add(o.optString("id"));
        }
        for (StatusBarNotification n : nm.getActiveNotifications()) {
            String tag = n.getTag();
            if (tag != null && tag.startsWith(TAG) && !ids.contains(tag.substring(TAG.length()))) nm.cancel(tag, n.getId());
        }
    }

    /** 지금 떠 있는 우리 알림의 id들 */
    static java.util.Set<String> shownIds(Context c) {
        java.util.Set<String> out = new java.util.HashSet<>();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return out;
        for (StatusBarNotification n : nm.getActiveNotifications()) {
            String tag = n.getTag();
            if (tag != null && tag.startsWith(TAG)) out.add(tag.substring(TAG.length()));
        }
        return out;
    }

    /** 카드 알림이 이미 하나 떠 있는지 (한 번에 하나만 보여 준다) */
    static boolean cardShown(Context c) {
        for (String id : shownIds(c)) if (id.startsWith("card:")) return true;
        return false;
    }

    /** 때가 됐는데 아직 못 보여 준 카드 알림 중 가장 이른 것 (다른 카드에 답한 뒤 바로 띄운다) */
    static synchronized JSONObject nextDueCard(Context c, String exceptId) {
        JSONArray a = load(c);
        long now = System.currentTimeMillis();
        JSONObject best = null;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o == null || !"card".equals(o.optString("kind")) || o.optString("id").equals(exceptId) || o.optLong("at") > now + 1000) continue;
            if (best == null || o.optLong("at") < best.optLong("at")) best = o;
        }
        return best;
    }

    /** 이 카드 말고 때가 된 카드 수 ("남은 짧은 복습 N장") */
    static synchronized int waiting(Context c, String exceptId) {
        JSONArray a = load(c);
        long now = System.currentTimeMillis();
        int n = 0;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && "card".equals(o.optString("kind")) && !o.optString("id").equals(exceptId) && o.optLong("at") <= now + 1000) n++;
        }
        return n;
    }

    static void cancelShown(Context c, String id) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.cancel(TAG + id, 1);
    }

    private static void channels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel card = new NotificationChannel(CH_CARD, "짧은 복습 (카드)", NotificationManager.IMPORTANCE_HIGH);
        card.setDescription("1분·10분 뒤처럼 짧은 간격으로 다시 볼 카드. 알림에서 바로 답해요.");
        NotificationChannel pile = new NotificationChannel(CH_PILE, "복습 카드 쌓임", NotificationManager.IMPORTANCE_DEFAULT);
        pile.setDescription("며칠 간격 복습 카드가 쌓였을 때");
        NotificationChannel answer = new NotificationChannel(CH_ANSWER, "짧은 복습 (뜻 보기 뒤 답하기)", NotificationManager.IMPORTANCE_HIGH);
        answer.setDescription("뜻을 본 뒤 다시·어려움·알았음 버튼이 바로 보이게 화면 위에 떠요. 소리는 나지 않아요.");
        answer.setSound(null, null);
        answer.enableVibration(false);
        nm.createNotificationChannel(card);
        nm.createNotificationChannel(pile);
        nm.createNotificationChannel(answer);
    }

    private static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 버튼 동작. 알림 내용(alarm)을 같이 넣어 둔다: 그새 계획이 바뀌어도 이 알림에는 답할 수 있게 */
    private static PendingIntent action(Context c, String act, JSONObject alarm, int rating) {
        String id = alarm.optString("id");
        Intent i = new Intent(c, ReviewReceiver.class).setAction(act).putExtra(EXTRA_ID, id).putExtra(EXTRA_RATING, rating).putExtra(EXTRA_ALARM, alarm.toString());
        return PendingIntent.getBroadcast(c, (act + ":" + id + ":" + rating).hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 알림을 띄운다. revealed면 카드 뒷면과 답 버튼 */
    static void show(Context c, JSONObject alarm, boolean revealed) {
        channels(c);
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        String id = alarm.optString("id");
        NotificationCompat.Builder b;
        if ("pile".equals(alarm.optString("kind"))) {
            b = new NotificationCompat.Builder(c, CH_PILE)
                .setContentTitle("복습할 카드 " + alarm.optInt("count") + "장이 기다려요")
                .setContentText("눌러서 복습하기")
                .setContentIntent(openApp(c));
        } else {
            // 카드 알림은 눌러도 앱을 열지 않는다 (사용자: 답하려다 자꾸 앱으로 들어가진다). 글씨를 누르면 뜻 보기와 같다
            String front = alarm.optString("front");
            PendingIntent reveal = action(c, ACTION_REVEAL, alarm, 0);
            b = new NotificationCompat.Builder(c, revealed ? CH_ANSWER : CH_CARD).setContentTitle(front).setContentIntent(reveal).setCategory(NotificationCompat.CATEGORY_REMINDER).setAutoCancel(false);
            b.setDeleteIntent(action(c, ACTION_DISMISS, alarm, 0));
            int left = waiting(c, id);
            if (left > 0) b.setSubText("남은 짧은 복습 " + left + "장");
            if (revealed) {
                // 같은 알림을 고치면 접힌 채로 남아서 화살표를 눌러야 버튼이 보였다 → 지우고 새로 띄워 화면 위에 펼쳐진 채로 뜨게 한다
                nm.cancel(TAG + id, 1);
                String back = alarm.optString("back") + (left > 0 ? "\n남은 짧은 복습 " + left + "장" : "");
                b.setContentText(back)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(back))
                    .setDefaults(0)
                    .addAction(0, "다시", action(c, ACTION_ANSWER, alarm, 1))
                    .addAction(0, "어려움", action(c, ACTION_ANSWER, alarm, 2))
                    .addAction(0, "알았음", action(c, ACTION_ANSWER, alarm, 3));
            } else {
                String ask = "무슨 뜻일까요? 떠올려 보고 눌러서 뜻을 봐요";
                b.setContentText(ask).setStyle(new NotificationCompat.BigTextStyle().bigText(ask)).addAction(0, "뜻 보기", reveal);
            }
        }
        if ("pile".equals(alarm.optString("kind"))) b.setAutoCancel(true);
        b.setSmallIcon(R.drawable.ic_stat_review).setPriority(NotificationCompat.PRIORITY_HIGH).setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        try {
            nm.notify(TAG + id, 1, b.build());
        } catch (SecurityException ignored) {
            // 알림 허락이 없다
        }
    }

    /** 알림에서 누른 답 (누른 시각). 앱이 가져가서 복습 기록에 넣고 ack하면 지운다 */
    static synchronized void queueAnswer(Context c, String cardId, int rating, long at) {
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY_ANSWERS, "[]"));
            JSONObject o = new JSONObject();
            o.put("id", UUID.randomUUID().toString());
            o.put("cardId", cardId);
            o.put("rating", rating);
            o.put("at", at);
            a.put(o);
            prefs(c).edit().putString(KEY_ANSWERS, a.toString()).commit();
        } catch (JSONException ignored) {
            // 만들 수 없는 값은 없다
        }
    }

    static synchronized JSONArray answers(Context c) {
        try {
            return new JSONArray(prefs(c).getString(KEY_ANSWERS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static synchronized void ack(Context c, JSONArray ids) {
        java.util.Set<String> done = new java.util.HashSet<>();
        for (int i = 0; i < ids.length(); i++) done.add(ids.optString(i));
        JSONArray a = answers(c);
        JSONArray keep = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && !done.contains(o.optString("id"))) keep.put(o);
        }
        prefs(c).edit().putString(KEY_ANSWERS, keep.toString()).commit();
    }
}
