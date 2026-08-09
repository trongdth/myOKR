import 'dart:typed_data';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _ThrowingSecureStorage extends FlutterSecureStorage {
  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    throw Exception('keychain unavailable');
  }
}

class _ConnectingDropboxService extends DropboxService {
  @override
  Future<String> exchangeDropboxCode(
    String clientId,
    String code,
    String codeVerifier, {
    required String expectedState,
    required String returnedState,
  }) async =>
      'rt-1';

  @override
  Future<bool> validateDropboxToken(String clientId, String refreshToken) async =>
      true;

  @override
  Future<bool> syncWithDropbox({
    required String clientId,
    required String refreshToken,
    required Future<Uint8List> Function() getLocalBinary,
    required Future<Uint8List> Function(Uint8List remoteBinary)
        mergeExternalBinary,
    bool forceUpload = false,
    bool compactedSinceLastSync = false,
  }) async =>
      true;
}

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

  group('Dropbox credential storage (ticket 16)', () {
    test('initSync migrates legacy prefs credentials into secure storage',
        () async {
      SharedPreferences.setMockInitialValues({
        'dropbox_client_id': 'legacy-client',
        'dropbox_refresh_token': 'legacy-token',
        'last_sync_time': '2026-08-01T00:00:00Z',
      });
      FlutterSecureStorage.setMockInitialValues({});

      final provider = StorageProvider(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
      );
      await provider.initSync();

      expect(provider.dropboxClientId, 'legacy-client');
      expect(provider.dropboxRefreshToken, 'legacy-token');
      expect(provider.lastSyncTime, '2026-08-01T00:00:00Z'); // non-secret stays

      const secure = FlutterSecureStorage();
      expect(await secure.read(key: 'dropbox_client_id'), 'legacy-client');
      expect(await secure.read(key: 'dropbox_refresh_token'), 'legacy-token');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('dropbox_client_id'), isNull); // migrated out
      expect(prefs.getString('dropbox_refresh_token'), isNull);
    });

    test('initSync reads credentials from secure storage', () async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({
        'dropbox_client_id': 'sec-client',
        'dropbox_refresh_token': 'sec-token',
      });

      final provider = StorageProvider(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
      );
      await provider.initSync();

      expect(provider.dropboxClientId, 'sec-client');
      expect(provider.dropboxRefreshToken, 'sec-token');
    });

    test('connectDropbox stores credentials in secure storage, not prefs',
        () async {
      SharedPreferences.setMockInitialValues({});
      FlutterSecureStorage.setMockInitialValues({});

      final provider = StorageProvider(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
        dropboxService: _ConnectingDropboxService(),
      );

      final ok = await provider.connectDropbox(
        'client-1',
        'code=abc&state=st8',
        'verifier',
        expectedState: 'st8',
      );
      expect(ok, isTrue);

      const secure = FlutterSecureStorage();
      expect(await secure.read(key: 'dropbox_client_id'), 'client-1');
      expect(await secure.read(key: 'dropbox_refresh_token'), 'rt-1');

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('dropbox_client_id'), isNull);
      expect(prefs.getString('dropbox_refresh_token'), isNull);

      // Disconnect clears both stores.
      await provider.disconnectDropbox();
      expect(await secure.read(key: 'dropbox_client_id'), isNull);
      expect(await secure.read(key: 'dropbox_refresh_token'), isNull);

      provider.dispose();
    });

    test('a failing secure write keeps the prefs copy for the next retry',
        () async {
      SharedPreferences.setMockInitialValues({
        'dropbox_client_id': 'legacy-client',
        'dropbox_refresh_token': 'legacy-token',
      });

      final provider = StorageProvider(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
        secureStorage: _ThrowingSecureStorage(),
      );
      await provider.initSync();

      // The write failed: nothing was cleared, so the migration re-runs on
      // the next load instead of losing the only credential copy.
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('dropbox_client_id'), 'legacy-client');
      expect(prefs.getString('dropbox_refresh_token'), 'legacy-token');
      expect(provider.isDropboxConnected, false);
    });
  });
}
