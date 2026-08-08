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
}
