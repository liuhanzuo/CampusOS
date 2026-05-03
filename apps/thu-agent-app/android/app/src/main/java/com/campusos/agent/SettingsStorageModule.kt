package com.campusos.agent

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SettingsStorageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SettingsStorage"

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        val value = preferences().getString(key, null)
        promise.resolve(value)
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        preferences().edit().putString(key, value).apply()
        promise.resolve(true)
    }

    private fun preferences() =
        reactContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val PREFERENCES_NAME = "campusos_agent_settings"
    }
}
