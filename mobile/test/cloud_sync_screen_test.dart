import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/cloud_sync_screen.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/method_channel_url_launcher.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';

class _FakeUrlLauncher extends UrlLauncherPlatform {
  _FakeUrlLauncher({this.launchThrows = false});

  final bool launchThrows;

  @override
  LinkDelegate? get linkDelegate => null;

  @override
  Future<bool> canLaunch(String url) async => true;

  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    if (launchThrows) {
      throw Exception('no browser handler on this platform');
    }
    return true;
  }
}

class _FakeDropboxService extends DropboxService {
  @override
  (String, String, String) getDropboxAuthUrl(String clientId) {
    return (
      'verifier-1',
      'state-1',
      'https://example.com/authorize?state=state-1'
    );
  }
}

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _FakeCloudSyncProvider extends StorageProvider {
  _FakeCloudSyncProvider()
    : super(
        okrStorage: _FakeOkrStorage(),
        pomodoroStorage: _FakePomodoroStorage(),
        dropboxService: _FakeDropboxService(),
      ) {
    isLoading = false;
  }
}

void main() {
  testWidgets('launchUrl throwing shows a snackbar instead of crashing', (
    tester,
  ) async {
    UrlLauncherPlatform.instance = _FakeUrlLauncher(launchThrows: true);
    addTearDown(
      () => UrlLauncherPlatform.instance = MethodChannelUrlLauncher(),
    );

    final provider = _FakeCloudSyncProvider()..dropboxClientId = 'client-1';

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: CloudSyncScreen(provider: provider)),
      ),
    );
    await tester.pump();

    await tester.ensureVisible(find.text('Get Authorization Link'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Get Authorization Link'));
    await tester.pumpAndSettle();
    // Step 2 replaces the Get Link button once an auth URL is ready.
    expect(find.text('Step 2: Authorize App'), findsOneWidget);

    await tester.ensureVisible(find.text('Open Authorization Page'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open Authorization Page'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Could not open browser'), findsOneWidget);
  });
}
