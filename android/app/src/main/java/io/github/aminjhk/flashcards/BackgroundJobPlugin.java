package io.github.aminjhk.flashcards;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 앱을 닫아도 계속하는 이야기·음성 만들기 (StoryJobService.java, 웹 쪽 src/adapters/native/backgroundJob.ts).
 * start: 할 일을 서비스에 맡긴다 / running: 지금 하는 일 / 'event': 진행 소식 (앱이 켜져 있을 때)
 */
@CapacitorPlugin(name = "BackgroundJob")
public class BackgroundJobPlugin extends Plugin {
    private static volatile BackgroundJobPlugin live;

    @Override
    public void load() {
        live = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
    }

    static void forward(String json) {
        BackgroundJobPlugin p = live;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put("json", json);
        p.notifyListeners("event", data);
    }

    @PluginMethod
    public void start(PluginCall call) {
        JSObject task = call.getObject("task");
        JSObject r = new JSObject();
        r.put("started", task != null && StoryJobService.start(getContext(), task.toString()));
        call.resolve(r);
    }

    @PluginMethod
    public void running(PluginCall call) {
        JSObject r = new JSObject();
        String t = StoryJobService.running;
        r.put("running", t != null);
        r.put("task", t);
        call.resolve(r);
    }
}
