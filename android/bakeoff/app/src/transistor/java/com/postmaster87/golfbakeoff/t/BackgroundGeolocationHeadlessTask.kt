package com.postmaster87.golfbakeoff.t

import com.postmaster87.golfbakeoff.Recorder
import com.postmaster87.golfbakeoff.SessionLog
import com.transistorsoft.locationmanager.event.EventName
import com.transistorsoft.locationmanager.event.HeadlessEvent
import org.greenrobot.eventbus.Subscribe

/**
 * Where transistorsoft sends its events while "headless": a process with no
 * live screen, such as the app restarted by Android after being killed
 * mid-round.
 *
 * The SDK finds this class by name, `<application id>.BackgroundGeolocationHeadlessTask`
 * (HeadlessEventTx.classForName), and while headless it delivers ONLY here,
 * never to in-app listeners (EventManager.deliver, 4.5.1 source). Without it,
 * the emulator smoke test on 2026-09-13 showed T's own database still filling
 * at 1 Hz after `kill -9` while the app's log received nothing, and logcat said
 * "Attempted to post headless event location but there are no listeners".
 */
class BackgroundGeolocationHeadlessTask {

    @Subscribe
    fun onHeadlessTask(event: HeadlessEvent) {
        when (event.getName()) {
            EventName.LOCATION -> {
                val e = event.getLocationEvent() ?: return
                Recorder.recordSdkLocation(
                    location = e.getLocation(),
                    moving = e.isMoving(),
                    sample = e.toMap()["sample"] as? Boolean ?: false,
                    sdkEvent = e.getEvent(),
                    route = "headless",
                    timestamp = e.getTimestamp(),
                )
            }
            EventName.MOTIONCHANGE ->
                SessionLog.event("sdk_motionchange", "moving=${event.getMotionChangeEvent()?.getIsMoving()};route=headless")
            EventName.PROVIDERCHANGE ->
                SessionLog.event("sdk_providerchange", "status=${event.getProviderChangeEvent()?.getStatus()};route=headless")
            EventName.POWERSAVECHANGE ->
                SessionLog.event("sdk_battery_saver", "on=${event.getPowerSaveChangeEvent()?.isPowerSaveMode()};route=headless")
            else ->
                SessionLog.event("sdk_headless_event", "name=${event.getName()}")
        }
    }
}
