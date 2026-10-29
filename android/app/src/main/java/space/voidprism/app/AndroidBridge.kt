package space.voidprism.app

import android.content.Context
import android.webkit.JavascriptInterface

class AndroidBridge(private val context: Context) {
    @JavascriptInterface
    fun saveVault(json: String?) {
        if (json.isNullOrBlank()) return
        VaultStore.save(context.applicationContext, json)
    }
}
