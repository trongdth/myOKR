import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/utils/habit_utils.dart';
import 'package:myokr_mobile/src/widgets/myokr_card.dart';

class HabitsScreen extends StatefulWidget {
  final StorageProvider provider;

  const HabitsScreen({super.key, required this.provider});

  @override
  State<HabitsScreen> createState() => _HabitsScreenState();
}

class _HabitsScreenState extends State<HabitsScreen> {
  final TextEditingController _nameController = TextEditingController();
  bool _showFormed = false;
  int _habitIdSequence = 0;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _handleAddHabit() {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    final newHabit = {
      'id': buildHabitId(_habitIdSequence++),
      'name': name,
      'status': 'want_to_form',
      'ticks': <String>[],
      'order': widget.provider.habits.length,
      'createdAt': DateTime.now().toIso8601String(),
      'updatedAt': DateTime.now().toIso8601String(),
    };

    widget.provider.saveHabit(newHabit);
    _nameController.clear();
  }

  void _confirmDeleteHabit(BuildContext context, Map<String, dynamic> habit) {
    final habitId = habit['id'] as String;
    final habitName = habit['name'] as String? ?? 'this habit';

    final linkedKRs = widget.provider.keyResults
        .where((kr) => kr['habitId'] == habitId)
        .toList();

    final String title;
    final String message;

    if (linkedKRs.isNotEmpty) {
      title = 'Delete Linked Habit?';
      message =
          'The habit "$habitName" is currently linked to Key Result: "${linkedKRs.first['title']}". '
          'If you delete it, the Key Result will fall back to Manual completion mode and preserve its current count.';
    } else {
      title = 'Delete Habit?';
      message = 'Are you sure you want to delete "$habitName"? This action cannot be undone.';
    }

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppTheme.bgSecondary,
          title: Text(title, style: const TextStyle(color: AppTheme.textPrimary)),
          content: Text(message, style: const TextStyle(color: AppTheme.textSecondary)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: AppTheme.textSecondary)),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                widget.provider.deleteHabit(habitId);
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
              child: const Text('Delete'),
            ),
          ],
        );
      },
    );
  }

  String _getMonthTitle() {
    final now = DateTime.now();
    return getMonthName(now.month - 1, now.year);
  }

  Widget _buildHabitCard(Map<String, dynamic> habit) {
    final habitId = habit['id'] as String;
    final ticks = habit['ticks'] is List ? List<String>.from(habit['ticks']) : <String>[];
    final streaks = computeHabitStreaks(ticks);
    final status = habit['status'] as String? ?? 'want_to_form';

    final todayStr = getLocalDateString();
    final calendarDays = getCalendarDaysForMonth(DateTime.now(), todayStr);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16.0),
      child: MyOkrCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Card Header: Title + Status + Delete
            Row(
              children: [
                Expanded(
                  child: Text(
                    habit['name'] ?? '',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                ),
                DropdownButton<String>(
                  value: status,
                  dropdownColor: AppTheme.bgSecondary,
                  underline: const SizedBox(),
                  style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  items: const [
                    DropdownMenuItem(value: 'want_to_form', child: Text('Want to form')),
                    DropdownMenuItem(value: 'in_progress', child: Text('In progress')),
                    DropdownMenuItem(value: 'formed', child: Text('Formed')),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      widget.provider.updateHabitStatus(habitId, val);
                    }
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: AppTheme.textMuted, size: 20),
                  onPressed: () => _confirmDeleteHabit(context, habit),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Stats row
            Row(
              children: [
                _buildStatBox('🔥 ${streaks.current}', 'Current Streak'),
                const SizedBox(width: 8),
                _buildStatBox('🏆 ${streaks.best}', 'Best Streak'),
                const SizedBox(width: 8),
                _buildStatBox('📅 ${ticks.length}', 'Total Ticks'),
              ],
            ),
            const SizedBox(height: 16),

            // Calendar Section Header
            Text(
              _getMonthTitle(),
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
            ),
            const SizedBox(height: 8),

            // Calendar Weekday Headers (M, T, W, T, F, S, S)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w) {
                return Expanded(
                  child: Center(
                    child: Text(
                      w,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted),
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 6),

            // Calendar Month Grid (7 columns)
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 7,
                crossAxisSpacing: 4,
                mainAxisSpacing: 4,
              ),
              itemCount: calendarDays.length,
              itemBuilder: (context, index) {
                final day = calendarDays[index];
                if (day.isBlank) {
                  return const SizedBox();
                }

                final isTicked = ticks.contains(day.dateStr);
                final isToday = day.dateStr == todayStr;

                Color bgColor = AppTheme.bgTertiary;
                if (isTicked) {
                  bgColor = AppTheme.accentCyan;
                }

                return GestureDetector(
                  key: ValueKey('habit-day-${day.dateStr}'),
                  onTap: day.isFuture
                      ? null
                      : () => widget.provider.toggleHabitTick(habitId, day.dateStr),
                  child: Container(
                    decoration: BoxDecoration(
                      color: bgColor,
                      borderRadius: BorderRadius.circular(4),
                      border: isToday
                          ? Border.all(color: AppTheme.accentCyan, width: 1.5)
                          : Border.all(color: AppTheme.borderColor, width: 0.5),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${day.label}',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: isToday || isTicked ? FontWeight.bold : FontWeight.normal,
                        color: day.isFuture
                            ? AppTheme.textMuted.withValues(alpha: 0.4)
                            : (isTicked ? Colors.white : AppTheme.textSecondary),
                      ),
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatBox(String value, String label) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
        decoration: BoxDecoration(
          color: AppTheme.bgTertiary,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.provider,
      builder: (context, _) {
        if (widget.provider.isLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        final activeHabits = widget.provider.habits
            .where((h) => h['status'] != 'formed')
            .toList();
        final formedHabits = widget.provider.habits
            .where((h) => h['status'] == 'formed')
            .toList();

        return ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // Add Habit Bar Card
            MyOkrCard(
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _nameController,
                      style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
                      decoration: const InputDecoration(
                        hintText: 'I want to form a habit to...',
                        hintStyle: TextStyle(color: AppTheme.textMuted),
                        border: InputBorder.none,
                      ),
                      onSubmitted: (_) => _handleAddHabit(),
                    ),
                  ),
                  ElevatedButton(
                    onPressed: _handleAddHabit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentCyan,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Add Habit'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Active Habits List
            if (activeHabits.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32.0),
                child: Center(
                  child: Text(
                    'No active habits yet. Add one above!',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ),
              )
            else
              ...activeHabits.map(_buildHabitCard),

            // Formed Habits Collapsible Accordion
            if (formedHabits.isNotEmpty) ...[
              const SizedBox(height: 16),
              InkWell(
                onTap: () {
                  setState(() {
                    _showFormed = !_showFormed;
                  });
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Row(
                    children: [
                      Icon(
                        _showFormed ? Icons.arrow_drop_down : Icons.arrow_right,
                        color: AppTheme.textSecondary,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Formed Habits (${formedHabits.length})',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              if (_showFormed) ...[
                const SizedBox(height: 8),
                ...formedHabits.map(_buildHabitCard),
              ],
            ],
          ],
        );
      },
    );
  }
}
