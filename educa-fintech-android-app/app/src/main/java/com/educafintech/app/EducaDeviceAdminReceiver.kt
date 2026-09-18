package com.educafintech.app

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class EducaDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "Educa Child Protection Activated", Toast.LENGTH_SHORT).show()
        UninstallProtectSDK.reportStatus(context, "active")
        UninstallProtectSDK.reportAlert(context, "admin_enabled", "Device administrator activated")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        // Warn the user trying to deactivate in Android settings
        UninstallProtectSDK.reportAlert(
            context,
            "admin_disable_requested",
            "Someone attempted to deactivate Device Administrator on child device"
        )
        return context.getString(R.string.admin_warning_msg)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "Protection Deactivated", Toast.LENGTH_SHORT).show()
        UninstallProtectSDK.reportStatus(context, "inactive")
        UninstallProtectSDK.reportAlert(context, "admin_disabled", "Device administrator was deactivated")
    }
}
