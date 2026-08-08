import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/utils/habit_utils.dart';

void main() {
  group('Habit Utils Tests', () {
    test('computeHabitStreaks handles empty ticks', () {
      final res = computeHabitStreaks([]);
      expect(res.current, 0);
      expect(res.best, 0);
    });

    test('computeHabitStreaks calculates best streak across gaps', () {
      final ticks = [
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-05',
        '2026-07-06',
      ];
      final res = computeHabitStreaks(ticks);
      expect(res.best, 3);
    });

    test('computeHabitStreaks calculates current streak for today and yesterday', () {
      final today = getLocalDateString(DateTime.now());
      final yesterday = getLocalDateString(DateTime.now().subtract(const Duration(days: 1)));
      final twoDaysAgo = getLocalDateString(DateTime.now().subtract(const Duration(days: 2)));

      final ticks = [twoDaysAgo, yesterday, today];
      final res = computeHabitStreaks(ticks);
      expect(res.current, 3);
      expect(res.best, 3);
    });

    test('getCalendarDaysForMonth creates correct Mon-Sun grid', () {
      final july2026 = DateTime(2026, 7, 1);
      final todayStr = '2026-07-15';
      final days = getCalendarDaysForMonth(july2026, todayStr);

      // July 1, 2026 is a Wednesday (weekday = 3). Blanks = 2 (Mon, Tue).
      expect(days.where((d) => d.isBlank).length, 2);
      expect(days.where((d) => !d.isBlank).length, 31);
      expect(days.firstWhere((d) => d.label == 15).isFuture, false);
      expect(days.firstWhere((d) => d.label == 20).isFuture, true);
    });
  });
}
