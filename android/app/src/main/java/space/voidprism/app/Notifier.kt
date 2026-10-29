package space.voidprism.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Notifier {
    private const val CHANNEL = "plans"

    fun show(context: Context, entry: VaultEntry) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            val channel = NotificationChannel(
                CHANNEL,
                "Сроки задач",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Напоминание, когда наступает время задачи или события"
            }
            manager.createNotificationChannel(channel)
        }
        val stamp = entry.whenAt ?: return
        val whenLabel = SimpleDateFormat("d MMMM HH:mm", Locale("ru")).format(Date(stamp))
        val kind = if (entry.kind == "event") "Событие" else "Задача"
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_plan)
            .setContentTitle(entry.title)
            .setContentText("$kind · $whenLabel")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(
                AppLinks.open(context, AppLinks.OPEN_EDIT, stamp, entry.id, 7000 + entry.id.hashCode()),
            )
            .build()
        NotificationManagerCompat.from(context).notify(entry.id.hashCode(), notification)
    }
}
