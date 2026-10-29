package space.voidprism.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Color
import android.widget.RemoteViews
import java.util.Calendar

class CalendarWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context))
        }
    }

    companion object {
        private val OUT_MONTH = Color.parseColor("#4A5168")
        private val NORMAL = Color.parseColor("#D7DEF8")
        private val PLANNED = Color.parseColor("#7EE7FF")
        private val TODAY = Color.parseColor("#EEF2FF")

        fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_calendar)
            val now = Calendar.getInstance()
            val year = now.get(Calendar.YEAR)
            val month = now.get(Calendar.MONTH)
            val today = now.get(Calendar.DAY_OF_MONTH)
            val planned = VaultStore.daysWithPlans(context, year, month)

            views.setTextViewText(R.id.widget_cal_title, monthTitle(year, month))
            views.setTextViewText(R.id.widget_cal_subtitle, "VoidPrism · календарь")

            val grid = Calendar.getInstance().apply {
                set(Calendar.YEAR, year)
                set(Calendar.MONTH, month)
                set(Calendar.DAY_OF_MONTH, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 0)
                set(Calendar.MILLISECOND, 0)
            }
            val offset = (grid.get(Calendar.DAY_OF_WEEK) + 5) % 7
            grid.add(Calendar.DAY_OF_MONTH, -offset)

            for (week in 0 until 6) {
                for (dow in 0 until 7) {
                    val day = grid.get(Calendar.DAY_OF_MONTH)
                    val inMonth = grid.get(Calendar.MONTH) == month
                    val viewId = context.resources.getIdentifier(
                        "d$week$dow",
                        "id",
                        context.packageName,
                    )
                    if (viewId != 0) {
                        views.setTextViewText(viewId, day.toString())
                        views.setOnClickPendingIntent(
                            viewId,
                            AppLinks.open(
                                context,
                                AppLinks.OPEN_DAY,
                                grid.timeInMillis,
                                request = 3200 + week * 7 + dow,
                            ),
                        )
                        val isToday = inMonth && day == today
                        val hasPlan = inMonth && planned.contains(day)
                        when {
                            isToday -> {
                                views.setTextColor(viewId, TODAY)
                                views.setInt(viewId, "setBackgroundResource", R.drawable.widget_day_today)
                            }
                            hasPlan -> {
                                views.setTextColor(viewId, PLANNED)
                                views.setInt(viewId, "setBackgroundResource", 0)
                            }
                            inMonth -> {
                                views.setTextColor(viewId, NORMAL)
                                views.setInt(viewId, "setBackgroundResource", 0)
                            }
                            else -> {
                                views.setTextColor(viewId, OUT_MONTH)
                                views.setInt(viewId, "setBackgroundResource", 0)
                            }
                        }
                    }
                    grid.add(Calendar.DAY_OF_MONTH, 1)
                }
            }

            val hint = if (planned.isEmpty()) {
                "Откройте приложение — появятся планы"
            } else {
                "• ${planned.size} дн. с планами"
            }
            views.setTextViewText(R.id.widget_cal_hint, hint)
            views.setOnClickPendingIntent(
                R.id.widget_cal_title,
                AppLinks.open(context, AppLinks.OPEN_DAY, now.timeInMillis, request = 3100),
            )
            return views
        }
    }
}
