package space.voidprism.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

object VaultStore {
    private const val PREFS = "voidprism_vault"
    private const val KEY_JSON = "vault_json"

    fun save(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_JSON, json)
            .commit()
        WidgetUpdater.refreshAll(context)
        Planner.arm(context)
    }

    fun raw(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null)

    fun entries(context: Context): List<VaultEntry> {
        val json = raw(context) ?: return emptyList()
        return try {
            val root = JSONObject(json)
            val arr = root.optJSONArray("entries") ?: JSONArray()
            buildList {
                for (i in 0 until arr.length()) {
                    val item = arr.optJSONObject(i) ?: continue
                    val kind = item.optString("kind")
                    if (kind != "note" && kind != "task" && kind != "event") continue
                    add(
                        VaultEntry(
                            id = item.optString("id"),
                            kind = kind,
                            title = item.optString("title").ifBlank { "Без названия" },
                            status = item.optString("status", "open"),
                            whenAt = item.optLong("when", Long.MIN_VALUE).takeIf { it != Long.MIN_VALUE && item.has("when") },
                            createdAt = item.optLong("createdAt", 0L),
                            updatedAt = item.optLong("updatedAt", 0L),
                        ),
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun plannedForRange(context: Context, range: TaskRange): List<VaultEntry> {
        val (start, end) = range.bounds()
        return entries(context)
            .filter { entry ->
                val stamp = entry.whenAt ?: return@filter false
                if (entry.kind == "wish") return@filter false
                if (entry.kind == "task" && entry.status == "done") return@filter false
                stamp in start until end
            }
            .sortedBy { it.whenAt ?: Long.MAX_VALUE }
    }

    fun daysWithPlans(context: Context, year: Int, month: Int): Set<Int> {
        val cal = Calendar.getInstance()
        return entries(context).mapNotNull { entry ->
            val stamp = entry.whenAt ?: return@mapNotNull null
            if (entry.kind == "task" && entry.status == "done") return@mapNotNull null
            cal.timeInMillis = stamp
            if (cal.get(Calendar.YEAR) == year && cal.get(Calendar.MONTH) == month) {
                cal.get(Calendar.DAY_OF_MONTH)
            } else {
                null
            }
        }.toSet()
    }
}

data class VaultEntry(
    val id: String,
    val kind: String,
    val title: String,
    val status: String,
    val whenAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
)

enum class TaskRange(val key: String, val label: String) {
    DAY("day", "Сегодня"),
    WEEK("week", "Неделя"),
    MONTH("month", "Месяц");

    fun bounds(): Pair<Long, Long> {
        val start = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val end = start.clone() as Calendar
        when (this) {
            DAY -> end.add(Calendar.DAY_OF_MONTH, 1)
            WEEK -> {
                val day = (start.get(Calendar.DAY_OF_WEEK) + 5) % 7
                start.add(Calendar.DAY_OF_MONTH, -day)
                end.timeInMillis = start.timeInMillis
                end.add(Calendar.DAY_OF_MONTH, 7)
            }
            MONTH -> {
                start.set(Calendar.DAY_OF_MONTH, 1)
                end.timeInMillis = start.timeInMillis
                end.add(Calendar.MONTH, 1)
            }
        }
        return start.timeInMillis to end.timeInMillis
    }

    companion object {
        fun fromKey(key: String?): TaskRange =
            entries.find { it.key == key } ?: DAY
    }
}

fun monthTitle(year: Int, month: Int): String {
    val cal = Calendar.getInstance().apply {
        set(Calendar.YEAR, year)
        set(Calendar.MONTH, month)
        set(Calendar.DAY_OF_MONTH, 1)
    }
    return cal.getDisplayName(Calendar.MONTH, Calendar.LONG, Locale("ru"))
        ?.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale("ru")) else it.toString() }
        ?.let { "$it $year" }
        ?: "$month.$year"
}
