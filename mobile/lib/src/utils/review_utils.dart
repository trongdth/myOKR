String getCurrentWeekStart() {
  final now = DateTime.now().toUtc();
  final day = now.weekday; // 1 = Monday ... 7 = Sunday
  final monday = now.subtract(Duration(days: day - 1));
  final yyyy = monday.year.toString().padLeft(4, '0');
  final mm = monday.month.toString().padLeft(2, '0');
  final dd = monday.day.toString().padLeft(2, '0');
  return '$yyyy-$mm-$dd';
}

String getWeekEndFromStart(String startDate) {
  final parts = startDate.split('-').map(int.parse).toList();
  final dt = DateTime.utc(parts[0], parts[1], parts[2]);
  final sunday = dt.add(const Duration(days: 6));
  final yyyy = sunday.year.toString().padLeft(4, '0');
  final mm = sunday.month.toString().padLeft(2, '0');
  final dd = sunday.day.toString().padLeft(2, '0');
  return '$yyyy-$mm-$dd';
}

List<String> getMondaysForCycle(Map<String, dynamic> cycle) {
  final month = (cycle['month'] as num?)?.toInt() ?? 0;
  final year = (cycle['year'] as num?)?.toInt() ?? DateTime.now().year;

  final firstDay = DateTime.utc(year, month + 1, 1);
  final day = firstDay.weekday; // 1 = Monday ... 7 = Sunday
  final firstMonday = day == 1 ? firstDay : firstDay.subtract(Duration(days: day - 1));

  final mm = (month + 1).toString().padLeft(2, '0');
  final monthStart = '$year-$mm-01';
  final lastDayVal = DateTime.utc(year, month + 2, 0).day;
  final monthEnd = '$year-$mm-${lastDayVal.toString().padLeft(2, '0')}';

  final mondays = <String>[];
  var current = firstMonday;

  while (true) {
    final yyyy = current.year.toString().padLeft(4, '0');
    final mStr = current.month.toString().padLeft(2, '0');
    final dStr = current.day.toString().padLeft(2, '0');
    final weekStartStr = '$yyyy-$mStr-$dStr';
    final weekEndStr = getWeekEndFromStart(weekStartStr);

    if (weekStartStr.compareTo(monthEnd) <= 0 && weekEndStr.compareTo(monthStart) >= 0) {
      mondays.add(weekStartStr);
    } else if (weekStartStr.compareTo(monthEnd) > 0) {
      break;
    }
    current = current.add(const Duration(days: 7));
  }

  return mondays.reversed.toList();
}

bool reviewInCycle(Map<String, dynamic> review, Map<String, dynamic> cycle) {
  final weekStartDate = review['weekStartDate'] as String?;
  final weekEndDate = review['weekEndDate'] as String?;
  if (weekStartDate == null || weekEndDate == null) return false;

  final month = (cycle['month'] as num?)?.toInt() ?? 0;
  final year = (cycle['year'] as num?)?.toInt() ?? DateTime.now().year;

  final mm = (month + 1).toString().padLeft(2, '0');
  final monthStart = '$year-$mm-01';
  final lastDayVal = DateTime.utc(year, month + 2, 0).day;
  final monthEnd = '$year-$mm-${lastDayVal.toString().padLeft(2, '0')}';

  return weekStartDate.compareTo(monthEnd) <= 0 && weekEndDate.compareTo(monthStart) >= 0;
}
