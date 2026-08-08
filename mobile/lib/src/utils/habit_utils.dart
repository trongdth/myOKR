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
  DateTime? prevDate;

  for (final tickStr in validTicks) {
    final d = DateTime.parse(tickStr);
    if (prevDate == null) {
      currentRun = 1;
    } else {
      final t1 = DateTime.utc(d.year, d.month, d.day);
      final t2 = DateTime.utc(prevDate.year, prevDate.month, prevDate.day);
      final diffDays = t1.difference(t2).inDays;

      if (diffDays == 1) {
        currentRun++;
      } else if (diffDays > 1) {
        if (currentRun > best) best = currentRun;
        currentRun = 1;
      }
    }
    prevDate = d;
  }
  if (currentRun > best) best = currentRun;

  final now = DateTime.now();
  final todayStr = getLocalDateString(now);
  final yesterdayStr = getLocalDateString(now.subtract(const Duration(days: 1)));

  int current = 0;
  final lastTick = validTicks.last;

  if (lastTick == todayStr || lastTick == yesterdayStr) {
    int idx = validTicks.length - 1;
    current = 1;
    while (idx > 0) {
      final d1 = DateTime.parse(validTicks[idx]);
      final d2 = DateTime.parse(validTicks[idx - 1]);

      final t1 = DateTime.utc(d1.year, d1.month, d1.day);
      final t2 = DateTime.utc(d2.year, d2.month, d2.day);
      final diffDays = t1.difference(t2).inDays;

      if (diffDays == 1) {
        current++;
        idx--;
      } else {
        break;
      }
    }
  }

  return HabitStreakResult(current: current, best: best);
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
