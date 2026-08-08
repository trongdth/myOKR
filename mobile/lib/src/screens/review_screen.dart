import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/utils/review_utils.dart';
import 'package:myokr_mobile/src/screens/review_history_widget.dart';
import 'package:myokr_mobile/src/screens/progress_chart_widget.dart';
import 'package:myokr_mobile/src/screens/review_wizard_screen.dart';

class ReviewScreen extends StatefulWidget {
  final StorageProvider provider;
  final VoidCallback? onStartWizard;

  const ReviewScreen({
    super.key,
    required this.provider,
    this.onStartWizard,
  });

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  String? _explicitCycleId;
  late String _selectedWeek;

  @override
  void initState() {
    super.initState();
    _selectedWeek = getCurrentWeekStart();
  }

  Map<String, dynamic>? get _activeCycle {
    final cycles = widget.provider.cycles;
    if (cycles.isEmpty) return null;

    if (_explicitCycleId != null) {
      final found = cycles.firstWhere((c) => c['id'] == _explicitCycleId, orElse: () => {});
      if (found.isNotEmpty) return found;
    }

    final selectedDate = DateTime.tryParse(_selectedWeek) ?? DateTime.now();
    final targetMonth = selectedDate.month - 1;
    final targetYear = selectedDate.year;

    final inferred = cycles.firstWhere(
      (c) => c['month'] == targetMonth && c['year'] == targetYear,
      orElse: () => cycles.firstWhere(
        (c) => c['isActive'] == true,
        orElse: () => cycles.first,
      ),
    );

    return inferred;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.provider,
      builder: (context, _) {
        if (widget.provider.isLoading) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.accentCyan));
        }

        final cycles = widget.provider.cycles;
        final activeCycle = _activeCycle;

        if (activeCycle == null) {
          return Scaffold(
            body: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text('🎯', style: TextStyle(fontSize: 48)),
                  const SizedBox(height: 12),
                  const Text('No OKR cycle found', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                  const SizedBox(height: 8),
                  const Text(
                    'Create your first OKR cycle in the OKRs tab to start weekly reviews.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: AppTheme.textSecondary),
                  ),
                ],
              ),
            ),
          );
        }

        final mondays = getMondaysForCycle(activeCycle);
        final effectiveWeek = (mondays.isNotEmpty && !mondays.contains(_selectedWeek))
            ? (mondays.contains(getCurrentWeekStart()) ? getCurrentWeekStart() : mondays.first)
            : _selectedWeek;

        final weekStart = effectiveWeek;
        final weekEnd = getWeekEndFromStart(effectiveWeek);

        final reviews = widget.provider.reviews;
        final currentWeekReview = reviews.firstWhere(
          (r) => r['weekStartDate'] == weekStart && r['completedAt'] != null,
          orElse: () => {},
        );

        final todayStr = getCurrentWeekStart();

        final isFutureWeek = todayStr.compareTo(weekStart) < 0;
        final isCurrentWeekInProgress = weekStart == getCurrentWeekStart() && todayStr.compareTo(weekEnd) <= 0;

        final filteredReviews = reviews.where((r) => reviewInCycle(r, activeCycle)).toList();

        return Scaffold(
          body: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header with Cycle Selector
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      '📋 Weekly Review',
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                    ),
                    Row(
                      children: [
                        const Text('Cycle: ', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                        DropdownButton<String>(
                          value: activeCycle['id'] as String?,
                          dropdownColor: AppTheme.bgSecondary,
                          underline: const SizedBox(),
                          style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                          items: cycles.map((c) {
                            return DropdownMenuItem<String>(
                              value: c['id'] as String,
                              child: Text(c['name'] as String? ?? 'Cycle'),
                            );
                          }).toList(),
                          onChanged: (val) {
                            if (val != null) {
                              setState(() {
                                _explicitCycleId = val;
                              });
                            }
                          },
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // Week Selector & Start/Status Card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppTheme.bgCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppTheme.borderColor),
                  ),
                  child: Column(
                    children: [
                      // Week Selector Dropdown
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Text('Review for week of: ', style: TextStyle(fontSize: 13, color: AppTheme.textMuted)),
                          DropdownButton<String>(
                            value: mondays.contains(effectiveWeek) ? effectiveWeek : (mondays.isNotEmpty ? mondays.first : null),
                            dropdownColor: AppTheme.bgSecondary,
                            underline: const SizedBox(),
                            style: const TextStyle(fontSize: 13, color: AppTheme.accentCyan, fontWeight: FontWeight.w600),
                            items: mondays.map((m) {
                              final endStr = getWeekEndFromStart(m);
                              return DropdownMenuItem<String>(
                                value: m,
                                child: Text('$m to $endStr'),
                              );
                            }).toList(),
                            onChanged: (val) {
                              if (val != null) {
                                setState(() {
                                  _selectedWeek = val;
                                  _explicitCycleId = null;
                                });
                              }
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      // Status Content
                      if (currentWeekReview.isNotEmpty) ...[
                        const Text('✅', style: TextStyle(fontSize: 36)),
                        const SizedBox(height: 8),
                        const Text('This week\'s review is complete!', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                        const SizedBox(height: 6),
                        Text(
                          'If you need to edit this review, you can do so in the Past Reviews section below.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                      ] else if (isFutureWeek) ...[
                        const Text('📅', style: TextStyle(fontSize: 36)),
                        const SizedBox(height: 8),
                        const Text('Week has not started yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                        const SizedBox(height: 6),
                        Text(
                          'This week (starting $weekStart) is in the future. You can start the weekly review once the week has ended.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                      ] else if (isCurrentWeekInProgress) ...[
                        const Text('⏳', style: TextStyle(fontSize: 36)),
                        const SizedBox(height: 8),
                        const Text('Week is still in progress', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                        const SizedBox(height: 6),
                        Text(
                          'This week (ending $weekEnd) is still ongoing. You can start the weekly review once the week is complete.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                      ] else ...[
                        const Text('📋', style: TextStyle(fontSize: 36)),
                        const SizedBox(height: 8),
                        const Text('Time for your weekly review!', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                        const SizedBox(height: 6),
                        const Text(
                          'Review your progress on each Key Result, assess your confidence, and reflect on the week. This takes about 5 minutes.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () {
                            if (widget.onStartWizard != null) {
                              widget.onStartWizard!();
                            } else {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (context) => ReviewWizardScreen(
                                    weekStart: weekStart,
                                    weekEnd: weekEnd,
                                    cycleId: activeCycle['id'] as String? ?? '',
                                    provider: widget.provider,
                                  ),
                                ),
                              );
                            }
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.accentCyan,
                            foregroundColor: Colors.black,
                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          ),
                          icon: const Text('🚀'),
                          label: const Text('Start Weekly Review', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Progress Chart
                ProgressChartWidget(
                  reviews: filteredReviews,
                  keyResults: widget.provider.keyResults,
                ),
                const SizedBox(height: 20),

                // Past Reviews History
                ReviewHistoryWidget(
                  provider: widget.provider,
                  reviews: filteredReviews,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
