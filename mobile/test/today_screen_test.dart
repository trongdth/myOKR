import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/today_screen.dart';

class _FakeOkrStorage extends OkrStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePomodoroStorage extends PomodoroStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeTodayProvider extends StorageProvider {
  _FakeTodayProvider({required List<Map<String, dynamic>> testTasks})
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    tasks = testTasks;
    keyResults = [];
    isLoading = false;
  }
}

void main() {
  testWidgets('Skip and Start Focus on a task without an id do not crash', (tester) async {
    var focusStarted = false;
    final provider = _FakeTodayProvider(testTasks: [
      {'title': 'Ghost task', 'completed': false},
    ]);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: TodayScreen(
          provider: provider,
          onStartFocus: () => focusStarted = true,
        ),
      ),
    ));
    await tester.pump();

    expect(find.text('Ghost task'), findsOneWidget);

    await tester.tap(find.text('Skip'));
    await tester.pump();

    // No crash; the id-less task is still listed.
    expect(find.text('Ghost task'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);

    await tester.tap(find.text('Start Focus'));
    await tester.pump();

    // No crash; the id-less task cannot start a focus session.
    expect(focusStarted, isFalse);
  });
}
