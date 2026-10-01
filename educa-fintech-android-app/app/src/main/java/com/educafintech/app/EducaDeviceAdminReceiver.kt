package com.educafintech.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class EducaDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "Educa Fintech Security Activated", Toast.LENGTH_SHORT).show()
        UninstallProtectSDK.reportStatus(context, "active")
        UninstallProtectSDK.reportAlert(context, "admin_enabled", "Device administrator activated")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        UninstallProtectSDK.reportAlert(
            context,
            "admin_disable_requested",
            "Someone attempted to deactivate Device Administrator"
        )
        try {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            context.startActivity(launchIntent)
        } catch (_: Exception) {}
        return context.getString(R.string.admin_warning_msg)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "Security Deactivated", Toast.LENGTH_SHORT).show()
        UninstallProtectSDK.reportStatus(context, "inactive")
        UninstallProtectSDK.reportAlert(context, "admin_disabled", "Device administrator was deactivated")
    }
}
