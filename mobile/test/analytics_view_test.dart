import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/widgets/analytics_view.dart';

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _RecordingImportProvider extends StorageProvider {
  _RecordingImportProvider()
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    isLoading = false;
  }

  int settingsSaves = 0;
  int tasksSaves = 0;

  @override
  Future<void> saveSettings(Map<String, dynamic> newSettings) async {
    settingsSaves++;
    settings = newSettings;
    notifyListeners();
  }

  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    tasksSaves++;
    tasks = newTasks;
    notifyListeners();
  }
}

void main() {
  group('parseImportPayload', () {
    test('parses every supported section', () {
      final parsed = parseImportPayload('''
      {
        "settings": {"focusDuration": 30},
        "tasks": [{"id": "t1", "title": "A"}],
        "history": [{"date": "2026-07-20"}],
        "cycles": [{"id": "c1"}],
        "objectives": [{"id": "o1"}],
        "keyResults": [{"id": "k1"}]
      }
      ''');

      expect((parsed['settings'] as Map)['focusDuration'], 30);
      expect(parsed['tasks'], isA<List<Map<String, dynamic>>>());
      expect(parsed['history'], isA<List<Map<String, dynamic>>>());
      expect(parsed['cycles'], isA<List<Map<String, dynamic>>>());
      expect(parsed['objectives'], isA<List<Map<String, dynamic>>>());
      expect(parsed['keyResults'], isA<List<Map<String, dynamic>>>());
    });

    test('a non-map entry in tasks throws', () {
      expect(
        () => parseImportPayload(
            '{"tasks": [{"id": "t1"}, "not-a-map"]}'),
        throwsA(isA<TypeError>()),
      );
    });

    test('settings that is not a map throws', () {
      expect(
        () => parseImportPayload('{"settings": [1, 2, 3]}'),
        throwsA(isA<TypeError>()),
      );
    });
  });

  testWidgets('a payload with a bad entry imports NOTHING (no partial write)',
      (tester) async {
    final provider = _RecordingImportProvider();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: AnalyticsView(provider: provider)),
    ));

    await tester.tap(find.text('Import'));
    await tester.pumpAndSettle();

    // Settings is valid but tasks has a bad entry — settings must NOT be
    // persisted before the whole payload validates (ticket 19).
    await tester.enterText(
      find.byType(TextField).last,
      '{"settings": {"focusDuration": 30}, "tasks": [{"id": "t1"}, "bad"]}',
    );
    await tester.tap(find.text('Import').last);
    await tester.pumpAndSettle();

    expect(provider.settingsSaves, 0);
    expect(provider.tasksSaves, 0);
    expect(find.textContaining('Invalid JSON'), findsOneWidget);
  });
}
