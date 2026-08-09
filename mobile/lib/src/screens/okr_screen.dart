import 'dart:math';
import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';

import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/widgets/myokr_card.dart';

class ObjectiveFormSheet extends StatefulWidget {
  final StorageProvider provider;
  final String cycleId;
  final Map<String, dynamic>? initialObjective;

  const ObjectiveFormSheet({
    super.key,
    required this.provider,
    required this.cycleId,
    this.initialObjective,
  });

  @override
  State<ObjectiveFormSheet> createState() => _ObjectiveFormSheetState();
}

class _ObjectiveFormSheetState extends State<ObjectiveFormSheet> {
  late TextEditingController _titleController;
  late TextEditingController _descController;
  late TextEditingController _rewardController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(
        text: widget.initialObjective?['title'] as String? ?? '');
    _descController = TextEditingController(
        text: widget.initialObjective?['description'] as String? ?? '');
    _rewardController = TextEditingController(
        text: widget.initialObjective?['reward'] as String? ?? '');
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _rewardController.dispose();
    super.dispose();
  }

  void _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;

    final obj = Map<String, dynamic>.from(widget.initialObjective ?? {});
    obj['title'] = title;
    obj['cycleId'] = widget.cycleId;

    final desc = _descController.text.trim();
    if (desc.isNotEmpty) {
      obj['description'] = desc;
    } else {
      obj.remove('description');
    }

    final reward = _rewardController.text.trim();
    if (reward.isNotEmpty) {
      obj['reward'] = reward;
    } else {
      obj.remove('reward');
    }

    try {
      await widget.provider.saveObjective(obj);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save objective: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialObjective != null;

    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppTheme.borderColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              isEditing ? 'Edit Objective' : 'New Objective',
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 16),

            TextField(
              key: const Key('obj_title_input'),
              controller: _titleController,
              autofocus: true,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                labelText: 'Objective Title',
                labelStyle: TextStyle(color: AppTheme.textMuted),
                hintText: 'e.g. Ship myOKR v1.0',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),

            TextField(
              key: const Key('obj_desc_input'),
              controller: _descController,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
                labelStyle: TextStyle(color: AppTheme.textMuted),
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),

            TextField(
              key: const Key('obj_reward_input'),
              controller: _rewardController,
              style: const TextStyle(color: AppTheme.textPrimary),
              decoration: const InputDecoration(
                labelText: 'Reward (optional)',
                labelStyle: TextStyle(color: AppTheme.textMuted),
                hintText: 'e.g. Pizza Party',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),

            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentCyan,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: _submit,
              child: const Text('Save Objective',
                  style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }
}

class ObjectiveCardWidget extends StatefulWidget {
  final Map<String, dynamic> objective;
  final StorageProvider provider;
  final List<Map<String, dynamic>> keyResults;

  const ObjectiveCardWidget({
    super.key,
    required this.objective,
    required this.provider,
    required this.keyResults,
  });

  @override
  State<ObjectiveCardWidget> createState() => _ObjectiveCardWidgetState();
}

class _ObjectiveCardWidgetState extends State<ObjectiveCardWidget> {
  bool _isExpanded = true;

