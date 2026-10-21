package io.github.aminjhk.flashcards;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

/**
 * 앱이 꺼져 있을 때 알림에서 받은 답을 처리하는 일 (HeadlessRunner로 화면 없는 앱을 켠다).
 * 예전에는 알림 신호(BroadcastReceiver) 안에서 9초 안에 끝내야 해서, 앱을 다 불러오기 전에 끊기면 다음 알림이 예약되지 않았다.
 * 작업(JobScheduler)으로 돌리면 시간이 넉넉하다 (안드로이드 12+는 바로 도는 expedited 작업).
 */
public class HeadlessJobService extends JobService {
    private static final int JOB_ID = 7301;

    static void start(Context context) {
        Context c = context.getApplicationContext();
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(c, HeadlessJobService.class));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setExpedited(true);
        else b.setOverrideDeadline(0);
        try {
            js.schedule(b.build());
        } catch (RuntimeException e) {
            // 바로 도는 작업을 못 쓰면 보통 작업으로
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, HeadlessJobService.class)).setOverrideDeadline(0).build());
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        HeadlessRunner.run(this, () -> jobFinished(params, false));
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // 못 넣은 답은 남아 있다가 다음에 앱이 켜질 때 들어간다
        return false;
    }
}
