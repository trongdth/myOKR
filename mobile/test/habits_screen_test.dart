import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_storage.dart';
import 'package:myokr_mobile/src/pomodoro_storage.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/habits_screen.dart';
import 'package:myokr_mobile/src/utils/habit_utils.dart';

class _FakeOkrStorage extends OkrStorage {}

class _FakePomodoroStorage extends PomodoroStorage {}

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
  group('buildHabitId', () {
    test('yields distinct ids for two habits created in the same millisecond', () {
      final a = buildHabitId(0, timestampMs: 1750000000000);
      final b = buildHabitId(1, timestampMs: 1750000000000);

      expect(a, isNot(equals(b)));
    });

    test('embeds the timestamp and sequence in a habit_-prefixed id', () {
      expect(buildHabitId(3, timestampMs: 1750000000000), 'habit_1750000000000_3');
    });
  });

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

    // The persisted habit must not carry a stale 'order' field: it was
    // derived from list length at creation, goes non-contiguous after a
    // delete, and nothing reads it (vestigial on desktop too — ticket 09).
    expect(provider.habits.first.containsKey('order'), isFalse);

    // Toggle today's tick — future days are disabled in the calendar UI,
    // so the original hardcoded '15' (written on 2026-07-15) broke in August.
    // Tap by the day cell's semantic key rather than its label text, so the
    // test doesn't depend on how the calendar renders day numbers.
    final todayStr = getLocalDateString();
    await tester.tap(find.byKey(ValueKey('habit-day-$todayStr')));
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
