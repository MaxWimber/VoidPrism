package space.voidprism.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class TasksWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context, id))
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            WidgetPrefs.delete(context, id)
        }
    }

    companion object {
        private val TASK_IDS = intArrayOf(
            R.id.task0, R.id.task1, R.id.task2, R.id.task3,
            R.id.task4, R.id.task5, R.id.task6, R.id.task7,
        )
        private val timeFmt = SimpleDateFormat("d MMM HH:mm", Locale("ru"))
        private val dayFmt = SimpleDateFormat("d MMM", Locale("ru"))

        fun buildViews(context: Context, appWidgetId: Int): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_tasks)
            val range = WidgetPrefs.taskRange(context, appWidgetId)
            val items = VaultStore.plannedForRange(context, range)
            val hasVault = !VaultStore.raw(context).isNullOrBlank()

            views.setTextViewText(R.id.widget_tasks_title, "Задачи")
            views.setTextViewText(R.id.widget_tasks_range, range.label)
            val today = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 0)
                set(java.util.Calendar.MILLISECOND, 0)
            }.timeInMillis
            views.setOnClickPendingIntent(
                R.id.widget_tasks_add,
                AppLinks.open(context, AppLinks.OPEN_NEW_TASK, today, request = 6100 + appWidgetId),
            )

            for (lineId in TASK_IDS) {
                views.setViewVisibility(lineId, View.GONE)
            }

            if (items.isEmpty()) {
                views.setViewVisibility(R.id.widget_tasks_empty, View.VISIBLE)
                views.setTextViewText(
                    R.id.widget_tasks_empty,
                    when {
                        !hasVault -> "Откройте VoidPrism — данные появятся здесь"
                        range == TaskRange.DAY -> "На сегодня задач нет"
                        range == TaskRange.WEEK -> "На эту неделю задач нет"
                        else -> "На этот месяц задач нет"
                    },
                )
            } else {
                views.setViewVisibility(R.id.widget_tasks_empty, View.GONE)
                val overflow = items.size > TASK_IDS.size
                val limit = if (overflow) TASK_IDS.size - 1 else TASK_IDS.size
                items.take(limit).forEachIndexed { index, entry ->
                    val lineId = TASK_IDS[index]
                    val mark = when (entry.kind) {
                        "event" -> "◆"
                        "task" -> "○"
                        else -> "·"
                    }
                    val whenLabel = entry.whenAt?.let { stamp ->
                        if (range == TaskRange.DAY) timeFmt.format(Date(stamp))
                        else dayFmt.format(Date(stamp))
                    }.orEmpty()
                    val text = if (whenLabel.isNotEmpty()) {
                        "$mark $whenLabel · ${entry.title}"
                    } else {
                        "$mark ${entry.title}"
                    }
                    views.setTextViewText(lineId, text)
                    views.setViewVisibility(lineId, View.VISIBLE)
                    views.setOnClickPendingIntent(
                        lineId,
                        AppLinks.open(
                            context,
                            AppLinks.OPEN_EDIT,
                            entry.whenAt ?: 0L,
                            entry.id,
                            request = 5000 + appWidgetId * 20 + index,
                        ),
                    )
                }
                if (overflow) {
                    val last = TASK_IDS.last()
                    views.setTextViewText(last, "… ещё ${items.size - limit}")
                    views.setViewVisibility(last, View.VISIBLE)
                }
            }

            views.setOnClickPendingIntent(
                R.id.widget_tasks_root,
                AppLinks.open(context, AppLinks.OPEN_DAY, today, request = 6000 + appWidgetId),
            )
            return views
        }
    }
}
