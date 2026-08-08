import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/services/focus_music.dart';

// Focus-music gating tests (ticket 05 AC #4/#5). The player sits behind an
// interface, so a fake records start/stop commands and we assert they fire on
// the correct session transitions — only when enabled, only for a running
// focus session. Real playback is device-verified separately.

class _RecordingPlayer implements FocusMusicPlayer {
  final List<String> calls = <String>[];

  @override
  Future<void> start() async => calls.add('start');

  @override
  Future<void> stop() async => calls.add('stop');
}

void main() {
  group('shouldPlayFocusMusic', () {
    test('plays only for a running, enabled focus session', () {
      expect(
          shouldPlayFocusMusic(
              sessionType: 'focus', isRunning: true, enabled: true),
          isTrue);
    });

    test('disabled → never plays, even mid focus session', () {
      expect(
          shouldPlayFocusMusic(
              sessionType: 'focus', isRunning: true, enabled: false),
          isFalse);
    });

    test('breaks never play', () {
      expect(
          shouldPlayFocusMusic(
              sessionType: 'shortBreak', isRunning: true, enabled: true),
          isFalse);
      expect(
          shouldPlayFocusMusic(
              sessionType: 'longBreak', isRunning: true, enabled: true),
          isFalse);
    });

    test('a paused focus session does not play', () {
      expect(
          shouldPlayFocusMusic(
              sessionType: 'focus', isRunning: false, enabled: true),
          isFalse);
    });
  });

  group('FocusMusicController.sync', () {
    test('issues start when a focus session begins (enabled)', () async {
      final player = _RecordingPlayer();
      final controller = FocusMusicController(player);
      await controller.sync(
          sessionType: 'focus', isRunning: true, enabled: true);
      expect(player.calls, ['start']);
      expect(controller.isPlaying, isTrue);
    });

    test('issues stop at session end (focus completes → break)', () async {
      final player = _RecordingPlayer();
      final controller = FocusMusicController(player);
      await controller.sync(
          sessionType: 'focus', isRunning: true, enabled: true);
      // Session ends: not running, switching to a break.
      await controller.sync(
          sessionType: 'shortBreak', isRunning: false, enabled: true);
      expect(player.calls, ['start', 'stop']);
      expect(controller.isPlaying, isFalse);
    });

    test('does not play during a break even when running + enabled', () async {
      final player = _RecordingPlayer();
      final controller = FocusMusicController(player);
      await controller.sync(
          sessionType: 'shortBreak', isRunning: true, enabled: true);
      expect(player.calls, isEmpty); // breaks stay quiet
    });

    test('stopping when the setting is toggled off mid-session', () async {
      final player = _RecordingPlayer();
      final controller = FocusMusicController(player);
      await controller.sync(
          sessionType: 'focus', isRunning: true, enabled: true);
      await controller.sync(
          sessionType: 'focus', isRunning: true, enabled: false); // user toggled off
      expect(player.calls, ['start', 'stop']);
    });

    test('is idempotent — repeated identical sync issues one command', () async {
      final player = _RecordingPlayer();
      final controller = FocusMusicController(player);
      for (var i = 0; i < 5; i++) {
        await controller.sync(
            sessionType: 'focus', isRunning: true, enabled: true);
      }
      expect(player.calls, ['start']); // no duplicate starts
    });
  });
}
