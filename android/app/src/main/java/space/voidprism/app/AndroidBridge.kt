package space.voidprism.app

import android.content.Context
import android.webkit.JavascriptInterface

class AndroidBridge(private val context: Context) {
    private val feedback = Feedback(context)

    @JavascriptInterface
    fun saveVault(json: String?) {
        if (json.isNullOrBlank()) return
        VaultStore.save(context.applicationContext, json)
    }

    /** Короткая вибрация на действие: tick, check, save, done, hold, remove… */
    @JavascriptInterface
    fun haptic(kind: String?) {
        feedback.vibrate(kind ?: return)
    }

    /** Тихий звук действия — системным потоком, а не мультимедиа. */
    @JavascriptInterface
    fun sound(kind: String?) {
        feedback.sound(kind ?: return)
    }
}
