package com.campusos.agent

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService

class VoiceInputModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var model: Model? = null
    private var speechService: SpeechService? = null
    private var activePromise: Promise? = null
    private var loadingPromise: Promise? = null
    private var bestText = ""

    override fun getName(): String = "VoiceInput"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        if (model != null) {
            promise.resolve(true)
            return
        }
        ensureModelLoaded(promise)
    }

    @ReactMethod
    fun start(localeTag: String?, promise: Promise) {
        if (activePromise != null) {
            promise.reject("speech_busy", "语音识别正在进行中")
            return
        }
        val currentModel = model
        if (currentModel == null) {
            ensureModelLoaded(promise)
            return
        }

        try {
            bestText = ""
            activePromise = promise
            val recognizer = Recognizer(currentModel, SAMPLE_RATE)
            speechService = SpeechService(recognizer, SAMPLE_RATE)
            speechService?.startListening(object : RecognitionListener {
                override fun onPartialResult(hypothesis: String?) {
                    val text = parseText(hypothesis)
                    if (text.isNotBlank()) {
                        bestText = text
                        emitPartial(text)
                    }
                }

                override fun onResult(hypothesis: String?) {
                    val text = parseText(hypothesis)
                    if (text.isNotBlank()) {
                        bestText = text
                        emitPartial(text)
                    }
                }

                override fun onFinalResult(hypothesis: String?) {
                    val text = parseText(hypothesis).ifBlank { bestText }
                    finishWithResult(text)
                }

                override fun onError(exception: Exception?) {
                    finishWithError("speech_error", exception?.message ?: "Vosk 语音识别失败")
                }

                override fun onTimeout() {
                    finishWithResult(bestText)
                }
            }, LISTEN_TIMEOUT_MS)
        } catch (e: Exception) {
            cleanupSpeech()
            activePromise = null
            promise.reject("speech_start_failed", e.message ?: "无法启动 Vosk 语音识别")
        }
    }

    @ReactMethod
    fun stop() {
        speechService?.stop()
    }

    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Int) = Unit

    private fun ensureModelLoaded(promise: Promise) {
        if (loadingPromise != null) {
            promise.reject("model_loading", "语音模型正在加载，请稍后再试")
            return
        }
        loadingPromise = promise
        StorageService.unpack(
            reactContext,
            MODEL_ASSET_NAME,
            MODEL_OUTPUT_NAME,
            { unpackedModel ->
                model = unpackedModel
                loadingPromise?.resolve(true)
                loadingPromise = null
            },
            { exception ->
                loadingPromise?.reject("model_load_failed", exception.message ?: "语音模型加载失败")
                loadingPromise = null
            },
        )
    }

    private fun finishWithResult(text: String) {
        val promise = activePromise
        cleanupSpeech()
        activePromise = null
        if (text.isBlank()) {
            promise?.reject("speech_empty", "没有识别到语音")
        } else {
            promise?.resolve(text)
        }
    }

    private fun finishWithError(code: String, message: String) {
        val promise = activePromise
        cleanupSpeech()
        activePromise = null
        promise?.reject(code, message)
    }

    private fun cleanupSpeech() {
        speechService?.stop()
        speechService?.shutdown()
        speechService = null
    }

    private fun parseText(hypothesis: String?): String {
        if (hypothesis.isNullOrBlank()) return ""
        return try {
            JSONObject(hypothesis).optString("text", "").trim()
        } catch (_: Exception) {
            ""
        }
    }

    private fun emitPartial(text: String) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("VoiceInputPartial", text)
    }

    override fun invalidate() {
        super.invalidate()
        cleanupSpeech()
        model?.close()
        model = null
        activePromise = null
        loadingPromise = null
    }

    companion object {
        private const val MODEL_ASSET_NAME = "vosk-model-small-cn-0.22"
        private const val MODEL_OUTPUT_NAME = "vosk-model-cn"
        private const val SAMPLE_RATE = 16000.0f
        private const val LISTEN_TIMEOUT_MS = 7000
    }
}
