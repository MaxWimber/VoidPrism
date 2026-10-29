package space.voidprism.app

import android.content.Context

object WidgetPrefs {
    private const val PREFS = "voidprism_widgets"

    fun setTaskRange(context: Context, appWidgetId: Int, range: TaskRange) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("tasks_$appWidgetId", range.key)
            .apply()
    }

    fun taskRange(context: Context, appWidgetId: Int): TaskRange =
        TaskRange.fromKey(
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString("tasks_$appWidgetId", TaskRange.DAY.key),
        )

    fun delete(context: Context, appWidgetId: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove("tasks_$appWidgetId")
            .apply()
    }
}
