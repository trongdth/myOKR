import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:live_activities/live_activities.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

class BackgroundTimerManager {
  static final _liveActivitiesPlugin = LiveActivities();
  static String? _latestActivityId;
  static String? _latestSessionType;
  static String? _latestTaskName;

  /// Pure formatting method for testing and internal use
  static Map<String, dynamic> createLiveActivityPayload({
    required String sessionType,
    required String taskName,
    required int remainingSeconds,
  }) {
    return {
      'sessionType': sessionType,
      'taskName': taskName,
      'remainingSeconds': remainingSeconds,
      'isBreak': sessionType != 'focus',
      // In a real iOS Swift widget, we'd use this target timestamp to let the OS count down natively
      'targetEndTime': DateTime.now().add(Duration(seconds: remainingSeconds)).millisecondsSinceEpoch,
    };
  }

  /// Pure formatting method for Android Foreground Task title
  static String createForegroundTitle(String sessionType) {
    if (sessionType == 'focus') return 'myOKR - Focus';
    if (sessionType == 'shortBreak') return 'myOKR - Short Break';
    if (sessionType == 'longBreak') return 'myOKR - Long Break';
    return 'myOKR Timer';
  }

  /// Pure formatting method for Android Foreground Task body
  static String createForegroundBody(int remainingSeconds, String taskName) {
    final minutes = (remainingSeconds / 60).floor().toString().padLeft(2, '0');
    final seconds = (remainingSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds - $taskName';
  }

  /// Whether the iOS Live Activity needs a create/update given the previous
  /// and current session identity (type + task).
  ///
  /// startOrUpdateTimer runs once per second; the Live Activity's widget
  /// counts down natively from `targetEndTime`, so a per-second update with a
  /// recomputed target would keep RESETTING the countdown. Only session
  /// identity changes (start, end, task switch) need a create/update.
  static bool needsLiveActivityUpdate({
    required String? previousType,
    required String? previousTask,
    required String sessionType,
    required String taskName,
  }) {
    return previousType != sessionType || previousTask != taskName;
  }

  // --- NATIVE PLUGIN WRAPPERS ---

  static Future<void> initialize() async {
    try {
      if (Platform.isIOS) {
        await _liveActivitiesPlugin.init(appGroupId: 'group.com.myokr.mobile');
      } else if (Platform.isAndroid) {
        FlutterForegroundTask.init(
          androidNotificationOptions: AndroidNotificationOptions(
            channelId: 'myokr_timer',
            channelName: 'Pomodoro Timer',
            channelDescription: 'Ongoing Pomodoro session',
            channelImportance: NotificationChannelImportance.LOW,
            priority: NotificationPriority.LOW,
          ),
          iosNotificationOptions: const IOSNotificationOptions(),
          foregroundTaskOptions: ForegroundTaskOptions(
            eventAction: ForegroundTaskEventAction.repeat(1000),
            autoRunOnBoot: false,
            allowWakeLock: true,
            allowWifiLock: true,
          ),
        );
      }
    } catch (e) {
      // A background-integration failure must not crash the session — the
      // in-app timer keeps running without the notification.
      debugPrint('background timer initialize failed: $e');
    }
  }

  static Future<void> startOrUpdateTimer({
    required String sessionType,
    required String taskName,
    required int remainingSeconds,
  }) async {
    try {
      if (Platform.isIOS) {
        // Called once per second while running: an unchanged session must
        // not touch the Live Activity (targetEndTime would keep resetting
        // the native countdown).
        if (!needsLiveActivityUpdate(
          previousType: _latestSessionType,
          previousTask: _latestTaskName,
          sessionType: sessionType,
          taskName: taskName,
        )) {
          return;
        }

        final payload = createLiveActivityPayload(
          sessionType: sessionType,
          taskName: taskName,
          remainingSeconds: remainingSeconds,
        );

        if (_latestActivityId == null) {
          _latestActivityId = await _liveActivitiesPlugin.createActivity('pomodoro_timer', payload);
        } else {
          await _liveActivitiesPlugin.updateActivity(_latestActivityId!, payload);
        }
        _latestSessionType = sessionType;
        _latestTaskName = taskName;
      } else if (Platform.isAndroid) {
        final title = createForegroundTitle(sessionType);
        final body = createForegroundBody(remainingSeconds, taskName);

        if (!await FlutterForegroundTask.isRunningService) {
          // Start service
          await FlutterForegroundTask.startService(
            notificationTitle: title,
            notificationText: body,
          );
        } else {
          // Update notification
          await FlutterForegroundTask.updateService(
            notificationTitle: title,
            notificationText: body,
          );
        }
      }
    } catch (e) {
      // A plugin failure degrades gracefully — the session keeps running
      // in-app without the background notification.
      debugPrint('background timer update failed: $e');
    }
  }

  static Future<void> stopTimer() async {
    try {
      if (Platform.isIOS && _latestActivityId != null) {
        await _liveActivitiesPlugin.endActivity(_latestActivityId!);
        _latestActivityId = null;
      } else if (Platform.isAndroid) {
        await FlutterForegroundTask.stopService();
      }
    } catch (e) {
      debugPrint('background timer stop failed: $e');
    }
    _latestSessionType = null;
    _latestTaskName = null;
  }
}
