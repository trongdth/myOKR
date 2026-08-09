import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/main.dart';

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _LifecycleRecordingProvider extends StorageProvider {
  _LifecycleRecordingProvider()
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    isLoading = false;
  }

  int pauseCalls = 0;
  int resumeCalls = 0;

  @override
  void pauseSync() {
    pauseCalls++;
  }

  @override
  void resumeSync() {
    resumeCalls++;
  }

  @override
  Future<void> initSync() async {}

  @override
  Future<void> loadAllData() async {
    isLoading = false;
    notifyListeners();
  }
}

void main() {
  testWidgets('MyApp pauses sync on background and resumes on foreground',
      (tester) async {
    final provider = _LifecycleRecordingProvider();

    await tester.pumpWidget(MyApp(provider: provider));
    await tester.pump();

    expect(provider.pauseCalls, 0);
    expect(provider.resumeCalls, 0);

    // Backgrounded: the real sequence inactive -> hidden -> paused.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump();
    expect(provider.pauseCalls, 3);

    // Foregrounded: the real reverse sequence paused -> hidden -> inactive
    // -> resumed; the sync timer restarts only on resumed.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    // 5 pauses: 3 on the way down (inactive/hidden/paused) + 2 on the way up
    // (hidden/inactive). The extra up-path pauses are harmless — the timer
    // is restarted by the resumed call right after.
    expect(provider.pauseCalls, 5);
    expect(provider.resumeCalls, 1);
  });
}
