import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/eisenhower_matrix_screen.dart';

// A minimal in-memory provider: holds tasks, captures saveTasks, notifies. Other
// StorageProvider members are unimplemented (noSuchMethod) — the matrix touches
// only tasks + saveTasks + ChangeNotifier. Mirrors the settings-sheet test fake.
class _ThrowingProvider extends ChangeNotifier implements StorageProvider {
  _ThrowingProvider(this.tasks);

  @override
  List<Map<String, dynamic>> tasks;

  int saveCalls = 0;

  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    saveCalls++;
    throw Exception('disk full');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeProvider extends ChangeNotifier implements StorageProvider {
  _FakeProvider(this.tasks);

  @override
  List<Map<String, dynamic>> tasks;

  final List<List<Map<String, dynamic>>> savedBatches = [];

  @override
  Future<void> saveTasks(List<Map<String, dynamic>> newTasks) async {
    savedBatches.add(newTasks);
    tasks = newTasks;
    notifyListeners();
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('applyEisenhowerPriorityOrder', () {
    test('sorts do → decide → delegate → delete → unassigned, stable within each', () {
      final tasks = <Map<String, dynamic>>[
        {'id': 'del', 'category': 'delegate'},
        {'id': 'del2', 'category': 'delegate'},
        {'id': 'do', 'category': 'do'},
        {'id': 'none'}, // unassigned
        {'id': 'dec', 'category': 'decide'},
        {'id': 'trash', 'category': 'delete'},
        {'id': 'bogus', 'category': 'weird'}, // unknown → unassigned
      ];
      final ordered = applyEisenhowerPriorityOrder(tasks);
      expect(ordered.map((t) => t['id']).toList(),
          ['do', 'dec', 'del', 'del2', 'trash', 'none', 'bogus']);
    });

    test('does not mutate the input list', () {
      final tasks = <Map<String, dynamic>>[
        {'id': 'a', 'category': 'delete'},
        {'id': 'b', 'category': 'do'},
      ];
      final ordered = applyEisenhowerPriorityOrder(tasks);
      expect(tasks.map((t) => t['id']).toList(), ['a', 'b']); // input unchanged
      expect(ordered.map((t) => t['id']).toList(), ['b', 'a']);
    });
  });

  group('EisenhowerMatrixScreen', () {
    testWidgets('renders tasks grouped by quadrant with counts (AC #1)',
        (tester) async {
      final fake = _FakeProvider([
        {'id': 't1', 'title': 'Alpha', 'category': 'do'},
        {'id': 't2', 'title': 'Beta'}, // unassigned
        {'id': 't3', 'title': 'Gamma', 'category': 'decide'},
        {'id': 't4', 'title': 'Delta', 'category': 'delete'},
      ]);
      await tester
          .pumpWidget(MaterialApp(home: EisenhowerMatrixScreen(provider: fake)));

      // Per-quadrant counts (AC #1).
      expect(
          find.descendant(
              of: find.byKey(const Key('count-do')), matching: find.text('1')),
          findsOneWidget);
      expect(
          find.descendant(
              of: find.byKey(const Key('count-decide')),
              matching: find.text('1')),
          findsOneWidget);
      expect(
          find.descendant(
              of: find.byKey(const Key('count-delete')),
              matching: find.text('1')),
          findsOneWidget);
      expect(
          find.descendant(
              of: find.byKey(const Key('count-delegate')),
              matching: find.text('0')),
          findsOneWidget);

      // Tasks render; Beta (no category) is in the Unassigned tray.
      expect(find.text('Alpha'), findsOneWidget);
      expect(find.text('Gamma'), findsOneWidget);
      expect(find.text('Delta'), findsOneWidget);
      expect(find.text('Unassigned'), findsOneWidget);
      expect(find.text('Beta'), findsOneWidget);
    });

    testWidgets('tap a task then a quadrant assigns the category (AC #2/#4)',
        (tester) async {
      final fake = _FakeProvider([
        {'id': 't1', 'title': 'Alpha', 'estimatedPomodoros': 3}, // unassigned
      ]);
      await tester
          .pumpWidget(MaterialApp(home: EisenhowerMatrixScreen(provider: fake)));

      await tester.tap(find.byKey(const Key('task-t1')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('quadrant-do')));
      await tester.pump();

      expect(fake.savedBatches, hasLength(1));
      final saved = fake.savedBatches.single.single;
      expect(saved['category'], 'do'); // assigned
      // Read-modify-write preserved every sibling key (ADR-0004 / ticket 03).
      expect(saved['title'], 'Alpha');
      expect(saved['id'], 't1');
      expect(saved['estimatedPomodoros'], 3);
    });

    testWidgets('assign failure shows a snackbar and keeps the selection',
        (tester) async {
      final fake = _ThrowingProvider([
        {'id': 't1', 'title': 'Alpha'}, // unassigned
      ]);
      await tester
          .pumpWidget(MaterialApp(home: EisenhowerMatrixScreen(provider: fake)));

      await tester.tap(find.byKey(const Key('task-t1')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('quadrant-do')));
      await tester.pump();

      expect(find.textContaining('Failed to save'), findsOneWidget);
      expect(fake.saveCalls, 1);

      // Selection was NOT cleared on failure: tapping the quadrant again
      // re-saves instead of being a no-op.
      await tester.tap(find.byKey(const Key('quadrant-do')));
      await tester.pump();
      expect(fake.saveCalls, 2);
    });

    testWidgets('Apply Order failure shows a snackbar and does not pop',
        (tester) async {
      final fake = _ThrowingProvider([
        {'id': 't1', 'title': 'Alpha', 'category': 'do'},
      ]);
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => EisenhowerMatrixScreen(provider: fake)),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Apply Order'));
      await tester.pumpAndSettle();

      expect(find.textContaining('Failed to save'), findsOneWidget);
      expect(find.text('Prioritize'), findsOneWidget); // not popped
    });

    testWidgets('Apply Order success pops the screen', (tester) async {
      final fake = _FakeProvider([
        {'id': 't1', 'title': 'Alpha', 'category': 'do'},
      ]);
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => Center(
            child: ElevatedButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => EisenhowerMatrixScreen(provider: fake)),
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Apply Order'));
      await tester.pumpAndSettle();

      expect(find.text('Prioritize'), findsNothing); // popped
    });

    testWidgets('Apply Order reorders the task list by priority (AC #3/#5)',
        (tester) async {
      final fake = _FakeProvider([
        {'id': 'del', 'title': 'Delegate task', 'category': 'delegate'},
        {'id': 'do', 'title': 'Do task', 'category': 'do'},
        {'id': 'none', 'title': 'Unassigned'}, // no category → sorts last
      ]);
      await tester
          .pumpWidget(MaterialApp(home: EisenhowerMatrixScreen(provider: fake)));

      await tester.tap(find.text('Apply Order'));
      await tester.pumpAndSettle();

      expect(fake.savedBatches, hasLength(1));
      expect(fake.savedBatches.single.map((t) => t['id']).toList(),
          ['do', 'del', 'none']);
    });

    testWidgets(
        'tapping a chip inside a quadrant selects/toggles, never assigns '
        '(nested-gesture)', (tester) async {
      final fake = _FakeProvider([
        {'id': 't1', 'title': 'Alpha', 'category': 'do'},
      ]);
      await tester
          .pumpWidget(MaterialApp(home: EisenhowerMatrixScreen(provider: fake)));

      // First tap: selects t1 (the Do quadrant's InkWell has no onTap yet).
      await tester.tap(find.byKey(const Key('task-t1')));
      await tester.pump();
      expect(fake.savedBatches, isEmpty);

      // Second tap while selected: the Do quadrant's InkWell is now active
      // (canAssign), but the chip's gesture must win → toggle off, NOT assign.
      await tester.tap(find.byKey(const Key('task-t1')));
      await tester.pump();
      expect(fake.savedBatches, isEmpty); // no assign fired
    });
  });
}
