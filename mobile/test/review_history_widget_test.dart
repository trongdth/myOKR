import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/screens/review_history_widget.dart';

void main() {
  group('aggregatePomoCounts', () {
    test('counts completed focus sessions within the week only', () {
      final history = [
        {
          'date': '2026-07-13',
          'sessions': [
            {'type': 'focus', 'completed': true, 'taskId': 't1'},
            {'type': 'focus', 'completed': false, 'taskId': 't1'}, // not completed
            {'type': 'shortBreak', 'completed': true, 'taskId': 't1'}, // not focus
            {'type': 'focus', 'completed': true}, // no taskId
            {'type': 'focus', 'completed': true, 'taskId': 't2'},
          ]
        },
        {
          'date': '2026-07-20', // outside the week
          'sessions': [
            {'type': 'focus', 'completed': true, 'taskId': 't1'},
          ]
        },
      ];

      final counts = aggregatePomoCounts(
        history: history,
        weekStart: '2026-07-13',
        weekEnd: '2026-07-19',
      );

      expect(counts['t1'], 1); // only the completed one inside the week
      expect(counts['t2'], 1);
    });
  });

  group('filterLinkedTasks', () {
    test('keeps only tasks linked to the KR, sorted by pomos desc', () {
      final taskMap = {
        't1': {'id': 't1', 'title': 'Alpha', 'keyResultId': 'kr1'},
        't2': {'id': 't2', 'title': 'Beta', 'keyResultId': 'kr1'},
        't3': {'id': 't3', 'title': 'Gamma', 'keyResultId': 'kr2'}, // other KR
      };
      final pomoCounts = {'t1': 3, 't2': 5, 't4': 9}; // t4 unknown task

      final linked = filterLinkedTasks(
        taskMap: taskMap,
        pomoCounts: pomoCounts,
        krId: 'kr1',
      );

      expect(linked, [
        {'taskTitle': 'Beta', 'pomos': 5},
        {'taskTitle': 'Alpha', 'pomos': 3},
      ]);
    });

    test('falls back to Untitled Task for tasks without a title', () {
      final taskMap = {
        't1': {'id': 't1', 'keyResultId': 'kr1'}, // no title
      };
      final pomoCounts = {'t1': 1};

      final linked = filterLinkedTasks(
        taskMap: taskMap,
        pomoCounts: pomoCounts,
        krId: 'kr1',
      );

      expect(linked, [
        {'taskTitle': 'Untitled Task', 'pomos': 1},
      ]);
    });
  });
}
