package io.github.aminjhk.flashcards;

import android.app.PendingIntent;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;

import java.util.ArrayList;
import java.util.List;

/**
 * Google 로그인 (Drive 동기화·백업용). 앱 안 브라우저에서는 Google이 로그인 창을 막아서,
 * 안드로이드의 Google 계정 권한 요청(AuthorizationClient)으로 액세스 토큰을 받는다.
 * 한 번 허용하면 다음부터는 창 없이 새 토큰을 받는다 (interactive=false → 창이 필요하면 { needsUi: true }).
 * Google Cloud 프로젝트에 이 앱(패키지 이름 + 서명 SHA-1)의 "Android" OAuth 클라이언트가 있어야 한다 (docs/ANDROID.md).
 */
@CapacitorPlugin(name = "NativeGoogle")
public class NativeGooglePlugin extends Plugin {
    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall waiting;

    @Override
    public void load() {
        consent = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), this::onConsent);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        List<Scope> scopes = new ArrayList<>();
        JSArray list = call.getArray("scopes", new JSArray());
        for (int i = 0; i < list.length(); i++) {
            String s = list.optString(i, "");
            if (!s.isEmpty()) scopes.add(new Scope(s));
        }
        if (scopes.isEmpty()) {
            call.reject("권한(scope)이 없어요", "scopes");
            return;
        }
        AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(scopes).build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(req)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) {
                        JSObject r = new JSObject();
                        r.put("needsUi", true);
                        call.resolve(r);
                        return;
                    }
                    PendingIntent pi = result.getPendingIntent();
                    if (pi == null) {
                        call.reject("Google 로그인 창을 열지 못했어요", "no_intent");
                        return;
                    }
                    if (waiting != null) waiting.reject("다른 로그인이 시작됐어요", "replaced");
                    waiting = call;
                    consent.launch(new IntentSenderRequest.Builder(pi.getIntentSender()).build());
                    return;
                }
                resolveToken(call, result);
            })
            .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "Google 로그인에 실패했어요" : e.getMessage(), "failed"));
    }

    private void onConsent(ActivityResult res) {
        PluginCall call = waiting;
        waiting = null;
        if (call == null) return;
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(res.getData());
            resolveToken(call, result);
        } catch (Exception e) {
            call.reject("Google 로그인을 취소했어요", "cancelled");
        }
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("Google 토큰을 받지 못했어요", "no_token");
            return;
        }
        JSObject r = new JSObject();
        r.put("accessToken", token);
        r.put("needsUi", false);
        call.resolve(r);
    }
}
