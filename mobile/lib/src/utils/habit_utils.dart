/// Builds a habit id that stays unique even when two habits are created
/// within the same millisecond: the caller's monotonic [sequence] breaks ties
/// between ids generated from the same [timestampMs].
String buildHabitId(int sequence, {int? timestampMs}) =>
    'habit_${timestampMs ?? DateTime.now().millisecondsSinceEpoch}_$sequence';

class HabitStreakResult {
  final int current;
  final int best;

  const HabitStreakResult({required this.current, required this.best});
}

class CalendarDay {
  final String dateStr;
  final int label;
  final bool isBlank;
  final bool isFuture;

  const CalendarDay({
    required this.dateStr,
    required this.label,
    required this.isBlank,
    required this.isFuture,
  });
}

String getLocalDateString([DateTime? dt]) {
  final target = dt ?? DateTime.now();
  final y = target.year;
  final m = target.month.toString().padLeft(2, '0');
  final d = target.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

/// Mirrors the desktop `computeHabitStreaks` (habit-storage.ts): `current` is
/// the run of consecutive ticked days ending at the most recent tick — it does
/// not expire when the last tick is a few days old (2026-08-08 feedback;
/// desktop dropped its today/yesterday recency gate).
HabitStreakResult computeHabitStreaks(List<String> ticks) {
  if (ticks.isEmpty) return const HabitStreakResult(current: 0, best: 0);

  // Filter valid dates, deduplicate, and sort ascending
  final validTicks = ticks
      .where((t) => RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(t))
      .toSet()
      .toList()
    ..sort();

  if (validTicks.isEmpty) return const HabitStreakResult(current: 0, best: 0);

  int best = 0;
  int currentRun = 0;
  String? prevKey;

  for (final tickStr in validTicks) {
    if (prevKey == null) {
      currentRun = 1;
    } else {
      final diffDays = _diffCalendarDays(prevKey, tickStr);
      if (diffDays == 1) {
        currentRun++;
      } else if (diffDays > 1) {
        if (currentRun > best) best = currentRun;
        currentRun = 1;
      }
    }
    prevKey = tickStr;
  }
  if (currentRun > best) best = currentRun;

  // Current streak: consecutive days ending at the last tick.
  int current = 1;
  int idx = validTicks.length - 1;
  while (idx > 0 && _diffCalendarDays(validTicks[idx - 1], validTicks[idx]) == 1) {
    current++;
    idx--;
  }

  return HabitStreakResult(current: current, best: best);
}

/// Whole-day difference between two 'YYYY-MM-DD' keys (UTC-safe arithmetic).
int _diffCalendarDays(String a, String b) {
  final da = DateTime.parse(a);
  final db = DateTime.parse(b);
  return DateTime.utc(db.year, db.month, db.day)
      .difference(DateTime.utc(da.year, da.month, da.day))
      .inDays;
}

List<CalendarDay> getCalendarDaysForMonth(DateTime monthDate, String todayStr) {
  final year = monthDate.year;
  final month = monthDate.month;

  final firstDay = DateTime(year, month, 1);
  final daysInMonth = DateTime(year, month + 1, 0).day;

  // Flutter weekday: Mon=1, Sun=7.
  final firstDayWeekday = firstDay.weekday; // 1 to 7
  final blanks = firstDayWeekday - 1; // 0 to 6 blank cells before 1st

  final days = <CalendarDay>[];

  for (int i = 0; i < blanks; i++) {
    days.add(const CalendarDay(dateStr: '', label: 0, isBlank: true, isFuture: false));
  }

  for (int day = 1; day <= daysInMonth; day++) {
    final dateStr = '$year-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
    final isFuture = dateStr.compareTo(todayStr) > 0;
    days.add(CalendarDay(
      dateStr: dateStr,
      label: day,
      isBlank: false,
      isFuture: isFuture,
    ));
  }

  return days;
}
