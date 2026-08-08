import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';

// Eisenhower priority order — mirrors desktop's EISENHOWER_PRIORITY_ORDER
// (src/lib/pomodoro-storage.ts). "Apply Priority Order" sorts the task list by
// this rank. ADR-0005: a mobile-adapted full-screen 2×2 matrix with tap-to-assign
// (not drag) and Apply Priority Order, reusing the per-task category as the data.
const List<String> kEisenhowerPriorityOrder = ['do', 'decide', 'delegate', 'delete'];

/// Sort rank for a task category. Unassigned/unknown sorts last. Pure.
int eisenhowerCategoryRank(String? category) {
  final i = kEisenhowerPriorityOrder.indexOf(category ?? '');
  return i < 0 ? kEisenhowerPriorityOrder.length : i;
}

/// Returns [tasks] reordered by Eisenhower priority (do → decide → delegate →
/// delete → unassigned), stable within each category. Pure — unit-testable, and
/// used by Apply Priority Order.
List<Map<String, dynamic>> applyEisenhowerPriorityOrder(
    List<Map<String, dynamic>> tasks) {
  final indexed = tasks.asMap().entries.toList();
  indexed.sort((a, b) {
    final r = eisenhowerCategoryRank(a.value['category'] as String?) -
        eisenhowerCategoryRank(b.value['category'] as String?);
    if (r != 0) return r;
    return a.key.compareTo(b.key); // stable: preserve original order within a category
  });
  return indexed.map((e) => e.value).toList();
}

typedef _Quad = ({String cat, String label, String desc, Color color});

class EisenhowerMatrixScreen extends StatefulWidget {
  final StorageProvider provider;

  const EisenhowerMatrixScreen({super.key, required this.provider});

  @override
  State<EisenhowerMatrixScreen> createState() => _EisenhowerMatrixScreenState();
}

class _EisenhowerMatrixScreenState extends State<EisenhowerMatrixScreen> {
  String? _selectedTaskId;

  // Tasks that aren't completed. category may be absent (→ "Unassigned" tray).
  List<Map<String, dynamic>> get _activeTasks => widget.provider.tasks
      .where((t) => t['completed'] != true && t['isCompleted'] != true)
      .toList();

  // Quadrant meta, laid out as a 2×2: row 0 = Do | Decide, row 1 = Delegate | Delete.
  List<_Quad> get _quadrants => [
        (cat: 'do', label: 'Do', desc: 'Urgent · Important', color: AppTheme.okrOffTrack),
        (cat: 'decide', label: 'Decide', desc: 'Important', color: AppTheme.okrAtRisk),
        (cat: 'delegate', label: 'Delegate', desc: 'Urgent', color: AppTheme.accentCyan),
        (cat: 'delete', label: 'Delete', desc: 'Neither', color: AppTheme.textMuted),
      ];

  void _toggleSelect(String id) {
    setState(() => _selectedTaskId = _selectedTaskId == id ? null : id);
  }

  // Assign the selected task to [category]. Read-modify-write on the task map
  // preserves sibling keys (sync-safe, ADR-0004); categories then travel via the
  // shared doc like any task edit (relies on ticket 03). Clears the selection.
  Future<void> _assignSelectedTo(String category) async {
    final id = _selectedTaskId;
    if (id == null) return;
    final updated = widget.provider.tasks.map((t) {
      if (t['id'] == id) {
        return Map<String, dynamic>.from(t)..['category'] = category;
      }
      return t;
    }).toList();
    try {
      await widget.provider.saveTasks(updated);
      if (mounted) setState(() => _selectedTaskId = null);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    }
  }

  Future<void> _applyPriorityOrder() async {
    try {
      await widget.provider.saveTasks(
          applyEisenhowerPriorityOrder(widget.provider.tasks));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bgPrimary,
      appBar: AppBar(
        title: const Text('Prioritize'),
        actions: [
          TextButton.icon(
            onPressed: _applyPriorityOrder,
            icon: const Icon(Icons.sort, color: Colors.white),
            label: const Text('Apply Order', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.provider,
        builder: (context, _) {
          final active = _activeTasks;
          final selectedTask = active.firstWhere(
            (t) => t['id'] == _selectedTaskId,
            orElse: () => <String, dynamic>{},
          );
          final selectedTitle =
              selectedTask.isNotEmpty ? selectedTask['title'] as String? : null;

          final byCategory = <String, List<Map<String, dynamic>>>{};
          final unassigned = <Map<String, dynamic>>[];
          for (final t in active) {
            final c = t['category'] as String?;
            if (c != null && kEisenhowerPriorityOrder.contains(c)) {
              byCategory.putIfAbsent(c, () => []).add(t);
            } else {
              unassigned.add(t);
            }
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  selectedTitle == null
                      ? 'Tap a task, then tap a quadrant to set its priority.'
                      : 'Tap a quadrant to move "$selectedTitle".',
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 12),
                _matrixRow(byCategory, _quadrants.sublist(0, 2)),
                const SizedBox(height: 12),
                _matrixRow(byCategory, _quadrants.sublist(2, 4)),
                if (unassigned.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _tray('Unassigned', unassigned),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _matrixRow(
      Map<String, List<Map<String, dynamic>>> byCategory, List<_Quad> quads) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final q in quads)
          Expanded(child: _quadrantCard(q, byCategory[q.cat] ?? [])),
      ],
    );
  }

  Widget _quadrantCard(_Quad q, List<Map<String, dynamic>> tasks) {
    final canAssign = _selectedTaskId != null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: InkWell(
        key: Key('quadrant-${q.cat}'),
        onTap: canAssign ? () => _assignSelectedTo(q.cat) : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.bgSecondary,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: canAssign ? q.color : AppTheme.borderColor,
              width: canAssign ? 2 : 1,
            ),
          ),
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration:
                        BoxDecoration(color: q.color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(q.label,
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontWeight: FontWeight.bold,
                            fontSize: 13)),
                  ),
                  Container(
                    key: Key('count-${q.cat}'),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: q.color.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('${tasks.length}',
                        style: TextStyle(
                            color: q.color,
                            fontSize: 11,
                            fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(q.desc,
                  style: const TextStyle(color: AppTheme.textMuted, fontSize: 10)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                runSpacing: 4,
                children: [for (final t in tasks) _taskChip(t, q.color)],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _taskChip(Map<String, dynamic> task, Color color) {
    final id = task['id'] as String?;
    final selected = id == _selectedTaskId;
    return GestureDetector(
      key: id == null ? null : Key('task-$id'),
      onTap: id == null ? null : () => _toggleSelect(id),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 130),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.25) : AppTheme.bgTertiary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: selected ? color : Colors.transparent, width: 1.5),
        ),
        child: Text(
          (task['title'] as String?) ?? '',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 12),
        ),
      ),
    );
  }

  Widget _tray(String label, List<Map<String, dynamic>> tasks) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(label,
                  style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
              const SizedBox(width: 8),
              Text('${tasks.length}',
                  style: const TextStyle(
                      color: AppTheme.textSecondary, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [for (final t in tasks) _taskChip(t, AppTheme.textSecondary)],
          ),
        ],
      ),
    );
  }
}
