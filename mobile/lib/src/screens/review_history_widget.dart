import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/review_entry_edit_sheet.dart';

class ReviewHistoryWidget extends StatefulWidget {
  final StorageProvider provider;
  final List<Map<String, dynamic>> reviews;

  const ReviewHistoryWidget({
    super.key,
    required this.provider,
    required this.reviews,
  });

  @override
  State<ReviewHistoryWidget> createState() => _ReviewHistoryWidgetState();
}

class _ReviewHistoryWidgetState extends State<ReviewHistoryWidget> {
  String? _expandedId;

  Color _getConfidenceColor(String? confidence) {
    switch (confidence) {
      case 'on_track':
        return AppTheme.okrOnTrack;
      case 'at_risk':
        return AppTheme.okrAtRisk;
      case 'off_track':
        return AppTheme.okrOffTrack;
      default:
        return AppTheme.textMuted;
    }
  }

  String _getConfidenceIcon(String? confidence) {
    switch (confidence) {
      case 'on_track':
        return '🟢';
      case 'at_risk':
        return '🟡';
      case 'off_track':
        return '🔴';
      default:
        return '⚪';
    }
  }

  List<Map<String, dynamic>> _getLinkedTasksForKr(String krId, String weekStart, String weekEnd) {
    final taskMap = <String, Map<String, dynamic>>{};
    for (final task in widget.provider.tasks) {
      final id = task['id'] as String?;
      if (id != null) taskMap[id] = task;
    }

    final pomoCounts = <String, int>{};
    for (final day in widget.provider.history) {
      final date = day['date'] as String?;
      if (date != null && date.compareTo(weekStart) >= 0 && date.compareTo(weekEnd) <= 0) {
        final sessions = day['sessions'];
        if (sessions is List) {
          for (final s in sessions) {
            if (s is Map && s['type'] == 'focus' && s['completed'] == true && s['taskId'] != null) {
              final tId = s['taskId'] as String;
              pomoCounts[tId] = (pomoCounts[tId] ?? 0) + 1;
            }
          }
        }
      }
    }

    final result = <Map<String, dynamic>>[];
    for (final entry in pomoCounts.entries) {
      final task = taskMap[entry.key];
      if (task != null && task['keyResultId'] == krId) {
        result.add({
          'taskTitle': task['title'] as String? ?? 'Untitled Task',
          'pomos': entry.value,
        });
      }
    }

    result.sort((a, b) => (b['pomos'] as int).compareTo(a['pomos'] as int));
    return result;
  }

