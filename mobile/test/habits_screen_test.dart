import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/habits_screen.dart';

class _FakeOkrStorage extends OkrStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakePomodoroStorage extends PomodoroStorage {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeHabitsStorageProvider extends StorageProvider {
  _FakeHabitsStorageProvider({
    required List<Map<String, dynamic>> testHabits,
    required List<Map<String, dynamic>> testKeyResults,
  }) : super(
          okrStorage: _FakeOkrStorage(),
          pomodoroStorage: _FakePomodoroStorage(),
        ) {
    habits = testHabits;
    keyResults = testKeyResults;
    isLoading = false;
  }

  @override
  Future<void> saveHabits(List<Map<String, dynamic>> newHabits) async {
    habits = newHabits;
    notifyListeners();
  }

  @override
  Future<void> saveKeyResults(List<Map<String, dynamic>> newKRs) async {
    keyResults = newKRs;
    notifyListeners();
  }
}

void main() {
  testWidgets('HabitsScreen renders empty state, adds a habit, and toggles tick', (WidgetTester tester) async {
    final provider = _FakeHabitsStorageProvider(
      testHabits: [],
      testKeyResults: [],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: HabitsScreen(provider: provider),
      ),
    );

    expect(find.text('No active habits yet. Add one above!'), findsOneWidget);

    // Enter habit name
    await tester.enterText(find.byType(TextField), 'Drink Water Daily');
    await tester.tap(find.text('Add Habit'));
    await tester.pumpAndSettle();

    expect(find.text('Drink Water Daily'), findsOneWidget);
    expect(find.text('Want to form'), findsOneWidget);
    expect(find.text('🔥 0'), findsOneWidget);

    // Toggle today's tick — future days are disabled in the calendar UI,
    // so the original hardcoded '15' (written on 2026-07-15) broke in August.
    final now = DateTime.now();
    final todayStr = now.toIso8601String().substring(0, 10);
    await tester.tap(find.text('${now.day}'));
    await tester.pumpAndSettle();

    expect(provider.habits.first['ticks'], contains(contains(todayStr)));
  });

  testWidgets('HabitsScreen deletes habit with OKR linkage warning', (WidgetTester tester) async {
    final provider = _FakeHabitsStorageProvider(
      testHabits: [
        {
          'id': 'h-1',
          'name': 'Exercise 30 mins',
          'status': 'in_progress',
          'ticks': ['2026-07-10', '2026-07-11'],
        }
      ],
      testKeyResults: [
        {
          'id': 'kr-1',
          'title': '30 Day Workout Challenge',
          'completionMode': 'habit',
          'habitId': 'h-1',
          'targetValue': 30,
          'currentValue': 0,
        }
      ],
    );

    await tester.pumpWidget(
      MaterialApp(
        home: HabitsScreen(provider: provider),
      ),
    );

    expect(find.text('Exercise 30 mins'), findsOneWidget);

    // Tap delete button
    await tester.tap(find.byIcon(Icons.delete_outline));
    await tester.pumpAndSettle();

    // Verify warning dialog
    expect(find.text('Delete Linked Habit?'), findsOneWidget);
    expect(find.textContaining('30 Day Workout Challenge'), findsOneWidget);

    // Confirm delete
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();

    // Habit should be removed
    expect(provider.habits, isEmpty);
    // Key Result should fall back to manual mode
    expect(provider.keyResults.first['completionMode'], 'manual');
  });
}
