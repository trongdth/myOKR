import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';

class ReviewWizardScreen extends StatefulWidget {
  final String weekStart;
  final String weekEnd;
  final String cycleId;
  final StorageProvider provider;

  const ReviewWizardScreen({
    super.key,
    required this.weekStart,
    required this.weekEnd,
    required this.cycleId,
    required this.provider,
  });

  @override
  State<ReviewWizardScreen> createState() => _ReviewWizardScreenState();
}

class _ReviewWizardScreenState extends State<ReviewWizardScreen> {
  int _currentStep = 0;
  late List<Map<String, dynamic>> _cycleKRs;
  late List<Map<String, dynamic>> _cycleObjectives;
  late List<Map<String, dynamic>> _entries;
  String _reflection = '';
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();

    _cycleObjectives = widget.provider.objectives
        .where((o) => o['cycleId'] == widget.cycleId)
        .toList();

    final objIds = _cycleObjectives.map((o) => o['id']).toSet();
    _cycleKRs = widget.provider.keyResults
        .where((kr) => objIds.contains(kr['objectiveId']))
        .toList();

    // Prepare initial entries
    final completedReviews = widget.provider.reviews
        .where((r) => r['completedAt'] != null)
        .toList();
    completedReviews.sort((a, b) {
      final dateA = a['weekStartDate'] as String? ?? '';
      final dateB = b['weekStartDate'] as String? ?? '';
      return dateB.compareTo(dateA); // latest first
    });

    final previousSunday = _getPreviousSunday(widget.weekStart);