  void _showEditSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ObjectiveFormSheet(
        provider: widget.provider,
        cycleId: widget.objective['cycleId'] as String,
        initialObjective: widget.objective,
      ),
    );
  }

  void _showAddKrSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => KeyResultFormSheet(
        provider: widget.provider,
        objectiveId: widget.objective['id'] as String,
      ),
    );
  }

  void _showEditKrSheet(BuildContext context, Map<String, dynamic> kr) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => KeyResultFormSheet(
        provider: widget.provider,
        objectiveId: widget.objective['id'] as String,
        initialKeyResult: kr,
      ),
    );
  }

  void _confirmDelete(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        title: const Text('Delete Objective?',
            style: TextStyle(color: AppTheme.textPrimary)),
        content: Text(
          'Are you sure you want to delete "${widget.objective['title']}" and all its key results? This cannot be undone.',
          style: const TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
            onPressed: () async {
              Navigator.pop(ctx);
              await widget.provider.deleteObjective(widget.objective['id'] as String);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final obj = widget.objective;
    final objId = obj['id'] as String;
    final title = obj['title'] as String? ?? 'Untitled';
    final desc = obj['description'] as String?;
    final reward = obj['reward'] as String?;
    final progress = widget.provider.computeObjectiveProgress(objId);

    return MyOkrCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '🎯 $title',
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    if (desc != null && desc.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        desc,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.textSecondary),
                      ),
                    ],
                    if (reward != null && reward.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.bgTertiary,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppTheme.borderColor),
                        ),
                        child: Text(
                          '🏆 $reward',
                          style: const TextStyle(
                              fontSize: 12, color: AppTheme.accentPurple),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              // Progress percentage & overflow menu
              Row(
                children: [
                  Text(
                    '$progress%',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.accentCyan,
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      _isExpanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      color: AppTheme.textMuted,
                    ),
                    onPressed: () => setState(() => _isExpanded = !_isExpanded),
                  ),
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.more_vert, color: AppTheme.textMuted),
                    color: AppTheme.bgTertiary,
                    onSelected: (val) {
                      if (val == 'edit') _showEditSheet(context);
                      if (val == 'delete') _confirmDelete(context);
                    },
                    itemBuilder: (ctx) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            Icon(Icons.edit, size: 16, color: AppTheme.textPrimary),
                            SizedBox(width: 8),
                            Text('Edit Objective',
                                style: TextStyle(color: AppTheme.textPrimary)),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            Icon(Icons.delete, size: 16, color: AppTheme.okrOffTrack),
                            SizedBox(width: 8),
                            Text('Delete Objective',
                                style: TextStyle(color: AppTheme.okrOffTrack)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),

          const SizedBox(height: 8),
          // Objective Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress / 100.0,
              minHeight: 6,
              backgroundColor: AppTheme.bgTertiary,
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppTheme.accentCyan),
            ),
          ),

          // Key Results list (Collapsible)
          if (_isExpanded) ...[
            const SizedBox(height: 12),
            if (widget.keyResults.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8.0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('No key results yet.',
                        style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    TextButton.icon(
                      icon: const Icon(Icons.add, size: 14),
                      label: const Text('+ Add Key Result'),
                      onPressed: () => _showAddKrSheet(context),
                    ),
                  ],
                ),
              )
            else ...[
              ...widget.keyResults.map((kr) {
                return KeyResultRowWidget(
                  keyResult: kr,
                  provider: widget.provider,
                  onEdit: () => _showEditKrSheet(context, kr),
                );
              }),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.accentCyan,
                  ),
                  icon: const Icon(Icons.add, size: 14),
                  label: const Text('+ Add Key Result'),
                  onPressed: () => _showAddKrSheet(context),
                ),
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class ConfidencePillWidget extends StatelessWidget {
  final String confidence;
  final ValueChanged<String> onSelected;

  const ConfidencePillWidget({
    super.key,
    required this.confidence,
    required this.onSelected,
  });

  void _showConfidenceSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Update Confidence Status',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                ListTile(
                  leading: const Text('🟢', style: TextStyle(fontSize: 18)),
                  title: const Text('On Track', style: TextStyle(color: AppTheme.textPrimary)),
                  trailing: confidence == 'on_track' ? const Icon(Icons.check, color: AppTheme.accentCyan) : null,
                  onTap: () {
                    onSelected('on_track');
                    Navigator.pop(ctx);
                  },
                ),
                ListTile(
                  leading: const Text('🟡', style: TextStyle(fontSize: 18)),
                  title: const Text('At Risk', style: TextStyle(color: AppTheme.textPrimary)),
                  trailing: confidence == 'at_risk' ? const Icon(Icons.check, color: AppTheme.accentCyan) : null,
                  onTap: () {
                    onSelected('at_risk');
                    Navigator.pop(ctx);
                  },
                ),
                ListTile(
                  leading: const Text('🔴', style: TextStyle(fontSize: 18)),
                  title: const Text('Off Track', style: TextStyle(color: AppTheme.textPrimary)),
                  trailing: confidence == 'off_track' ? const Icon(Icons.check, color: AppTheme.accentCyan) : null,
                  onTap: () {
                    onSelected('off_track');
                    Navigator.pop(ctx);
                  },
                ),
                ListTile(
                  leading: const Text('⚪', style: TextStyle(fontSize: 18)),
                  title: const Text('Not Set', style: TextStyle(color: AppTheme.textPrimary)),
                  trailing: confidence == 'not_set' ? const Icon(Icons.check, color: AppTheme.accentCyan) : null,
                  onTap: () {
                    onSelected('not_set');
                    Navigator.pop(ctx);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color borderColor;
    Color textColor;
    String label;

    switch (confidence) {
      case 'on_track':
        bg = AppTheme.okrOnTrack.withOpacity(0.15);
        borderColor = AppTheme.okrOnTrack;
        textColor = AppTheme.okrOnTrack;
        label = '🟢 On Track';
        break;
      case 'at_risk':
        bg = AppTheme.okrAtRisk.withOpacity(0.15);
        borderColor = AppTheme.okrAtRisk;
        textColor = AppTheme.okrAtRisk;
        label = '🟡 At Risk';
        break;
      case 'off_track':
        bg = AppTheme.okrOffTrack.withOpacity(0.15);
        borderColor = AppTheme.okrOffTrack;
        textColor = AppTheme.okrOffTrack;
        label = '🔴 Off Track';
        break;
      default:
        bg = AppTheme.bgTertiary;
        borderColor = AppTheme.borderColor;
        textColor = AppTheme.textMuted;
        label = '⚪ Not Set';
        break;
    }

    return InkWell(
      key: const Key('confidence_pill'),
      onTap: () => _showConfidenceSheet(context),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: borderColor),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor),
        ),
      ),
    );
  }
}

