package expo.modules.jarviswavrecorder

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

private const val SAMPLE_RATE = 16000
private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
private const val HEADER_SIZE = 44

class JarvisWavRecorderModule : Module() {
  private var recorder: AudioRecord? = null
  private var writer: Thread? = null
  private var output: File? = null
  @Volatile private var running = false

  override fun definition() = ModuleDefinition {
    Name("JarvisWavRecorder")

    // The JS side asks for RECORD_AUDIO before calling this.
    AsyncFunction("start") { start() }
    AsyncFunction("stop") { stop() }
    OnDestroy { release() }
  }

  @SuppressLint("MissingPermission")
  private fun start() {
    check(recorder == null) { "Already recording" }
    val minBuffer = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
    check(minBuffer > 0) { "16 kHz mono PCM recording is not supported on this device" }
    val bufferSize = minBuffer * 4
    val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, CHANNEL, ENCODING, bufferSize)
    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      rec.release()
      throw IllegalStateException("Microphone could not be opened")
    }
    val file = File(appContext.cacheDirectory, "recording-${System.currentTimeMillis()}.wav")
    rec.startRecording()
    running = true
    recorder = rec
    output = file
    writer = Thread {
      FileOutputStream(file).use { out ->
        out.write(ByteArray(HEADER_SIZE)) // filled in by stop() once the data size is known
        val buf = ByteArray(bufferSize)
        while (running) {
          val n = rec.read(buf, 0, buf.size)
          if (n < 0) break
          out.write(buf, 0, n)
        }
      }
    }.apply { start() }
  }

  private fun stop(): String {
    val file = checkNotNull(output) { "Not recording" }
    release()
    RandomAccessFile(file, "rw").use { it.write(wavHeader((file.length() - HEADER_SIZE).toInt())) }
    return Uri.fromFile(file).toString()
  }

  private fun release() {
    running = false
    writer?.join()
    recorder?.run {
      stop()
      release()
    }
    writer = null
    recorder = null
    output = null
  }
}

/** A canonical 44-byte RIFF header for 16 kHz mono 16-bit PCM. */
internal fun wavHeader(dataSize: Int): ByteArray {
  val byteRate = SAMPLE_RATE * 2
  return ByteBuffer.allocate(HEADER_SIZE).order(ByteOrder.LITTLE_ENDIAN).apply {
    put("RIFF".toByteArray()); putInt(36 + dataSize); put("WAVE".toByteArray())
    put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
    putInt(SAMPLE_RATE); putInt(byteRate); putShort(2); putShort(16)
    put("data".toByteArray()); putInt(dataSize)
  }.array()
}
