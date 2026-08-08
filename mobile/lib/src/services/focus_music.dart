import 'dart:async';

import 'package:just_audio/just_audio.dart';

/// Ambient focus music for a pomodoro focus session (ADR-0005).
///
/// Desktop generates the Am–F–C–G pad *live* via the Web Audio API; mobile has no
/// Web Audio, so per ADR-0005 it bundles a short offline render of that same
/// four-chord loop (`assets/audio/focus_loop.wav`) and plays/loops it via
/// just_audio, gated by the `focusMusicEnabled` setting.
///
/// The player sits behind this interface so the gating logic is testable without
/// real audio (ticket 05 AC #4): tests inject a fake player and assert the
/// start/stop commands issued on each session transition.
abstract class FocusMusicPlayer {
  Future<void> start();
  Future<void> stop();
}

/// Whether music should be playing right now. Pure — unit-testable, mirrors the
/// "pure decision method" prior art in BackgroundTimerManager.
///
/// Music plays only during an actively-running focus session the user has opted
/// into. It stops at session end, during breaks, when paused, and when the
/// setting is off (ticket 05 AC #2).
bool shouldPlayFocusMusic({
  required String sessionType,
  required bool isRunning,
  required bool enabled,
}) {
  return enabled && isRunning && sessionType == 'focus';
}

/// Owns the play/stop decision and drives an injected [FocusMusicPlayer].
///
/// Call [sync] whenever the session state or the setting changes; it issues a
/// start/stop to the player only on the true→false / false→true edge
/// (idempotent), so it is safe to call repeatedly from every timer transition.
class FocusMusicController {
  FocusMusicController(this._player);

  final FocusMusicPlayer _player;
  bool _playing = false;

  /// Whether the controller currently believes music is playing. Exposed for
  /// tests/diagnostics; production drives the player via [sync].
  bool get isPlaying => _playing;

  Future<void> sync({
    required String sessionType,
    required bool isRunning,
    required bool enabled,
  }) async {
    final want = shouldPlayFocusMusic(
      sessionType: sessionType,
      isRunning: isRunning,
      enabled: enabled,
    );
    if (want && !_playing) {
      await _player.start();
      _playing = true;
    } else if (!want && _playing) {
      await _player.stop();
      _playing = false;
    }
  }

  /// Stop unconditionally (e.g. on app teardown), regardless of tracked state.
  Future<void> dispose() async {
    if (_playing) {
      await _player.stop();
      _playing = false;
    }
  }
}

/// just_audio-backed player that loops the bundled Am–F–C–G render.
///
/// Real playback and background continuation can only be verified on a device
/// (ticket 05 AC #2/#3); the gating that decides *when* to call these methods
/// is verified separately with a fake player.
class JustAudioFocusMusicPlayer implements FocusMusicPlayer {
  JustAudioFocusMusicPlayer();

  final AudioPlayer _player = AudioPlayer();
  bool _prepared = false;

  Future<void> _prepare() async {
    if (_prepared) return;
    await _player.setAsset('assets/audio/focus_loop.wav');
    await _player.setLoopMode(LoopMode.one);
    _prepared = true;
  }

  @override
  Future<void> start() async {
    await _prepare();
    // play() returns a future that completes on stop/completion; for a looping
    // asset it stays pending, so we don't await it — start() must return.
    unawaited(_player.play());
  }

  @override
  Future<void> stop() => _player.pause();
}