class KeyResultRowWidget extends StatelessWidget {
  final Map<String, dynamic> keyResult;
  final StorageProvider provider;
  final VoidCallback onEdit;

  /// Adjusts a manual KR's currentValue by [delta], reading the LATEST value
  /// from the provider rather than this widget's snapshot — rapid taps before
  /// a rebuild otherwise both compute from the same stale value and the
  /// second tap is dropped (ticket 24).
  void _adjustKRValue(Map<String, dynamic> kr, double delta) {
    final krId = kr['id'] as String?;
    final latest = krId != null
        ? provider.keyResults.firstWhere(
            (k) => k['id'] == krId,
            orElse: () => kr,
          )
        : kr;
    final curr = (latest['currentValue'] as num?)?.toDouble() ?? 0.0;
    final newCurr = max(0.0, curr + delta);
    final updated = Map<String, dynamic>.from(latest);
    updated['currentValue'] = newCurr;
    provider.saveKeyResult(updated);
  }

  const KeyResultRowWidget({
    super.key,
    required this.keyResult,
    required this.provider,
    required this.onEdit,
  });

  static String getModeIcon(String mode) {
    switch (mode) {
      case 'focus_hours': return '⏱️';
      case 'focus_pomodoros': return '🍅';
      case 'completed_tasks': return '☑️';
      case 'habit': return '🔄';
      default: return '✏️';
    }
  }

