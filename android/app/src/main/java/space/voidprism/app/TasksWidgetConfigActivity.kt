package space.voidprism.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.RadioGroup

class TasksWidgetConfigActivity : Activity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        setContentView(R.layout.activity_tasks_widget_config)

        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        findViewById<Button>(R.id.btn_add).setOnClickListener {
            val range = when (findViewById<RadioGroup>(R.id.range_group).checkedRadioButtonId) {
                R.id.range_week -> TaskRange.WEEK
                R.id.range_month -> TaskRange.MONTH
                else -> TaskRange.DAY
            }
            WidgetPrefs.setTaskRange(this, appWidgetId, range)
            val manager = AppWidgetManager.getInstance(this)
            manager.updateAppWidget(appWidgetId, TasksWidgetProvider.buildViews(this, appWidgetId))
            setResult(
                RESULT_OK,
                Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId),
            )
            finish()
        }
    }
}
