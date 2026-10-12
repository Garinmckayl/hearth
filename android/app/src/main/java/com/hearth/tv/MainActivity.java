package com.hearth.tv;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.content.pm.PackageManager;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://hearth.local";
    private static final int VOICE_REQUEST = 100;
    private WebView webView;
    private TextToSpeech speech;
    private boolean speechReady;
    private PermissionRequest microphoneRequest;
    private static final int MICROPHONE_PERMISSION = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        webView = new WebView(this);
        webView.setBackgroundColor(0xff20251e);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!"hearth.local".equals(request.getUrl().getHost())) return null;
                String asset = request.getUrl().getPath();
                if (asset == null || asset.contains("..")) return emptyResponse();
                if ("/api/config".equals(asset)) return new WebResourceResponse("application/json", "UTF-8", new ByteArrayInputStream("{\"dialogue\":\"story\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                if ("/".equals(asset)) asset = "/index.html";
                try {
                    return new WebResourceResponse(mimeType(asset), "UTF-8", getAssets().open(asset.substring(1)));
                } catch (IOException exception) {
                    return emptyResponse();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"hearth.local".equals(request.getUrl().getHost()) || !"https".equals(request.getUrl().getScheme());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!ORIGIN.equals(request.getOrigin().toString().replaceAll("/$", ""))) { request.deny(); return; }
                    boolean requestsAudio = java.util.Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                    if (!requestsAudio) { request.deny(); return; }
                    if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    else { microphoneRequest = request; requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION); }
                });
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) { if (microphoneRequest == request) microphoneRequest = null; }
        });
        webView.addJavascriptInterface(new NativeBridge(), "HearthNative");
        setContentView(webView);
        webView.loadUrl(ORIGIN + "/index.html?tv=1");
        speech = new TextToSpeech(this, status -> {
            speechReady = status == TextToSpeech.SUCCESS;
            if (speechReady) {
                speech.setLanguage(Locale.getDefault());
                speech.setSpeechRate(0.86f);
                speech.setPitch(1.08f);
                speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { evaluate("window.hearthSpeaking?.(true)"); }
                    @Override public void onDone(String utteranceId) { evaluate("window.hearthSpeaking?.(false)"); }
                    @Override public void onError(String utteranceId) { evaluate("window.hearthSpeaking?.(false)"); }
                });
            }
        });
    }

    private static WebResourceResponse emptyResponse() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private static String mimeType(String asset) {
        if (asset.endsWith(".html")) return "text/html";
        if (asset.endsWith(".css")) return "text/css";
        if (asset.endsWith(".js")) return "text/javascript";
        if (asset.endsWith(".svg")) return "image/svg+xml";
        if (asset.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    private void evaluate(String script) { runOnUiThread(() -> webView.evaluateJavascript(script, null)); }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String key;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: key = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: key = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: key = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: key = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER: key = "Enter"; break;
            case KeyEvent.KEYCODE_BACK: key = "Back"; break;
            default: return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) evaluate("window.hearthRemote?.(" + JSONObject.quote(key) + ")");
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == VOICE_REQUEST && resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) evaluate("window.hearthVoiceResult?.(" + JSONObject.quote(results.get(0)) + ")");
        }
    }

    @Override
    protected void onPause() { super.onPause(); evaluate("window.hearthPause?.()"); webView.onPause(); if (speech != null) speech.stop(); }
    @Override
    protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override
    protected void onDestroy() { if (speech != null) speech.shutdown(); webView.removeJavascriptInterface("HearthNative"); webView.destroy(); super.onDestroy(); }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == MICROPHONE_PERMISSION && microphoneRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) microphoneRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else microphoneRequest.deny();
            microphoneRequest = null;
        }
    }

    public final class NativeBridge {
        @JavascriptInterface
        public String backendUrl() { return BuildConfig.BACKEND_URL; }

        @JavascriptInterface
        public void speak(String text) {
            runOnUiThread(() -> {
                if (speechReady) speech.speak(text.substring(0, Math.min(text.length(), 1500)), TextToSpeech.QUEUE_FLUSH, null, "pip-reply");
                else Toast.makeText(MainActivity.this, "Spoken replies are unavailable. Captions are always shown.", Toast.LENGTH_SHORT).show();
            });
        }

        @JavascriptInterface
        public void stopSpeaking() { runOnUiThread(() -> { if (speech != null) speech.stop(); }); }

        @JavascriptInterface
        public void listen() {
            runOnUiThread(() -> {
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "A moment with Pip");
                try { startActivityForResult(intent, VOICE_REQUEST); }
                catch (ActivityNotFoundException exception) { evaluate("window.hearthVoiceUnavailable?.()"); }
            });
        }

        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text.substring(0, Math.min(text.length(), 2000)));
                try { startActivity(Intent.createChooser(intent, "Share a little note")); }
                catch (ActivityNotFoundException exception) { Toast.makeText(MainActivity.this, "Read the note aloud when you call.", Toast.LENGTH_LONG).show(); }
            });
        }

        @JavascriptInterface
        public void showKeyboard() { runOnUiThread(() -> ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT)); }

        @JavascriptInterface
        public void exit() { runOnUiThread(() -> finish()); }
    }
}