  static String formatNum(double val) {
    if (val == val.toInt().toDouble()) {
      return val.toInt().toString();
    }
    return val.toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    final kr = keyResult;
    final krId = kr['id'] as String;
    final title = kr['title'] as String? ?? 'Untitled KR';
    final target = (kr['targetValue'] as num?)?.toDouble() ?? 0.0;
    final unit = kr['unit'] as String? ?? '';
    final mode = kr['completionMode'] as String? ?? 'manual';
    final confidence = kr['confidence'] as String? ?? 'not_set';
    final effectiveCurrent = provider.getEffectiveCurrentValue(kr);
    final isManual = mode == 'manual';

    final pct = target > 0 ? (effectiveCurrent / target) : 0.0;

    return Container(
      margin: const EdgeInsets.only(top: 8),
      decoration: BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.borderColor.withOpacity(0.5)),
      ),
      child: InkWell(
        onTap: onEdit,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(getModeIcon(mode), style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ),
                  ConfidencePillWidget(
                    confidence: confidence,
                    onSelected: (newConf) => provider.updateKRConfidence(krId, newConf),
                  ),
                  IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 16, color: AppTheme.textMuted),
                    onPressed: onEdit,
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '${formatNum(effectiveCurrent)} / ${formatNum(target)} ${unit.isNotEmpty ? unit : ''}'.trim(),
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                  if (isManual) ...[
                    Row(
                      children: [
                        InkWell(
                          key: Key('kr_dec_$krId'),
                          borderRadius: BorderRadius.circular(4),
                          onTap: () => _adjustKRValue(kr, -1.0),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.bgTertiary,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: AppTheme.borderColor),
                            ),
                            child: const Text('-', style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                          ),
                        ),
                        const SizedBox(width: 6),
                        InkWell(
                          key: Key('kr_inc_$krId'),
                          borderRadius: BorderRadius.circular(4),
                          onTap: () => _adjustKRValue(kr, 1.0),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.bgTertiary,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: AppTheme.borderColor),
                            ),
                            child: const Text('+', style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: min(1.0, pct),
                  minHeight: 4,
                  backgroundColor: AppTheme.bgTertiary,
                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.accentCyan),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class KeyResultFormSheet extends StatefulWidget {
  final StorageProvider provider;
  final String objectiveId;
  final Map<String, dynamic>? initialKeyResult;

  const KeyResultFormSheet({
    super.key,
    required this.provider,
    required this.objectiveId,
    this.initialKeyResult,
  });

  @override
  State<KeyResultFormSheet> createState() => _KeyResultFormSheetState();
}

class _KeyResultFormSheetState extends State<KeyResultFormSheet> {
  late TextEditingController _titleController;
  late TextEditingController _targetController;
  late TextEditingController _unitController;
  late String _completionMode;
  String? _selectedHabitId;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(
        text: widget.initialKeyResult?['title'] as String? ?? '');
    _targetController = TextEditingController(
        text: (widget.initialKeyResult?['targetValue'] as num?)?.toString() ?? '0');
    _unitController = TextEditingController(
        text: widget.initialKeyResult?['unit'] as String? ?? '');
    _completionMode = widget.initialKeyResult?['completionMode'] as String? ?? 'manual';
    _selectedHabitId = widget.initialKeyResult?['habitId'] as String?;
  }

  @override
  void dispose() {
    _titleController.dispose();
    _targetController.dispose();
    _unitController.dispose();
    super.dispose();
  }

  void _submit() async {
    final title = _titleController.text.trim();
    if (title.isEmpty) return;

    final targetVal = double.tryParse(_targetController.text.trim()) ?? 0.0;

    final kr = Map<String, dynamic>.from(widget.initialKeyResult ?? {});
    kr['title'] = title;
    kr['objectiveId'] = widget.objectiveId;
    kr['targetValue'] = targetVal;
    kr['unit'] = _unitController.text.trim();
    kr['completionMode'] = _completionMode;

    if (_completionMode == 'habit' && _selectedHabitId != null) {
      kr['habitId'] = _selectedHabitId;
    } else {
      kr.remove('habitId');
    }

    if (widget.initialKeyResult == null) {
      kr['currentValue'] = 0.0;
      kr['confidence'] = 'not_set';
    }

    await widget.provider.saveKeyResult(kr);
    if (mounted) Navigator.pop(context);
  }

