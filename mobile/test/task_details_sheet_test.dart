import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/widgets/task_details_sheet.dart';

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

class _ThrowingTaskStorageProvider extends _FakeTaskStorageProvider {
  _ThrowingTaskStorageProvider({required super.testTasks});

  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async =>
      throw Exception('disk full');
}

class _FakeTaskStorageProvider extends StorageProvider {
  _FakeTaskStorageProvider({required this.testTasks})
      : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    tasks = testTasks;
    isLoading = false;
  }

  final List<Map<String, dynamic>> testTasks;
  int saveCalls = 0;

  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    saveCalls++;
    tasks = newTasks;
    notifyListeners();
  }
}

void main() {
  Future<void> openSheet(
    WidgetTester tester,
    _FakeTaskStorageProvider provider,
  ) async {
    // Material 3 caps modal bottom sheets at 640 wide, and the test's Ahem
    // font renders text ~2x device width — the POMODOROS row would overflow.
    // Scaling the test text down keeps it inside the cap.
    tester.platformDispatcher.textScaleFactorTestValue = 0.5;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () {
                showModalBottomSheet(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => TaskDetailsSheet(
                    task: provider.tasks.first,
                    provider: provider,
                  ),
                );
              },
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  testWidgets('typing the title fires at most one save (debounced)',
      (tester) async {
    final provider = _FakeTaskStorageProvider(testTasks: [
      {'id': 't1', 'title': 'Original', 'category': 'do'},
    ]);
    await openSheet(tester, provider);

    // Three keystrokes → three onChanged ticks; old code saved each one.
    final titleField = find.byType(TextField).first;
    await tester.enterText(titleField, 'A');
    await tester.enterText(titleField, 'AB');
    await tester.enterText(titleField, 'ABC');
    await tester.pump(const Duration(milliseconds: 600)); // debounce window

    expect(provider.saveCalls, 1);
  });

  testWidgets('closing within the debounce window still saves the edit',
      (tester) async {
    final provider = _FakeTaskStorageProvider(testTasks: [
      {'id': 't1', 'title': 'Original', 'category': 'do'},
    ]);
    await openSheet(tester, provider);

    await tester.enterText(find.byType(TextField).first, 'Renamed');
    // Close before the debounce fires — the edit must not be lost.
    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(provider.saveCalls, 1);
    expect(provider.tasks.first['title'], 'Renamed');
  });

  testWidgets('a failing save does not crash the sheet', (tester) async {
    final provider = _ThrowingTaskStorageProvider(testTasks: [
      {'id': 't1', 'title': 'A', 'category': 'do'},
    ]);
    await openSheet(tester, provider);

    // The debounce fires _saveTask, whose save fails — the error must be
    // swallowed, not escaped as an unhandled async exception.
    await tester.enterText(find.byType(TextField).first, 'Renamed');
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump();

    expect(find.text('Renamed'), findsOneWidget); // sheet still open
  });
}
