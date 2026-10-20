package io.github.aminjhk.flashcards;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * 복습 알림 신호 (ReviewAlarms.java).
 * - FIRE: 예약한 시각이 됨 → 알림을 띄운다 (앱 화면이 보이고 있으면 띄우지 않는다)
 * - REVEAL: [뜻 보기] → 같은 알림을 뒷면과 [다시][어려움][알았음]으로 바꾼다
 * - ANSWER: 답 → 누른 시각과 함께 저장하고, 바로 앱을 깨워 기록하게 한다 (앱이 다음 알림을 다시 계산해 보낸다)
 * - 휴대폰을 다시 켜면 예약이 지워지므로 저장해 둔 계획으로 다시 예약한다
 */
public class ReviewReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        Context c = context.getApplicationContext();
        switch (action) {
            case ReviewAlarms.ACTION_FIRE: {
                if (ReviewNotifyPlugin.appVisible) return;
                JSONObject alarm = ReviewAlarms.find(c, intent.getStringExtra(ReviewAlarms.EXTRA_ID));
                if (alarm != null) ReviewAlarms.show(c, alarm, false);
                return;
            }
            case ReviewAlarms.ACTION_REVEAL: {
                JSONObject alarm = alarmOf(c, intent);
                if (alarm != null) ReviewAlarms.show(c, alarm, true);
                return;
            }
            case ReviewAlarms.ACTION_ANSWER: {
                JSONObject alarm = alarmOf(c, intent);
                String id = intent.getStringExtra(ReviewAlarms.EXTRA_ID);
                if (id != null) {
                    ReviewAlarms.cancelShown(c, id);
                    ReviewAlarms.remove(c, id);
                }
                if (alarm == null || alarm.optString("cardId").isEmpty()) return;
                ReviewAlarms.queueAnswer(c, alarm.optString("cardId"), intent.getIntExtra(ReviewAlarms.EXTRA_RATING, 3), System.currentTimeMillis());
                // 앱이 뒤에 켜져 있으면 바로 알리고, 꺼져 있으면 화면 없이 앱을 켜서 처리한다
                if (ReviewNotifyPlugin.notifyAnswers()) return;
                PendingResult pending = goAsync();
                HeadlessRunner.run(c, pending::finish);
                return;
            }
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                ReviewAlarms.scheduleAll(c, ReviewAlarms.load(c));
                return;
            default:
        }
    }

    private static JSONObject alarmOf(Context c, Intent intent) {
        String json = intent.getStringExtra(ReviewAlarms.EXTRA_ALARM);
        if (json != null) {
            try {
                return new JSONObject(json);
            } catch (JSONException ignored) {
                // 저장된 계획에서 찾는다
            }
        }
        String id = intent.getStringExtra(ReviewAlarms.EXTRA_ID);
        return id == null ? null : ReviewAlarms.find(c, id);
    }
}