  void _delete() async {
    final krId = widget.initialKeyResult?['id'] as String?;
    if (krId == null) return;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgSecondary,
        title: const Text('Delete Key Result?',
            style: TextStyle(color: AppTheme.textPrimary)),
        content: Text(
          'Are you sure you want to delete "${widget.initialKeyResult?['title'] ?? 'this Key Result'}"? This cannot be undone.',
          style: const TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
            onPressed: () async {
              Navigator.pop(ctx);
              await widget.provider.deleteKeyResult(krId);
              if (mounted) Navigator.pop(context);
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }


  @override
  Widget build(BuildContext context) {
    final isEditing = widget.initialKeyResult != null;
    final krId = widget.initialKeyResult?['id'] as String?;

    final linkedTasks = krId != null
        ? widget.provider.tasks.where((t) => t['keyResultId'] == krId).toList()
        : <Map<String, dynamic>>[];

    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: AppTheme.borderColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    isEditing ? 'Edit Key Result' : 'New Key Result',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  if (isEditing)
                    IconButton(
                      icon: const Icon(Icons.delete_outline, color: AppTheme.okrOffTrack),
                      onPressed: _delete,
                    ),
                ],
              ),
              const SizedBox(height: 16),

              TextField(
                key: const Key('kr_title_input'),
                controller: _titleController,
                autofocus: !isEditing,
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: const InputDecoration(
                  labelText: 'Key Result Title',
                  labelStyle: TextStyle(color: AppTheme.textMuted),
                  hintText: 'e.g. Complete 20 pomodoros',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('kr_target_input'),
                      controller: _targetController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      style: const TextStyle(color: AppTheme.textPrimary),
                      decoration: const InputDecoration(
                        labelText: 'Target Value',
                        labelStyle: TextStyle(color: AppTheme.textMuted),
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      key: const Key('kr_unit_input'),
                      controller: _unitController,
                      style: const TextStyle(color: AppTheme.textPrimary),
                      decoration: const InputDecoration(
                        labelText: 'Unit (optional)',
                        labelStyle: TextStyle(color: AppTheme.textMuted),
                        hintText: 'tasks, hrs, etc.',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              DropdownButtonFormField<String>(
                key: const Key('kr_mode_dropdown'),
                value: _completionMode,
                dropdownColor: AppTheme.bgTertiary,
                decoration: const InputDecoration(
                  labelText: 'Completion Mode',
                  labelStyle: TextStyle(color: AppTheme.textMuted),
                  border: OutlineInputBorder(),
                ),
                style: const TextStyle(color: AppTheme.textPrimary),
                items: const [
                  DropdownMenuItem(value: 'manual', child: Text('✏️ Manual')),
                  DropdownMenuItem(value: 'focus_hours', child: Text('⏱️ Focus Hours')),
                  DropdownMenuItem(value: 'focus_pomodoros', child: Text('🍅 Focus Pomodoros')),
                  DropdownMenuItem(value: 'completed_tasks', child: Text('☑️ Completed Tasks')),
                  DropdownMenuItem(value: 'habit', child: Text('🔄 Habit Ticks')),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _completionMode = val);
                  }
                },
              ),

              if (_completionMode == 'habit') ...[
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  key: const Key('kr_habit_dropdown'),
                  value: _selectedHabitId,
                  dropdownColor: AppTheme.bgTertiary,
                  decoration: const InputDecoration(
                    labelText: 'Link Habit',
                    labelStyle: TextStyle(color: AppTheme.textMuted),
                    border: OutlineInputBorder(),
                  ),
                  style: const TextStyle(color: AppTheme.textPrimary),
                  items: widget.provider.habits.map((h) {
                    return DropdownMenuItem<String>(
                      value: h['id'] as String,
                      child: Text(h['name'] as String? ?? 'Habit'),
                    );
                  }).toList(),
                  onChanged: (val) => setState(() => _selectedHabitId = val),
                ),
              ],

              if (linkedTasks.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text(
                  'Linked Pomodoro Tasks',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                ...linkedTasks.map((t) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Icon(
                          t['isCompleted'] == true ? Icons.check_circle : Icons.circle_outlined,
                          size: 16,
                          color: t['isCompleted'] == true ? AppTheme.accentCyan : AppTheme.textMuted,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            t['title'] as String? ?? 'Task',
                            style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
                          ),
                        ),
                        Text(
                          '${t['completedPomodoros']} pomos',
                          style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  );
                }),
              ],

              const SizedBox(height: 16),

              ElevatedButton(
                key: const Key('save_kr_btn'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.accentCyan,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: _submit,
                child: const Text('Save Key Result',
                    style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class OkrScreen extends StatelessWidget {
  final StorageProvider provider;

  const OkrScreen({super.key, required this.provider});

  void _showCreateObjectiveSheet(BuildContext context, String cycleId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ObjectiveFormSheet(
        provider: provider,
        cycleId: cycleId,
      ),
    );
  }

  void _showCycleManagementSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.bgSecondary,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return ListenableBuilder(
          listenable: provider,
          builder: (ctx, _) {
            final active = provider.activeCycle;
            final activeId = active?['id'];
            final canClone = active != null &&
                provider.objectives.any((o) => o['cycleId'] == activeId);
            final deletableIds = provider.deletableCycleIds;

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppTheme.borderColor,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    const Text(
                      'Cycle Management',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Flexible(
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: provider.cycles.length,
                        itemBuilder: (ctx, index) {
                          final c = provider.cycles[index];
                          final cId = c['id'] as String;
                          final isSelected = cId == activeId;
                          final isDeletable = deletableIds.contains(cId);

                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              c['name'] as String? ?? 'Cycle',
                              style: TextStyle(
                                fontWeight:
                                    isSelected ? FontWeight.bold : FontWeight.normal,
                                color: isSelected
                                    ? AppTheme.accentCyan
                                    : AppTheme.textPrimary,
                              ),
                            ),
                            leading: Icon(
                              isSelected
                                  ? Icons.radio_button_checked
                                  : Icons.radio_button_unchecked,
                              color: isSelected
                                  ? AppTheme.accentCyan
                                  : AppTheme.textMuted,
                            ),
                            trailing: isDeletable
                                ? IconButton(
                                    icon: const Icon(Icons.delete_outline,
                                        color: AppTheme.okrOffTrack),
                                    onPressed: () async {
                                      await provider.deleteCycle(cId);
                                    },
                                  )
                                : null,
                            onTap: () {
                              provider.selectCycle(cId);
                              Navigator.pop(ctx);
                            },
                          );
                        },
                      ),
                    ),
                    const Divider(color: AppTheme.borderColor),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              foregroundColor: AppTheme.textPrimary,
                              side: const BorderSide(color: AppTheme.borderColor),
                            ),
                            icon: const Icon(Icons.add_circle_outline, size: 18),
                            label: const Text('+ Add Next Month'),
                            onPressed: () async {
                              await provider.createNextCycle();
                              if (ctx.mounted) Navigator.pop(ctx);
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.accentCyan,
                              foregroundColor: Colors.white,
                            ),
                            icon: const Icon(Icons.copy, size: 18),
                            label: const Text('📋 Clone Current Cycle'),
                            onPressed: canClone
                                ? () async {
                                    await provider.cloneActiveCycle();
                                    if (ctx.mounted) Navigator.pop(ctx);
                                  }
                                : null,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: provider,
      builder: (context, _) {
        if (provider.isLoading) {
          return const Center(child: CircularProgressIndicator());
        }

        final activeCycle = provider.activeCycle;
        if (activeCycle == null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('No cycles created yet.'),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () => provider.createNextCycle(),
                  child: const Text('Create First Cycle'),
                ),
              ],
            ),
          );
        }

