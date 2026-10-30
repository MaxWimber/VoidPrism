package space.voidprism.app

import android.content.Context
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.JavascriptInterface

class AndroidBridge(private val context: Context, private val view: View) {
    @JavascriptInterface
    fun saveVault(json: String?) {
        if (json.isNullOrBlank()) return
        VaultStore.save(context.applicationContext, json)
    }

    /** Системный тактильный отклик: тот же, что у штатных часов, клавиатуры и долгого нажатия. */
    @JavascriptInterface
    fun haptic(kind: String?) {
        val modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
        val constant = when (kind) {
            "tick" -> HapticFeedbackConstants.CLOCK_TICK
            "hold" -> HapticFeedbackConstants.LONG_PRESS
            "remove" -> if (modern) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
            "check", "save", "done" -> if (modern) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
            else -> HapticFeedbackConstants.KEYBOARD_TAP
        }
        view.post { view.performHapticFeedback(constant) }
    }
}
