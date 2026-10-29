package space.voidprism.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PlanAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val app = context.applicationContext
        when (intent?.action) {
            ACTION_REMIND -> Planner.deliver(app, intent.getStringExtra(AppLinks.EXTRA_ID))
            ACTION_WIDGET, Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> {
                WidgetUpdater.refreshAll(app)
                Planner.arm(app)
            }
        }
    }

    companion object {
        const val ACTION_REMIND = "space.voidprism.app.REMIND"
        const val ACTION_WIDGET = "space.voidprism.app.WIDGET_TICK"
    }
}
