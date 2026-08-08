import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/widgets/myokr_card.dart';

class AnalyticsView extends StatelessWidget {
  final StorageProvider provider;

  const AnalyticsView({
    super.key,
    required this.provider,
  });

  String _getLocalDateString(DateTime dt) {
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  void _exportData(BuildContext context) {
    try {
      final data = {
        'settings': provider.settings,
        'tasks': provider.tasks,
        'history': provider.history,
        'cycles': provider.cycles,
        'objectives': provider.objectives,
        'keyResults': provider.keyResults,
        'reviews': provider.reviews,
        'exportedAt': DateTime.now().toIso8601String(),
      };
      final jsonStr = const JsonEncoder.withIndent('  ').convert(data);
      Clipboard.setData(ClipboardData(text: jsonStr));

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('All data copied to clipboard as JSON!'),
          backgroundColor: AppTheme.accentEmerald,
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Export failed: $e'),
          backgroundColor: AppTheme.okrOffTrack,
        ),
      );
    }
  }

  void _importData(BuildContext context) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppTheme.bgSecondary,
          title: const Text('Import JSON Data', style: TextStyle(color: AppTheme.textPrimary)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Paste the JSON data that you exported previously below:',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                maxLines: 8,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 12),
                decoration: const InputDecoration(
                  hintText: 'Paste JSON here...',
                  hintStyle: TextStyle(color: AppTheme.textMuted),
                  border: OutlineInputBorder(
                    borderSide: BorderSide(color: AppTheme.borderColor),
                  ),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: AppTheme.textSecondary)),
            ),
            ElevatedButton(
              onPressed: () async {
                final text = controller.text.trim();
                if (text.isEmpty) return;
                final messenger = ScaffoldMessenger.of(context);

                try {
                  final data = jsonDecode(text) as Map<String, dynamic>;
                  
                  if (data['settings'] != null) {
                    await provider.saveSettings(Map<String, dynamic>.from(data['settings']));
                  }
                  if (data['tasks'] != null) {
                    await provider.saveTasks(List<Map<String, dynamic>>.from(data['tasks']));
                  }
                  if (data['history'] != null) {
                    provider.history = List<Map<String, dynamic>>.from(data['history']);
                    await provider.pomodoroStorage.saveHistory(provider.history);
                  }
                  if (data['cycles'] != null) {
                    provider.cycles = List<Map<String, dynamic>>.from(data['cycles']);
                    await provider.okrStorage.saveCycles(provider.cycles);
                  }
                  if (data['objectives'] != null) {
                    await provider.saveObjectives(List<Map<String, dynamic>>.from(data['objectives']));
                  }
                  if (data['keyResults'] != null) {
                    await provider.saveKeyResults(List<Map<String, dynamic>>.from(data['keyResults']));
                  }

                  // Force a reload
                  await provider.loadAllData();

                  if (ctx.mounted) {
                    Navigator.pop(ctx);
                    messenger.showSnackBar(
                      const SnackBar(
                        content: Text('Data imported successfully!'),
                        backgroundColor: AppTheme.accentEmerald,
                      ),
                    );
                  }
                } catch (e) {
                  messenger.showSnackBar(
                    SnackBar(
                      content: Text('Invalid JSON structure: $e'),
                      backgroundColor: AppTheme.okrOffTrack,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.accentCyan),
              child: const Text('Import'),
            ),
          ],
        );
      },
    );
  }

  void _clearData(BuildContext context) {
    final messenger = ScaffoldMessenger.of(context);
    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppTheme.bgSecondary,
          title: const Text('Clear All Data?', style: TextStyle(color: AppTheme.okrOffTrack)),
          content: const Text(
            'This will permanently delete all tasks, history, settings, and OKRs. This action cannot be undone.',
            style: TextStyle(color: AppTheme.textSecondary),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: AppTheme.textSecondary)),
            ),
            ElevatedButton(
              onPressed: () async {
                // Clear state. clearSettings wholesale-wipes (saveSettings({}) now
                // means "change nothing" under read-modify-write). ADR-0004.
                await provider.pomodoroStorage.clearSettings();
                await provider.saveTasks([]);
                provider.history = [];
                await provider.pomodoroStorage.saveHistory([]);
                provider.cycles = [];
                await provider.okrStorage.saveCycles([]);
                await provider.saveObjectives([]);
                await provider.saveKeyResults([]);
                await provider.pomodoroStorage.clearTimerState();

                await provider.loadAllData();

                if (ctx.mounted) {
                  Navigator.pop(ctx);
                  messenger.showSnackBar(
                    const SnackBar(
                      content: Text('All data cleared successfully.'),
                      backgroundColor: AppTheme.textSecondary,
                    ),
                  );
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
              child: const Text('Delete Everything'),
            ),
          ],
        );
      },
    );
  }

  Widget _buildStatCard(String emoji, String title, String value) {
    return MyOkrCard(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 4),
          Text(
            title,
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // 1. Calculations
    final todayStr = _getLocalDateString(DateTime.now());
    final todayRec = provider.history.firstWhere(
      (r) => r['date'] == todayStr,
      orElse: () => <String, dynamic>{},
    );
    final todayCompleted = todayRec['completedPomodoros'] as int? ?? 0;
    final todayMinutes = todayRec['totalFocusMinutes'] as int? ?? 0;

    // Streak
    int streak = 0;
    DateTime d = DateTime.now();
    while (true) {
      final key = _getLocalDateString(d);
      final rec = provider.history.firstWhere(
        (r) => r['date'] == key,
        orElse: () => <String, dynamic>{},
      );
      final completed = rec['completedPomodoros'] as int? ?? 0;
      if (rec.isNotEmpty && completed > 0) {
        streak++;
        d = d.subtract(const Duration(days: 1));
      } else {
        break;
      }
    }

    // Totals
    final totalPomodoros = provider.history.fold<int>(0, (sum, r) => sum + (r['completedPomodoros'] as int? ?? 0));
    final totalFocusHours = (provider.history.fold<int>(0, (sum, r) => sum + (r['totalFocusMinutes'] as int? ?? 0)) / 60).toStringAsFixed(1);
    final totalTasksDone = provider.tasks.where((t) => t['completed'] == true).length;

    // Weekly bar chart (last 7 days)
    final weekData = <Map<String, dynamic>>[];
    final dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (int i = 6; i >= 0; i--) {
      final dt = DateTime.now().subtract(Duration(days: i));
      final key = _getLocalDateString(dt);
      final rec = provider.history.firstWhere(
        (r) => r['date'] == key,
        orElse: () => <String, dynamic>{},
      );
      weekData.add({
        'label': dayNames[dt.weekday % 7],
        'value': rec['completedPomodoros'] as int? ?? 0,
      });
    }
    final maxWeekValue = weekData.map<int>((w) => w['value'] as int).fold<int>(1, (m, val) => max(m, val));

    // Heatmap cells (last 35 days, 5 weeks aligned to Monday)
    final cells = <Map<String, dynamic>>[];
    final todayKey = _getLocalDateString(DateTime.now());
    final currentDay = DateTime.now().weekday;
    final daysToMonday = currentDay - 1;
    final startDate = DateTime.now().subtract(Duration(days: daysToMonday + 28));

    for (int i = 0; i < 35; i++) {
      final dt = startDate.add(Duration(days: i));
      final key = _getLocalDateString(dt);
      final rec = provider.history.firstWhere(
        (r) => r['date'] == key,
        orElse: () => <String, dynamic>{},
      );
      final count = rec['completedPomodoros'] as int? ?? 0;
      int level = 0;
      if (count >= 8) {
        level = 4;
      } else if (count >= 5) {
        level = 3;
      } else if (count >= 2) {
        level = 2;
      } else if (count >= 1) {
        level = 1;
      }

      cells.add({
        'date': key,
        'level': level,
        'count': count,
        'isFuture': key.compareTo(todayKey) > 0,
      });
    }

    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        // Header with export/import actions
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              '📊 Analytics',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
            ),
            Row(
              children: [
                TextButton(
                  onPressed: () => _exportData(context),
                  style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                  child: const Text('Export', style: TextStyle(color: AppTheme.accentCyan, fontSize: 12)),
                ),
                TextButton(
                  onPressed: () => _importData(context),
                  style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                  child: const Text('Import', style: TextStyle(color: AppTheme.accentCyan, fontSize: 12)),
                ),
                TextButton(
                  onPressed: () => _clearData(context),
                  style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                  child: const Text('Clear', style: TextStyle(color: AppTheme.okrOffTrack, fontSize: 12)),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),

        // 2x2 Grid stats cards
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          childAspectRatio: 1.2,
          children: [
            _buildStatCard('🍅', 'Today\'s Pomos', '$todayCompleted'),
            _buildStatCard('⏱️', 'Focus Time', '${todayMinutes}m'),
            _buildStatCard('🏆', 'All-Time Pomos', '$totalPomodoros'),
            _buildStatCard('🔥', 'Day Streak', '$streak days'),
          ],
        ),
        const SizedBox(height: 24),

        // Weekly Bar Chart
        MyOkrCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Last 7 Days',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: weekData.map((w) {
                  final val = w['value'] as int;
                  final heightFactor = val > 0 ? (val / maxWeekValue) : 0.0;
                  return Expanded(
                    child: Column(
                      children: [
                        Text(
                          val > 0 ? '$val' : '',
                          style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 4),
                        Container(
                          height: max(4.0, heightFactor * 80.0),
                          margin: const EdgeInsets.symmetric(horizontal: 6),
                          decoration: BoxDecoration(
                            color: val > 0 ? AppTheme.accentCyan : AppTheme.borderColor,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          w['label'] as String,
                          style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Heatmap Card
        MyOkrCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Last 5 Weeks',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
              ),
              const SizedBox(height: 16),
              // GridView for 35 cells
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  crossAxisSpacing: 6,
                  mainAxisSpacing: 6,
                ),
                itemCount: 35,
                itemBuilder: (context, index) {
                  final cell = cells[index];
                  final level = cell['level'] as int;
                  final isFuture = cell['isFuture'] as bool;
                  
                  Color color = AppTheme.bgTertiary;
                  if (!isFuture) {
                    if (level == 1) {
                      color = AppTheme.accentCyan.withValues(alpha: 0.2);
                    } else if (level == 2) {
                      color = AppTheme.accentCyan.withValues(alpha: 0.4);
                    } else if (level == 3) {
                      color = AppTheme.accentCyan.withValues(alpha: 0.7);
                    } else if (level == 4) {
                      color = AppTheme.accentCyan;
                    }
                  }

                  return Tooltip(
                    message: '${cell['date']}: ${cell['count']} pomodoros',
                    child: Container(
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(3),
                        border: Border.all(
                        color: isFuture ? AppTheme.borderColor.withValues(alpha: 0.3) : AppTheme.borderColor,
                        width: 0.5,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 16),
              // Legend
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  const Text('Less ', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                  _buildLegendBox(AppTheme.bgTertiary),
                  _buildLegendBox(AppTheme.accentCyan.withValues(alpha: 0.2)),
                  _buildLegendBox(AppTheme.accentCyan.withValues(alpha: 0.4)),
                  _buildLegendBox(AppTheme.accentCyan.withValues(alpha: 0.7)),
                  _buildLegendBox(AppTheme.accentCyan),
                  const Text(' More', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Summary Card
        MyOkrCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Summary',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  Column(
                    children: [
                      Text('${totalFocusHours}h', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                      const SizedBox(height: 4),
                      const Text('Total Focus', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    ],
                  ),
                  Column(
                    children: [
                      Text('$totalPomodoros', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                      const SizedBox(height: 4),
                      const Text('Pomodoros', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    ],
                  ),
                  Column(
                    children: [
                      Text('$totalTasksDone', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                      const SizedBox(height: 4),
                      const Text('Tasks Done', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildLegendBox(Color color) {
    return Container(
      width: 10,
      height: 10,
      margin: const EdgeInsets.symmetric(horizontal: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
