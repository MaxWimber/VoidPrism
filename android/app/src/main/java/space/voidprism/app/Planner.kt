package space.voidprism.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar

object Planner {
    private const val PREFS = "voidprism_alarms"
    private const val SENT = "sent"
    private const val REMIND_REQUEST = 42
    private const val WIDGET_REQUEST = 43
    private const val LATE_WINDOW = 12 * 60 * 60 * 1000L

    fun arm(context: Context) {
        val app = context.applicationContext
        scheduleNextReminder(app)
        scheduleWidgetTick(app)
    }

    fun deliver(context: Context, firedId: String?) {
        val app = context.applicationContext
        val now = System.currentTimeMillis()
        val due = upcoming(app).filter { entry ->
            val at = entry.whenAt ?: return@filter false
            val late = now - at
            late in 0..LATE_WINDOW && !wasSent(app, entry)
        }
        val chosen = if (firedId.isNullOrBlank()) due else {
            val match = due.filter { it.id == firedId }
            if (match.isNotEmpty()) match else due
        }
        for (entry in chosen) {
            Notifier.show(app, entry)
            markSent(app, entry)
        }
        upcoming(app).filter { entry ->
            val at = entry.whenAt ?: return@filter false
            now - at > LATE_WINDOW
        }.forEach { markSent(app, it) }
        WidgetUpdater.refreshAll(app)
        arm(app)
    }

    private fun scheduleNextReminder(context: Context) {
        val next = upcoming(context).firstOrNull { entry ->
            val at = entry.whenAt ?: return@firstOrNull false
            at > System.currentTimeMillis() && !wasSent(context, entry)
        }
        val intent = Intent(context, PlanAlarmReceiver::class.java).apply {
            action = PlanAlarmReceiver.ACTION_REMIND
            if (next != null) putExtra(AppLinks.EXTRA_ID, next.id)
        }
        val pending = pending(context, REMIND_REQUEST, intent)
        val alarm = context.getSystemService(AlarmManager::class.java)
        if (next?.whenAt == null) {
            alarm.cancel(pending)
            return
        }
        fireAt(alarm, next.whenAt, pending)
    }

    private fun scheduleWidgetTick(context: Context) {
        val intent = Intent(context, PlanAlarmReceiver::class.java).apply {
            action = PlanAlarmReceiver.ACTION_WIDGET
        }
        val pending = pending(context, WIDGET_REQUEST, intent)
        val alarm = context.getSystemService(AlarmManager::class.java)
        val soon = System.currentTimeMillis() + 15 * 60 * 1000L
        val midnight = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 5)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        fireAt(alarm, minOf(soon, midnight), pending)
    }

    private fun fireAt(alarm: AlarmManager, at: Long, pending: PendingIntent) {
        val trigger = at.coerceAtLeast(System.currentTimeMillis() + 1000L)
        val exact = Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()
        if (exact) alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending)
        else alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending)
    }

    private fun pending(context: Context, request: Int, intent: Intent): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            request,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun upcoming(context: Context): List<VaultEntry> =
        VaultStore.entries(context)
            .filter { entry ->
                val at = entry.whenAt ?: return@filter false
                (entry.kind == "task" || entry.kind == "event") &&
                    entry.status != "done" &&
                    hasClock(at)
            }
            .sortedBy { it.whenAt }

    private fun hasClock(stamp: Long): Boolean {
        val cal = Calendar.getInstance().apply { timeInMillis = stamp }
        return cal.get(Calendar.HOUR_OF_DAY) != 0 || cal.get(Calendar.MINUTE) != 0
    }

    private fun keyOf(entry: VaultEntry) = "${entry.id}:${entry.whenAt}"

    private fun wasSent(context: Context, entry: VaultEntry): Boolean =
        sent(context).contains(keyOf(entry))

    private fun markSent(context: Context, entry: VaultEntry) {
        val next = sent(context).toMutableSet()
        next.add(keyOf(entry))
        while (next.size > 300) next.remove(next.first())
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(SENT, next)
            .commit()
    }

    private fun sent(context: Context): Set<String> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(SENT, emptySet())
            ?.toSet()
            ?: emptySet()
}