        final cycleId = activeCycle['id'] as String;
        final currentObjs =
            provider.objectives.where((o) => o['cycleId'] == cycleId).toList();
        final overallProgress = provider.computeOverallProgress(cycleId);

        return Scaffold(
          backgroundColor: AppTheme.bgPrimary,
          body: Column(
            children: [
              // Cycle Header with Selector Pill & Overall Progress Bar
              Container(
                color: AppTheme.bgSecondary,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => _showCycleManagementSheet(context),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppTheme.bgTertiary,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppTheme.borderColor),
                        ),
                        child: Text(
                          '${activeCycle['name'] as String? ?? 'Select Cycle'} ▾',
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Overall',
                                style: TextStyle(
                                    fontSize: 12, color: AppTheme.textMuted),
                              ),
                              Text(
                                '$overallProgress%',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.accentCyan,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: overallProgress / 100.0,
                              minHeight: 6,
                              backgroundColor: AppTheme.bgTertiary,
                              valueColor: const AlwaysStoppedAnimation<Color>(
                                  AppTheme.accentCyan),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const Divider(height: 1, color: AppTheme.borderColor),

              // Objectives List
              Expanded(
                child: currentObjs.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Text('🎯', style: TextStyle(fontSize: 40)),
                            const SizedBox(height: 8),
                            const Text('No objectives for this cycle yet',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: AppTheme.textPrimary)),
                            const SizedBox(height: 4),
                            const Text('Add objectives to start tracking goals',
                                style: TextStyle(color: AppTheme.textMuted)),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('+ Add Objective'),
                              onPressed: () =>
                                  _showCreateObjectiveSheet(context, cycleId),
                            ),
                          ],
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: currentObjs.length + 1,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 16),
                        itemBuilder: (context, index) {
                          if (index == currentObjs.length) {
                            return Center(
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppTheme.accentCyan,
                                  side: const BorderSide(color: AppTheme.accentCyan),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 20, vertical: 12),
                                ),
                                icon: const Icon(Icons.add, size: 18),
                                label: const Text('+ Add Objective'),
                                onPressed: () =>
                                    _showCreateObjectiveSheet(context, cycleId),
                              ),
                            );
                          }
                          final obj = currentObjs[index];
                          final objKrs = provider.keyResults
                              .where((kr) => kr['objectiveId'] == obj['id'])
                              .toList();

                          return ObjectiveCardWidget(
                            objective: obj,
                            provider: provider,
                            keyResults: objKrs,
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

