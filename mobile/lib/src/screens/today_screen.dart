import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/today_focus.dart';
import 'package:myokr_mobile/src/widgets/myokr_card.dart';
import 'package:myokr_mobile/src/widgets/task_details_sheet.dart';

class TodayScreen extends StatefulWidget {
  final StorageProvider provider;
  final VoidCallback onStartFocus;

  const TodayScreen({
    super.key,
    required this.provider,
    required this.onStartFocus,
  });

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  final Set<String> _skippedIds = {};

  void _skipTask(String taskId) {
    setState(() {
      _skippedIds.add(taskId);
    });
  }

  void _startTask(String taskId) {
    widget.provider.setActiveTaskId(taskId);
    widget.onStartFocus();
  }

  void _resetSkips() {
    setState(() {
      _skippedIds.clear();
    });
  }

  String _getCategoryLabel(String cat) {
    switch (cat) {
      case 'do':
        return 'Do First';
      case 'decide':
        return 'Schedule';
      case 'delegate':
        return 'Delegate';
      case 'delete':
        return 'Eliminate';
      default:
        return 'Do First';
    }
  }

  Color _getCategoryColor(String cat) {
    switch (cat) {
      case 'do':
        return AppTheme.okrOffTrack;
      case 'decide':
        return AppTheme.okrAtRisk;
      case 'delegate':
        return AppTheme.accentCyan;
      case 'delete':
        return AppTheme.textMuted;
      default:
        return AppTheme.okrOffTrack;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.provider,
      builder: (context, _) {
        if (widget.provider.isLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        // Filter out completed tasks, deleted tasks, and skipped tasks
        final activeTasks = widget.provider.tasks
            .where((t) => t['completed'] != true && !_skippedIds.contains(t['id']))
            .toList();

        final pickedTasks = pickForBudget(
          activeTasks,
          widget.provider.keyResults,
          widget.provider.activeCycle,
          widget.provider.settings,
        );

        final budget = getDailyPomodoroBudget(widget.provider.settings);
        final maxShare = getMaxTaskBudgetShare(budget);
        final totalSlices = pickedTasks.fold<int>(0, (sum, t) => sum + todaysSlice(t, maxShare));

        if (pickedTasks.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text(
                    '📋',
                    style: TextStyle(fontSize: 48),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'No tasks left for today!',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Add more tasks or clear skipped tasks to plan your day.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                  if (_skippedIds.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: _resetSkips,
                      icon: const Icon(Icons.refresh, size: 18),
                      label: const Text('Reset Skipped Tasks'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.accentCyan,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          );
        }

        return ListView(
          padding: const EdgeInsets.all(16.0),
          children: [
            // Daily budget planner summary
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  "Today's Plan: $totalSlices / $budget 🍅",
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSecondary,
                  ),
                ),
                if (_skippedIds.isNotEmpty)
                  TextButton(
                    onPressed: _resetSkips,
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero),
                    child: const Text(
                      'Reset Skips',
                      style: TextStyle(color: AppTheme.accentCyan, fontSize: 12),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),

            // Top picks list
            ...Iterable<int>.generate(pickedTasks.length).map((index) {
              final task = pickedTasks[index];
              final krId = task['keyResultId'];
              final kr = krId != null
                  ? widget.provider.keyResults.firstWhere(
                      (k) => k['id'] == krId,
                      orElse: () => <String, dynamic>{},
                    )
                  : null;

              final krTitle = kr != null && kr.isNotEmpty ? kr['title'] as String : null;

              return Padding(
                padding: const EdgeInsets.only(bottom: 12.0),
                child: MyOkrCard(
                  isInteractive: true,
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      builder: (context) => TaskDetailsSheet(
                        task: task,
                        provider: widget.provider,
                      ),
                    );
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header: Rank + Title
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: index == 0 ? AppTheme.accentCyan : AppTheme.bgTertiary,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '#${index + 1}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: index == 0 ? Colors.white : AppTheme.textSecondary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              task['title'] ?? '',
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.textPrimary,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      // Meta info: Category + Pomodoros + KR
                      Row(
                        children: [
                          Container(
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: _getCategoryColor(task['category'] ?? 'do'),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _getCategoryLabel(task['category'] ?? 'do'),
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          ),
                          const SizedBox(width: 12),
                          Text(
                            '🍅 ${task['completedPomodoros'] ?? 0}/${task['estimatedPomodoros'] ?? 1}',
                            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                          ),
                        ],
                      ),
                      if (krTitle != null) ...[
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Text(
                              '🎯 ',
                              style: TextStyle(fontSize: 12),
                            ),
                            Expanded(
                              child: Text(
                                krTitle,
                                style: const TextStyle(fontSize: 12, color: AppTheme.accentCyan),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                      const Divider(color: AppTheme.borderColor, height: 24),

                      // Action buttons
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          OutlinedButton.icon(
                            onPressed: () {
                              final id = task['id'];
                              if (id is String) _skipTask(id);
                            },
                            icon: const Icon(Icons.skip_next, size: 16),
                            label: const Text('Skip'),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.textSecondary,
                              side: const BorderSide(color: AppTheme.borderColor),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton.icon(
                            onPressed: () {
                              final id = task['id'];
                              if (id is String) _startTask(id);
                            },
                            icon: const Icon(Icons.play_arrow, size: 16),
                            label: const Text('Start Focus'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.accentCyan,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        );
      },
    );
  }
}
