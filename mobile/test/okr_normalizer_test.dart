import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/okr_normalizer.dart';

void main() {
  group('normalizeCycle', () {
    test('null or non-map returns null', () {
      expect(normalizeCycle(null), isNull);
      expect(normalizeCycle('not a map'), isNull);
      expect(normalizeCycle(123), isNull);
    });

    test('valid cycle is preserved with defaults', () {
      final input = {
        'id': 'cycle-1',
        'name': 'May 2026',
        'month': 4,
        'year': 2026,
        'isActive': true,
        'createdAt': '2026-05-01T00:00:00Z',
      };
      final normalized = normalizeCycle(input);
      expect(normalized, equals(input));
    });

    test('malformed month and year fallback/clamp correctly', () {
      final input = {
        'id': 'cycle-2',
        'name': 'Future Cycle',
        'month': 15, // > 11
        'year': 'invalid',
        'isActive': 'yes',
      };
      final normalized = normalizeCycle(input);
      expect(normalized!['month'], equals(11));
      expect(normalized['year'], isA<int>());
      expect(normalized['isActive'], isFalse);
    });
  });

  group('normalizeObjective', () {
    test('null or non-map returns null', () {
      expect(normalizeObjective(null), isNull);
      expect(normalizeObjective([]), isNull);
    });

    test('valid objective is preserved', () {
      final input = {
        'id': 'obj-1',
        'cycleId': 'cycle-1',
        'title': 'Ship v1.0',
        'description': 'Mobile OKR release',
        'reward': 'Pizza party',
        'order': 1,
        'createdAt': '2026-05-01T00:00:00Z',
      };
      final normalized = normalizeObjective(input);
      expect(normalized, equals(input));
    });

    test('malformed order and title fallback safely', () {
      final input = {
        'id': 'obj-2',
        'cycleId': 'cycle-1',
        'title': 12345, // invalid title type
        'order': 'first',
      };
      final normalized = normalizeObjective(input);
      expect(normalized!['title'], equals(''));
      expect(normalized['order'], equals(0));
    });
  });

  group('normalizeKeyResult', () {
    test('null or non-map returns null', () {
      expect(normalizeKeyResult(null), isNull);
    });

    test('valid key result with custom completion mode & confidence', () {
      final input = {
        'id': 'kr-1',
        'objectiveId': 'obj-1',
        'title': 'Focus 20 hours',
        'targetValue': 20,
        'currentValue': 10,
        'unit': 'hours',
        'confidence': 'on_track',
        'completionMode': 'focus_hours',
        'order': 0,
      };
      final normalized = normalizeKeyResult(input);
      expect(normalized!['confidence'], equals('on_track'));
      expect(normalized['completionMode'], equals('focus_hours'));
      expect(normalized['targetValue'], equals(20));
      expect(normalized['currentValue'], equals(10));
    });

    test('invalid confidence and completionMode fall back to defaults', () {
      final input = {
        'id': 'kr-2',
        'objectiveId': 'obj-1',
        'title': 'Bad Enums KR',
        'confidence': 'super_confident',
        'completionMode': 'automatic_magic',
        'targetValue': double.nan,
        'currentValue': double.infinity,
      };
      final normalized = normalizeKeyResult(input);
      expect(normalized!['confidence'], equals('not_set'));
      expect(normalized['completionMode'], equals('manual'));
      expect(normalized['targetValue'], equals(0));
      expect(normalized['currentValue'], equals(0));
    });

    test('habit completionMode preserves habitId', () {
      final input = {
        'id': 'kr-3',
        'objectiveId': 'obj-1',
        'title': 'Daily Habit KR',
        'completionMode': 'habit',
        'habitId': 'habit-123',
      };
      final normalized = normalizeKeyResult(input);
      expect(normalized!['completionMode'], equals('habit'));
      expect(normalized['habitId'], equals('habit-123'));
    });
  });

  group('normalizeReview', () {
    test('preserves review structure and review entries', () {
      final input = {
        'id': 'rev-1',
        'weekStartDate': '2026-05-04',
        'weekEndDate': '2026-05-10',
        'cycleId': 'cycle-1',
        'entries': [
          {
            'keyResultId': 'kr-1',
            'previousValue': 5,
            'currentValue': 10,
            'confidence': 'on_track',
            'note': 'Great progress',
          }
        ],
        'reflection': 'Solid week',
        'pomodoroStats': {
          'totalPomodoros': 12,
          'totalFocusMinutes': 300,
          'tasksCompleted': 4,
          'pomodorosByKeyResult': {'kr-1': 12},
        },
      };
      final normalized = normalizeReview(input);
      expect(normalized!['id'], equals('rev-1'));
      expect(normalized['entries'].length, equals(1));
      expect(normalized['entries'][0]['confidence'], equals('on_track'));
    });
  });
}
