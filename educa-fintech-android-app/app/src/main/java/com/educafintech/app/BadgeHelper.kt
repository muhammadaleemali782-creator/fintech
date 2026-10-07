package com.educafintech.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Manages numeric badge counter on launcher app icons (1, 2 etc. based on unread notification count)
 * Supports Android 8+ Notification Badges, Samsung, Xiaomi MIUI/HyperOS, Oppo, Vivo, Sony, and Huawei.
 */
object BadgeHelper {

    private const val PREFS = "educa_badge_prefs"
    private const val KEY_COUNT = "unread_notification_count"

    fun incrementBadge(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val current = prefs.getInt(KEY_COUNT, 0) + 1
        prefs.edit().putInt(KEY_COUNT, current).apply()
        applyBadgeToLaunchers(context, current)
        return current
    }

    fun clearBadge(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putInt(KEY_COUNT, 0).apply()
        applyBadgeToLaunchers(context, 0)
    }

    fun getBadgeCount(context: Context): Int {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_COUNT, 0)
    }

    private fun applyBadgeToLaunchers(context: Context, count: Int) {
        try {
            // 1. Samsung / LG / Sony / Android Standard Launcher Badge intent
            val intent = Intent("android.intent.action.BADGE_COUNT_UPDATE").apply {
                putExtra("badge_count", count)
                putExtra("badge_count_package_name", context.packageName)
                putExtra("badge_count_class_name", MainActivity::class.java.name)
            }
            context.sendBroadcast(intent)
        } catch (_: Exception) {}

        try {
            // 2. Xiaomi MIUI / HyperOS launcher badge update
            val miuiIntent = Intent("android.intent.action.APPLICATION_MESSAGE_UPDATE").apply {
                putExtra("android.intent.extra.update_application_component_name", "${context.packageName}/${MainActivity::class.java.name}")
                putExtra("android.intent.extra.update_application_message_text", if (count > 0) count.toString() else "")
            }
            context.sendBroadcast(miuiIntent)
        } catch (_: Exception) {}

        try {
            // 3. HTC launcher badge
            val htcIntent = Intent("com.htc.launcher.action.SET_NOTIFICATION").apply {
                putExtra("com.htc.launcher.extra.COMPONENT", "${context.packageName}/${MainActivity::class.java.name}")
                putExtra("com.htc.launcher.extra.COUNT", count)
            }
            context.sendBroadcast(htcIntent)
        } catch (_: Exception) {}
    }
}
