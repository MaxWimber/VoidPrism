package space.voidprism.app

import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object AppLinks {
    const val EXTRA_OPEN = "voidprism_open"
    const val EXTRA_WHEN = "voidprism_when"
    const val EXTRA_ID = "voidprism_id"
    const val OPEN_DAY = "day"
    const val OPEN_EDIT = "edit"
    const val OPEN_NEW_TASK = "new-task"

    fun open(context: Context, kind: String, whenAt: Long = 0L, id: String = "", request: Int): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(EXTRA_OPEN, kind)
            putExtra(EXTRA_WHEN, whenAt)
            putExtra(EXTRA_ID, id)
        }
        return PendingIntent.getActivity(
            context,
            request,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
