package space.voidprism.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent

object WidgetUpdater {
    fun refreshAll(context: Context) {
        val app = context.applicationContext
        val manager = AppWidgetManager.getInstance(app)
        val calendarIds = manager.getAppWidgetIds(ComponentName(app, CalendarWidgetProvider::class.java))
        if (calendarIds.isNotEmpty()) {
            val intent = Intent(app, CalendarWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, calendarIds)
            }
            app.sendBroadcast(intent)
        }
        val taskIds = manager.getAppWidgetIds(ComponentName(app, TasksWidgetProvider::class.java))
        if (taskIds.isNotEmpty()) {
            val intent = Intent(app, TasksWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, taskIds)
            }
            app.sendBroadcast(intent)
        }
    }
}
