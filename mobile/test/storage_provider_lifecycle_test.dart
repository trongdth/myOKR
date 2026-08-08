import 'dart:typed_data';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _CountingDropboxService extends DropboxService {
  int syncCount = 0;

  @override
  Future<bool> syncWithDropbox({
    required String clientId,
    required String refreshToken,
    required Future<Uint8List> Function() getLocalBinary,
    required Future<Uint8List> Function(Uint8List remoteBinary)
        mergeExternalBinary,
    bool forceUpload = false,
    bool compactedSinceLastSync = false,
  }) async {
    syncCount++;
    return true;
  }
}

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

void main() {
  test('pauseSync stops and resumeSync restarts the 15-minute sync timer',
      () {
    SharedPreferences.setMockInitialValues(<String, Object>{});

    fakeAsync((async) {
      final service = _CountingDropboxService();
      final provider = StorageProvider(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
        dropboxService: service,
      );
      provider.dropboxClientId = 'client-1';
      provider.dropboxRefreshToken = 'rt-1';

      provider.resumeSync(); // schedules the periodic timer
      async.elapse(const Duration(minutes: 16));
      expect(service.syncCount, 1);

      // Backgrounded: the timer is cancelled, no network calls happen.
      provider.pauseSync();
      async.elapse(const Duration(minutes: 30));
      expect(service.syncCount, 1);

      // Foregrounded again: the timer restarts.
      provider.resumeSync();
      async.elapse(const Duration(minutes: 16));
      expect(service.syncCount, 2);
    });
  });
}
