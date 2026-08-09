import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/today_focus.dart';

void main() {
  test('todayFocus pickForBudget logic', () {
    final settings = {
      'focusDuration': 25,
    }; // Budget = 240 / 25 = 10 pomodoros

    final tasks = [
      {
        'id': 'task-1',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 2,
        'completedPomodoros': 0,
        'keyResultId': 'kr-1',
        'createdAt': '2026-06-23',
      },
      {
        'id': 'task-2',
        'isCompleted': false,
        'category': 'delegate',
        'estimatedPomodoros': 5,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
      {
        'id': 'task-completed',
        'isCompleted': true,
        'category': 'do',
        'estimatedPomodoros': 2,
        'completedPomodoros': 2,
      }
    ];

    final keyResults = [
      {
        'id': 'kr-1',
        'confidence': 'off_track',
      }
    ];

    final cycle = {
      'year': 2026,
      'month': 5, // June
    };

    final picked = pickForBudget(tasks, keyResults, cycle, settings);

    // task-1 has highest score ('do' + 'off_track'), task-2 is lower, task-completed should be ignored
    expect(picked.length, 2);
    expect(picked[0]['id'], 'task-1');
    expect(picked[1]['id'], 'task-2');
  });

  test('pickForBudget stops when the budget is exactly full', () {
    final settings = {
      'focusDuration': 240,
    }; // Budget = 240 / 240 = 1

    final tasks = [
      {
        'id': 't1',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 1,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
      {
        'id': 't2',
        'isCompleted': false,
        'category': 'delegate',
        'estimatedPomodoros': 1,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
    ];

    final picked = pickForBudget(tasks, [], null, settings);

    // Phase 1's `remaining <= budget - cumActual` admits exactly one task.
    expect(picked.length, 1);
  });

  test('pickForBudget skips tasks with nothing remaining', () {
    final settings = {
      'focusDuration': 25,
    }; // Budget = 10

    final tasks = [
      {
        'id': 'done',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 2,
        'completedPomodoros': 2, // remaining = 0
        'createdAt': '2026-06-23',
      },
      {
        'id': 't1',
        'isCompleted': false,
        'category': 'delegate',
        'estimatedPomodoros': 1,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
    ];

    final picked = pickForBudget(tasks, [], null, settings);

    final ids = picked.map((t) => t['id']).toList();
    expect(ids, isNot(contains('done'))); // nothing left to count
    expect(ids, contains('t1'));
  });

  test('pickForBudget caps oversized tasks at maxShare in Phase 2', () {
    final settings = {
      'focusDuration': 25,
    }; // Budget = 10, maxShare = max(2, 5) = 5

    final tasks = [
      {
        'id': 'big1',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 100,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
      {
        'id': 'big2',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 100,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
    ];

    final picked = pickForBudget(tasks, [], null, settings);

    // Uncapped, each slice (100) would exceed the budget and neither would
    // be picked. Capped at 5 each, both fit (5 + 5 <= 10).
    expect(picked.length, 2);
  });

  test('pickForBudget caps the pick at 5 tasks', () {
    final settings = {
      'focusDuration': 25,
    }; // Budget = 10

    final tasks = List.generate(6, (i) {
      return {
        'id': 't$i',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 1,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      };
    });

    final picked = pickForBudget(tasks, [], null, settings);

    expect(picked.length, 5); // the `picked.length >= 5` break
  });

  test('pickForBudget picks an id-less task at most once', () {
    final settings = {
      'focusDuration': 25,
    }; // Budget = 240 / 25 = 10 pomodoros

    final tasks = [
      {
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 1,
        'createdAt': '2026-06-23',
      },
      {
        'id': 'task-1',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 1,
        'createdAt': '2026-06-23',
      },
    ];

    final picked = pickForBudget(tasks, [], null, settings);

    // The id-less task must not be double-picked by Phase 2's dedup.
    expect(picked.length, 2);
    expect(picked.where((t) => t['id'] == null).length, 1);
  });

  test('Phase 1 protects small-remaining tasks from being crowded out', () {
    // Regression pin for ticket 27: a single-pass loop (no Phase 1) lets a
    // large-remaining task whose SLICE fits (d: rem 9, slice 5) crowd out a
    // small-remaining task (c: rem 2, slice 2) that Phase 1 picked first.
    // Old code picks [a, c]; the removed-Phase-1 variant picks [a, d].
    final settings = {
      'focusDuration': 25,
    }; // Budget = 10, maxShare = 5

    final tasks = [
      {
        'id': 'a',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 8,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
      {
        'id': 'd',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 9,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
      {
        'id': 'c',
        'isCompleted': false,
        'category': 'do',
        'estimatedPomodoros': 2,
        'completedPomodoros': 0,
        'createdAt': '2026-06-23',
      },
    ];

    final picked = pickForBudget(tasks, [], null, settings);

    expect(picked.map((t) => t['id']).toList(), ['a', 'c']);
  });
}
