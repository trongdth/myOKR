import 'package:flutter_test/flutter_test.dart';
import 'package:myokr_mobile/src/utils/review_utils.dart';

void main() {
  test('getCurrentWeekStart returns a Monday string', () {
    final weekStart = getCurrentWeekStart();
    expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(weekStart), isTrue);
    final dt = DateTime.parse(weekStart);
    expect(dt.weekday, DateTime.monday);
  });

  test('getWeekEndFromStart adds 6 days', () {
    expect(getWeekEndFromStart('2026-05-04'), '2026-05-10');
    expect(getWeekEndFromStart('2026-05-25'), '2026-05-31');
  });

  test('getMondaysForCycle returns overlapping Mondays latest first', () {
    // May 2026 (month 4, year 2026)
    final mondays = getMondaysForCycle({'month': 4, 'year': 2026});
    expect(mondays.isNotEmpty, isTrue);
    // May 2026 starts Friday May 1st -> First Monday overlapping is April 27th (2026-04-27)
    // May 31 is Sunday -> Last Monday overlapping is May 25th (2026-05-25)
    expect(mondays.first, '2026-05-25');
    expect(mondays.last, '2026-04-27');
  });

  test('reviewInCycle checks week overlap correctly', () {
    final cycleMay = {'month': 4, 'year': 2026};

    // Review fully in May
    expect(reviewInCycle({'weekStartDate': '2026-05-11', 'weekEndDate': '2026-05-17'}, cycleMay), isTrue);

    // Cross-month review starting April 27th ending May 3rd (overlaps May)
    expect(reviewInCycle({'weekStartDate': '2026-04-27', 'weekEndDate': '2026-05-03'}, cycleMay), isTrue);

    // Review in June (does not overlap May)
    expect(reviewInCycle({'weekStartDate': '2026-06-08', 'weekEndDate': '2026-06-14'}, cycleMay), isFalse);
  });
}
