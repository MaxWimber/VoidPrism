package space.voidprism.app

import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.sin

/**
 * Отклик приложения: короткая вибрация и тихие звуки.
 * Звуки идут потоком системных звуков (как щелчки клавиатуры), а не мультимедиа:
 * их громкость — это громкость системы/уведомлений, музыка и видео их не глушат.
 * Сами звуки синтезируются один раз при запуске — те же тона, что и в браузере.
 */
class Feedback(context: Context) {
    private val app = context.applicationContext

    private val vibrator: Vibrator? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (app.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            app.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }

    private val pool: SoundPool = SoundPool.Builder()
        .setMaxStreams(4)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .build()

    private val sounds = ConcurrentHashMap<String, Int>()

    init {
        Thread {
            for ((kind, tones) in TONES) {
                val file = File(app.cacheDir, "fb_$kind.wav")
                writeWav(file, synth(tones))
                sounds[kind] = pool.load(file.path, 1)
            }
        }.start()
    }

    fun vibrate(kind: String) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return
        val effect = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> when (kind) {
                "tick" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                "hold", "remove" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                "done" -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK)
                else -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
            }
            else -> VibrationEffect.createOneShot(
                when (kind) {
                    "tick" -> 8L
                    "hold", "remove" -> 30L
                    else -> 16L
                },
                VibrationEffect.DEFAULT_AMPLITUDE,
            )
        }
        v.vibrate(effect)
    }

    fun sound(kind: String) {
        val id = sounds[kind] ?: return
        pool.play(id, 1f, 1f, 1, 0, 1f)
    }

    private data class Tone(
        val freq: Double,
        val at: Double = 0.0,
        val dur: Double = 0.08,
        val gain: Double = 0.3,
        val triangle: Boolean = false,
        val glide: Double = 1.0,
    )

    private companion object {
        const val RATE = 44100

        // Те же сигналы, что в feedback.js; громкость выше, потому что поток системный и тише сам по себе.
        val TONES = mapOf(
            "tick" to listOf(Tone(1950.0, dur = 0.018, gain = 0.32, triangle = true, glide = 0.7)),
            "check" to listOf(Tone(880.0, dur = 0.07, gain = 0.34), Tone(1320.0, at = 0.055, dur = 0.1, gain = 0.3)),
            "uncheck" to listOf(Tone(740.0, dur = 0.08, gain = 0.28, glide = 0.8)),
            "save" to listOf(Tone(660.0, dur = 0.09, gain = 0.28), Tone(990.0, at = 0.07, dur = 0.16, gain = 0.28)),
            "done" to listOf(
                Tone(784.0, dur = 0.08, gain = 0.3),
                Tone(1047.0, at = 0.06, dur = 0.08, gain = 0.3),
                Tone(1568.0, at = 0.12, dur = 0.18, gain = 0.24),
            ),
            "hold" to listOf(Tone(520.0, dur = 0.06, gain = 0.28, glide = 1.3)),
            "remove" to listOf(Tone(300.0, dur = 0.16, gain = 0.42, glide = 0.55)),
        )

        fun synth(tones: List<Tone>): ShortArray {
            val total = tones.maxOf { it.at + it.dur } + 0.02
            val out = DoubleArray((total * RATE).toInt())
            for (tone in tones) {
                val start = (tone.at * RATE).toInt()
                val length = (tone.dur * RATE).toInt()
                val attack = 0.004 * RATE
                var phase = 0.0
                for (i in 0 until length) {
                    val t = i.toDouble() / length
                    // Частота плавно уезжает к freq * glide, как exponentialRamp в Web Audio.
                    val freq = tone.freq * exp(ln(tone.glide) * t)
                    phase += 2 * PI * freq / RATE
                    val wave = if (tone.triangle) 2 / PI * asin(sin(phase)) else sin(phase)
                    val env = if (i < attack) i / attack else exp(-6.9 * (i - attack) / (length - attack))
                    val index = start + i
                    if (index < out.size) out[index] += wave * env * tone.gain
                }
            }
            return ShortArray(out.size) { i -> (out[i].coerceIn(-1.0, 1.0) * Short.MAX_VALUE).toInt().toShort() }
        }

        fun writeWav(file: File, pcm: ShortArray) {
            val data = pcm.size * 2
            val buffer = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN)
            buffer.put("RIFF".toByteArray()).putInt(36 + data).put("WAVE".toByteArray())
            buffer.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
                .putInt(RATE).putInt(RATE * 2).putShort(2).putShort(16)
            buffer.put("data".toByteArray()).putInt(data)
            for (sample in pcm) buffer.putShort(sample)
            FileOutputStream(file).use { it.write(buffer.array()) }
        }
    }
}
