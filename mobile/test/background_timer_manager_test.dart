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
}
