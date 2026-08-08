import 'dart:io';
import 'package:live_activities/live_activities.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

class BackgroundTimerManager {
  static final _liveActivitiesPlugin = LiveActivities();
  static String? _latestActivityId;

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

  // --- NATIVE PLUGIN WRAPPERS ---

  static Future<void> initialize() async {
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
  }

  static Future<void> startOrUpdateTimer({
    required String sessionType,
    required String taskName,
    required int remainingSeconds,
  }) async {
    if (Platform.isIOS) {
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
  }

  static Future<void> stopTimer() async {
    if (Platform.isIOS && _latestActivityId != null) {
      await _liveActivitiesPlugin.endActivity(_latestActivityId!);
      _latestActivityId = null;
    } else if (Platform.isAndroid) {
      await FlutterForegroundTask.stopService();
    }
  }
}
