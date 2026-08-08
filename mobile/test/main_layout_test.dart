import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/main_layout.dart';
import 'package:myokr_mobile/src/screens/okr_screen.dart';
import 'package:myokr_mobile/src/screens/review_screen.dart';
import 'package:myokr_mobile/src/screens/today_screen.dart';


class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _FakeStorageProvider extends StorageProvider {
  _FakeStorageProvider()
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    isLoading = false;
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
  testWidgets('MainLayout tab navigation and Cloud Sync screen opening', (WidgetTester tester) async {
    final provider = _FakeStorageProvider();

    await tester.pumpWidget(
      MaterialApp(
        home: MainLayout(provider: provider),
      ),
    );
    await tester.pump();

    // Initial state: Today tab should be visible
    expect(find.byType(TodayScreen), findsOneWidget); 
    
    // Tap OKRs
    await tester.tap(find.text('OKRs').last); // The bottom nav item
    await tester.pump(const Duration(milliseconds: 100));

    // The OKRs destination actually rendered (not just the app bar).
    expect(find.byType(OkrScreen), findsOneWidget);

    // Tap Review
    await tester.tap(find.text('Review').last);
    await tester.pump(const Duration(milliseconds: 100));

    // The Review destination actually rendered.
    expect(find.byType(ReviewScreen), findsOneWidget);

    // Verify app bar is there
    expect(find.text('myOKR'), findsOneWidget);
    expect(find.byType(BottomNavigationBar), findsOneWidget);

    // Tap Cloud Sync icon in AppBar
    await tester.tap(find.byTooltip('Cloud Sync'));
    await tester.pumpAndSettle();

    // Verify CloudSyncScreen opened
    expect(find.text('Cloud Sync'), findsWidgets);
    expect(find.text('True Local-First Experience'), findsOneWidget);
    expect(find.text('Connect to Dropbox'), findsOneWidget);

    provider.dispose();
  });
}