    _entries = _cycleKRs.map((kr) {
      final krId = kr['id'] as String;
      Map? lastEntry;
      for (final r in completedReviews) {
        final entriesList = r['entries'] as List? ?? [];
        for (final item in entriesList) {
          if (item is Map && item['keyResultId'] == krId) {
            lastEntry = item;
            break;
          }
        }
        if (lastEntry != null) break;
      }

      final mode = kr['completionMode'] as String? ?? 'manual';
      final isManual = mode == 'manual';

      final prevVal = isManual
          ? (lastEntry != null ? (lastEntry['currentValue'] as num?)?.toDouble() ?? 0.0 : 0.0)
          : widget.provider.getEffectiveCurrentValueAsOf(kr, previousSunday);

      final currVal = isManual
          ? (kr['currentValue'] as num?)?.toDouble() ?? 0.0
          : widget.provider.getEffectiveCurrentValueAsOf(kr, widget.weekEnd);

      final rawConf = kr['confidence'] as String? ?? 'on_track';
      final confidence = rawConf == 'not_set' ? 'on_track' : rawConf;

      return <String, dynamic>{
        'keyResultId': krId,
        'previousValue': prevVal,
        'currentValue': currVal,
        'confidence': confidence,
        'note': '',
      };
    }).toList();
  }

  String _getPreviousSunday(String weekStart) {
    try {
      final dt = DateTime.parse(weekStart).subtract(const Duration(days: 1));
      return dt.toIso8601String().substring(0, 10);
    } catch (_) {
      return weekStart;
    }
  }

  List<Map<String, dynamic>> _getLinkedTasksForKR(String krId) {
    return widget.provider.tasks.where((t) => t['keyResultId'] == krId).toList();
  }

  Future<void> _handleComplete() async {
    if (_isSaving) return;
    setState(() => _isSaving = true);

    try {
      // Calculate Pomodoro stats for this week
      int totalPomos = 0;
      int focusMins = 0;
      for (final rec in widget.provider.history) {
        final date = rec['date'] as String? ?? '';
        if (date.compareTo(widget.weekStart) >= 0 && date.compareTo(widget.weekEnd) <= 0) {
          totalPomos += (rec['completedPomodoros'] as num?)?.toInt() ?? 0;
          focusMins += (rec['totalFocusMinutes'] as num?)?.toInt() ?? 0;
        }
      }

      int tasksCompleted = 0;
      for (final t in widget.provider.tasks) {
        final isDone = t['isCompleted'] as bool? ?? false;
        final compAt = t['completedAt'] as String? ?? '';
        if (isDone && compAt.length >= 10) {
          final compDate = compAt.substring(0, 10);
          if (compDate.compareTo(widget.weekStart) >= 0 && compDate.compareTo(widget.weekEnd) <= 0) {
            tasksCompleted++;
          }
        }
      }

      final pomodorosByKeyResult = <String, int>{};
      for (final kr in _cycleKRs) {
        final krId = kr['id'] as String;
        final tasks = _getLinkedTasksForKR(krId);
        int krPomos = 0;
        for (final t in tasks) {
          krPomos += (t['completedPomodoros'] as num?)?.toInt() ?? 0;
        }
        pomodorosByKeyResult[krId] = krPomos;
      }

      final reviewData = <String, dynamic>{
        'weekStartDate': widget.weekStart,
        'weekEndDate': widget.weekEnd,
        'cycleId': widget.cycleId,
        'completedAt': DateTime.now().toUtc().toIso8601String(),
        'entries': _entries,
        'reflection': _reflection.trim().isEmpty ? null : _reflection.trim(),
        'pomodoroStats': {
          'totalPomodoros': totalPomos,
          'totalFocusMinutes': focusMins,
          'tasksCompleted': tasksCompleted,
          'pomodorosByKeyResult': pomodorosByKeyResult,
        },
      };

      await widget.provider.saveReview(reviewData);
      await widget.provider.syncKeyResultsFromReviews();

      if (mounted) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error saving review: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final totalSteps = _cycleKRs.length + 2; // Step 0: Summary, 1..N: KRs, N+1: Reflection
    final isSummaryStep = _currentStep == 0;
    final isReflectionStep = _currentStep == totalSteps - 1;
    final krStepIndex = _currentStep - 1;

    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(
        title: Text('Step ${_currentStep + 1} of $totalSteps'),
        backgroundColor: AppTheme.bgCard,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: Column(
        children: [
          // Step progress dots
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Row(
              children: List.generate(totalSteps, (i) {
                final isDone = i < _currentStep;
                final isCurrent = i == _currentStep;
                return Expanded(
                  child: Container(
                    height: 4,
                    margin: const EdgeInsets.symmetric(horizontal: 2.0),
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? AppTheme.accentCyan
                          : (isDone ? AppTheme.okrOnTrack : AppTheme.borderColor),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                );
              }),
            ),
          ),

          // Step Content Scroll View
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: isSummaryStep
                  ? _buildSummaryStep()
                  : (isReflectionStep
                      ? _buildReflectionStep()
                      : _buildKRStep(krStepIndex)),
            ),
          ),

          // Sticky Bottom Navigation Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              color: AppTheme.bgCard,
              border: Border(top: BorderSide(color: AppTheme.borderColor)),
            ),
            child: SafeArea(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  OutlinedButton(
                    onPressed: _currentStep == 0
                        ? () => Navigator.of(context).pop()
                        : () => setState(() => _currentStep--),
                    child: Text(_currentStep == 0 ? 'Cancel' : '← Previous'),
                  ),
                  ElevatedButton(
                    onPressed: _isSaving
                        ? null
                        : (isReflectionStep
                            ? _handleComplete
                            : () => setState(() => _currentStep++)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentCyan,
                      foregroundColor: Colors.black,
                    ),
                    child: _isSaving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                          )
                        : Text(isReflectionStep ? '✅ Complete Review' : 'Next →'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryStep() {
    int totalPomos = 0;
    int focusMins = 0;
    for (final rec in widget.provider.history) {
      final date = rec['date'] as String? ?? '';
      if (date.compareTo(widget.weekStart) >= 0 && date.compareTo(widget.weekEnd) <= 0) {
        totalPomos += (rec['completedPomodoros'] as num?)?.toInt() ?? 0;
        focusMins += (rec['totalFocusMinutes'] as num?)?.toInt() ?? 0;
      }
    }

    int tasksCompleted = 0;
    for (final t in widget.provider.tasks) {
      final isDone = t['isCompleted'] as bool? ?? false;
      final compAt = t['completedAt'] as String? ?? '';
      if (isDone && compAt.length >= 10) {
        final compDate = compAt.substring(0, 10);
        if (compDate.compareTo(widget.weekStart) >= 0 && compDate.compareTo(widget.weekEnd) <= 0) {
          tasksCompleted++;
        }
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '📋 Weekly Review — Week of ${widget.weekStart}',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
        ),
        const SizedBox(height: 16),
        const Text(
          '📊 This Week\'s Summary',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
        ),
        const SizedBox(height: 12),

        Row(
          children: [
            Expanded(child: _buildStatCard('🍅', '$totalPomos', 'Pomodoros')),
            const SizedBox(width: 8),
            Expanded(child: _buildStatCard('⏱️', '${focusMins}m', 'Focus Time')),
            const SizedBox(width: 8),
            Expanded(child: _buildStatCard('✅', '$tasksCompleted', 'Tasks Done')),
          ],
        ),
        const SizedBox(height: 20),

        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'You will now review your ${_cycleKRs.length} key result${_cycleKRs.length != 1 ? 's' : ''} for this cycle.',
                style: const TextStyle(fontSize: 14, color: AppTheme.textSecondary, height: 1.5),
              ),
              const SizedBox(height: 8),
              const Text(
                'Update your current values, assess your confidence level, and leave notes on your progress.',
                style: TextStyle(fontSize: 13, color: AppTheme.textMuted, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatCard(String icon, String value, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppTheme.borderColor),
      ),
      child: Column(
        children: [
          Text(icon, style: const TextStyle(fontSize: 22)),
          const SizedBox(height: 4),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
        ],
      ),
    );
  }

  Widget _buildKRStep(int index) {
    if (index < 0 || index >= _cycleKRs.length) return const SizedBox.shrink();

    final kr = _cycleKRs[index];
    final krId = kr['id'] as String? ?? '';
    final entry = _entries[index];
    final objective = _cycleObjectives.firstWhere(
      (o) => o['id'] == kr['objectiveId'],
      orElse: () => {'title': 'Objective'},
    );

    final mode = kr['completionMode'] as String? ?? 'manual';
    final isManual = mode == 'manual';
    final targetVal = (kr['targetValue'] as num?)?.toDouble() ?? 0.0;
    final unit = kr['unit'] as String? ?? '';
    final linkedTasks = _getLinkedTasksForKR(krId);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Objective badge & KR Title
        Text(
          '🎯 ${objective['title']}',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.accentCyan),
        ),
        const SizedBox(height: 4),
        Text(
          kr['title'] as String? ?? 'Key Result',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
        ),
        const SizedBox(height: 20),

        // Progress Update Box
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.bgCard,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.borderColor),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('PROGRESS UPDATE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted, letterSpacing: 0.5)),
              const SizedBox(height: 12),

              Row(
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Previous', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                      const SizedBox(height: 2),
                      Text(
                        '${entry['previousValue']}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.0),
                    child: Text('→', style: TextStyle(fontSize: 18, color: AppTheme.textMuted)),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Text('Current', style: TextStyle(fontSize: 11, color: AppTheme.textMuted)),
                            if (!isManual) ...[
                              const SizedBox(width: 4),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                decoration: BoxDecoration(
                                  color: AppTheme.accentCyan.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('AUTO', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: AppTheme.accentCyan)),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        if (isManual)
                          TextFormField(
                            initialValue: '${entry['currentValue']}',
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              border: OutlineInputBorder(),
                            ),
                            onChanged: (val) {
                              final numVal = double.tryParse(val) ?? 0.0;
                              setState(() {
                                entry['currentValue'] = numVal;
                              });
                            },
                          )
                        else
                          Text(
                            '${entry['currentValue']}',
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('/ $targetVal $unit', style: const TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Confidence Selector
        const Text('CONFIDENCE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        Row(
          children: [
            _buildConfidenceOption(index, 'on_track', '🟢 On Track'),
            const SizedBox(width: 8),
            _buildConfidenceOption(index, 'at_risk', '🟡 At Risk'),
            const SizedBox(width: 8),
            _buildConfidenceOption(index, 'off_track', '🔴 Off Track'),
          ],
        ),
        const SizedBox(height: 20),

        // Linked Pomodoro Tasks Breakdown
        if (linkedTasks.isNotEmpty) ...[
          const Text('LINKED POMODORO TASKS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.bgCard,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.borderColor),
            ),
            child: Column(
              children: linkedTasks.map((t) {
                final name = t['title'] as String? ?? t['name'] as String? ?? 'Task';
                final pomos = t['completedPomodoros'] as num? ?? 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('• $name', style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                      Text('🍅 $pomos pomos', style: const TextStyle(fontSize: 12, color: AppTheme.accentCyan)),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 20),
        ],

        // Notes Area
        const Text('NOTES', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.textMuted, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        TextFormField(
          initialValue: entry['note'] as String? ?? '',
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'What progress did you make? What\'s blocking you?',
            border: OutlineInputBorder(),
          ),
          onChanged: (val) {
            entry['note'] = val;
          },
        ),
      ],
    );
  }

  Widget _buildConfidenceOption(int index, String key, String label) {
    final isSelected = _entries[index]['confidence'] == key;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() {
            _entries[index]['confidence'] = key;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.accentCyan.withOpacity(0.15) : AppTheme.bgCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: isSelected ? AppTheme.accentCyan : AppTheme.borderColor,
              width: isSelected ? 1.5 : 1.0,
            ),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: isSelected ? AppTheme.textPrimary : AppTheme.textSecondary,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildReflectionStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          '💭 Overall Reflection',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
        ),
        const SizedBox(height: 8),
        const Text(
          'What went well this week? What could be improved? Any goals for next week?',
          style: TextStyle(fontSize: 13, color: AppTheme.textMuted, height: 1.4),
        ),
        const SizedBox(height: 16),

        TextFormField(
          initialValue: _reflection,
          maxLines: 6,
          decoration: const InputDecoration(
            hintText: 'Write your overall reflection for this week...',
            border: OutlineInputBorder(),
          ),
          onChanged: (val) {
            _reflection = val;
          },
        ),
      ],
    );
  }
}