  void _confirmDelete(BuildContext context, String reviewId, String weekStart) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        title: const Text('Delete Review', style: TextStyle(color: AppTheme.textPrimary)),
        content: Text(
          'Are you sure you want to delete the review for the week of $weekStart? This action cannot be undone.',
          style: const TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await widget.provider.deleteReview(reviewId);
              if (!mounted) return;
              if (_expandedId == reviewId) {
                setState(() {
                  _expandedId = null;
                });
              }
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
            child: const Text('Delete', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  void _openEditSheet(BuildContext context, Map<String, dynamic> review, Map<String, dynamic> entry, Map<String, dynamic> kr) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ReviewEntryEditSheet(
        entry: entry,
        keyResult: kr,
        onSave: (updatedEntry) async {
          final entries = (review['entries'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          final idx = entries.indexWhere((e) => e['keyResultId'] == updatedEntry['keyResultId']);
          if (idx >= 0) {
            entries[idx] = updatedEntry;
            final updatedReview = Map<String, dynamic>.from(review);
            updatedReview['entries'] = entries;
            await widget.provider.saveReview(updatedReview);
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sorted = [...widget.reviews]
        .where((r) => r['completedAt'] != null)
        .toList();
    sorted.sort((a, b) {
      final dateA = a['weekStartDate'] as String? ?? '';
      final dateB = b['weekStartDate'] as String? ?? '';
      return dateB.compareTo(dateA);
    });

    if (sorted.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: AppTheme.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.borderColor),
        ),
        child: const Column(
          children: [
            Text('📚 Past Reviews', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
            SizedBox(height: 8),
            Text(
              'No completed reviews yet. Complete your first weekly review to see history here.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            '📚 Past Reviews (${sorted.length})',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
          ),
        ),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: sorted.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (context, index) {
            final review = sorted[index];
            final reviewId = review['id'] as String? ?? '';
            final weekStart = review['weekStartDate'] as String? ?? '';
            final weekEnd = review['weekEndDate'] as String? ?? '';
            final isExpanded = _expandedId == reviewId;

            final entries = (review['entries'] as List? ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();

            final pomodoroStats = review['pomodoroStats'] as Map? ?? {};
            final totalPomos = (pomodoroStats['totalPomodoros'] as num?)?.toInt() ?? 0;
            final totalMinutes = (pomodoroStats['totalFocusMinutes'] as num?)?.toInt() ?? 0;
            final tasksCompleted = (pomodoroStats['tasksCompleted'] as num?)?.toInt() ?? 0;

            final reflection = review['reflection'] as String?;

            return Container(
              decoration: BoxDecoration(
                color: AppTheme.bgCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: isExpanded ? AppTheme.accentCyan : AppTheme.borderColor),
              ),
              child: Column(
                children: [
                  // Card Header
                  InkWell(
                    onTap: () {
                      setState(() {
                        _expandedId = isExpanded ? null : reviewId;
                      });
                    },
                    borderRadius: BorderRadius.circular(10),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Week of $weekStart',
                                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                              ),
                              Row(
                                children: [
                                  // Confidence summary dots
                                  Row(
                                    children: entries.map((e) {
                                      final conf = e['confidence'] as String?;
                                      return Container(
                                        width: 8, height: 8,
                                        margin: const EdgeInsets.only(left: 3),
                                        decoration: BoxDecoration(
                                          color: _getConfidenceColor(conf),
                                          shape: BoxShape.circle,
                                        ),
                                      );
                                    }).toList(),
                                  ),
                                  const SizedBox(width: 8),
                                  IconButton(
                                    icon: const Icon(Icons.close, size: 18, color: AppTheme.textMuted),
                                    onPressed: () => _confirmDelete(context, reviewId, weekStart),
                                    padding: EdgeInsets.zero,
                                    constraints: const BoxConstraints(),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Text('🍅 $totalPomos pomos', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                              const SizedBox(width: 12),
                              Text('⏱ ${totalMinutes}m focus', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                              const SizedBox(width: 12),
                              Text('✅ $tasksCompleted tasks', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Expanded Details
                  if (isExpanded) ...[
                    const Divider(height: 1, color: AppTheme.borderColor),
                    Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // KR entries
                          ...entries.map((entry) {
                            final krId = entry['keyResultId'] as String?;
                            final kr = widget.provider.keyResults.firstWhere((k) => k['id'] == krId, orElse: () => {});
                            final krTitle = kr['title'] as String? ?? 'Key Result';
                            final prevVal = (entry['previousValue'] as num?)?.toDouble() ?? 0.0;
                            final currVal = (entry['currentValue'] as num?)?.toDouble() ?? 0.0;
                            final confIcon = _getConfidenceIcon(entry['confidence'] as String?);
                            final note = entry['note'] as String?;
                            final linkedTasks = krId != null ? _getLinkedTasksForKr(krId, weekStart, weekEnd) : <Map<String, dynamic>>[];

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Container(
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: AppTheme.bgSecondary,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(confIcon, style: const TextStyle(fontSize: 14)),
                                        const SizedBox(width: 6),
                                        Expanded(
                                          child: Text(
                                            krTitle,
                                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                                          ),
                                        ),
                                        Text(
                                          '${prevVal.toStringAsFixed(prevVal.truncateToDouble() == prevVal ? 0 : 1)} → ${currVal.toStringAsFixed(currVal.truncateToDouble() == currVal ? 0 : 1)}',
                                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.accentCyan),
                                        ),
                                        const SizedBox(width: 6),
                                        IconButton(
                                          icon: const Icon(Icons.edit, size: 16, color: AppTheme.textMuted),
                                          onPressed: () => _openEditSheet(context, review, entry, kr),
                                          padding: EdgeInsets.zero,
                                          constraints: const BoxConstraints(),
                                        ),
                                      ],
                                    ),
                                    if (note != null && note.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        'Note: $note',
                                        style: const TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: AppTheme.textSecondary),
                                      ),
                                    ],
                                    if (linkedTasks.isNotEmpty) ...[
                                      const SizedBox(height: 6),
                                      ...linkedTasks.map((t) => Padding(
                                        padding: const EdgeInsets.only(left: 18, top: 2),
                                        child: Text(
                                          '• ${t['taskTitle']} (🍅 ${t['pomos']})',
                                          style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                                        ),
                                      )),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          }),

                          // Reflection
                          if (reflection != null && reflection.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: AppTheme.bgSecondary,
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppTheme.borderColor),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('💭 ', style: TextStyle(fontSize: 14)),
                                  Expanded(
                                    child: Text(
                                      reflection,
                                      style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary, height: 1.4),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
