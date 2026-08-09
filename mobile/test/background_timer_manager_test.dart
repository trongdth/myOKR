import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/services/background_timer_manager.dart';

void main() {
  group('BackgroundTimerManager Payload Formatting', () {
    test('formats iOS Live Activity payload correctly', () {
      final payload = BackgroundTimerManager.createLiveActivityPayload(
        sessionType: 'focus',
        taskName: 'Review PRs',
        remainingSeconds: 1500, // 25 mins
      );

      expect(payload['sessionType'], 'focus');
      expect(payload['taskName'], 'Review PRs');
      expect(payload['remainingSeconds'], 1500);
      expect(payload['isBreak'], false);
    });

    test('formats Android Foreground Task payload correctly', () {
      final title = BackgroundTimerManager.createForegroundTitle('shortBreak');
      final body = BackgroundTimerManager.createForegroundBody(300, 'Grab coffee');

      expect(title, 'myOKR - Short Break');
      expect(body, '05:00 - Grab coffee');
    });
  });

  group('needsLiveActivityUpdate', () {
    test('first call always needs an update (create)', () {
      expect(
        BackgroundTimerManager.needsLiveActivityUpdate(
          previousType: null,
          previousTask: null,
          sessionType: 'focus',
          taskName: 'Task',
        ),
        isTrue,
      );
    });

    test('per-second ticks with an unchanged session do NOT update', () {
      expect(
        BackgroundTimerManager.needsLiveActivityUpdate(
          previousType: 'focus',
          previousTask: 'Task',
          sessionType: 'focus',
          taskName: 'Task',
        ),
        isFalse,
      );
    });

    test('a session type change needs an update', () {
      expect(
        BackgroundTimerManager.needsLiveActivityUpdate(
          previousType: 'focus',
          previousTask: 'Task',
          sessionType: 'shortBreak',
          taskName: 'Task',
        ),
        isTrue,
      );
    });

    test('a task change needs an update', () {
      expect(
        BackgroundTimerManager.needsLiveActivityUpdate(
          previousType: 'focus',
          previousTask: 'Task A',
          sessionType: 'focus',
          taskName: 'Task B',
        ),
        isTrue,
      );
    });
  });
}
