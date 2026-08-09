import 'dart:async';

import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';

class TaskDetailsSheet extends StatefulWidget {
  final Map<String, dynamic> task;
  final StorageProvider provider;

  const TaskDetailsSheet({
    super.key,
    required this.task,
    required this.provider,
  });

  @override
  State<TaskDetailsSheet> createState() => _TaskDetailsSheetState();
}

class _TaskDetailsSheetState extends State<TaskDetailsSheet> {
  late TextEditingController _titleController;
  late TextEditingController _descController;
  late TextEditingController _todoController;
  late TextEditingController _commentController;

  bool _isEditingDesc = false;
  late String _category;
  String? _keyResultId;

  // Title keystrokes are debounced — saving the whole task list per keypress
  // was a full persistence per character (ticket 15).
  Timer? _titleSaveDebounce;
  bool _titleDirty = false;

  late List<Map<String, dynamic>> _todos;
  late List<Map<String, dynamic>> _comments;

  late int _estimatedPomodoros;
  late int _completedPomodoros;
  late int _weeklyPomodoroPlan;
  bool _editingWeeklyPlan = false;
  bool _weeklyPlanEdited = false;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.task['title'] ?? '');
    _descController = TextEditingController(text: widget.task['description'] ?? '');
    _todoController = TextEditingController();
    _commentController = TextEditingController();

    _category = widget.task['category'] ?? 'do';
    _keyResultId = widget.task['keyResultId'];
    _estimatedPomodoros = widget.task['estimatedPomodoros'] as int? ?? 1;
    _completedPomodoros = widget.task['completedPomodoros'] as int? ?? 0;
    // as num → toInt: the normalizer preserves non-integer finite values, and
    // a direct `as int?` would throw on a fractional plan from foreign data.
    _weeklyPomodoroPlan =
        (widget.task['weeklyPomodoroPlan'] as num?)?.toInt() ?? _estimatedPomodoros;

    _todos = List<Map<String, dynamic>>.from(
      (widget.task['todos'] as List?)?.map((item) => Map<String, dynamic>.from(item)) ?? [],
    );
    _comments = List<Map<String, dynamic>>.from(
      (widget.task['comments'] as List?)?.map((item) => Map<String, dynamic>.from(item)) ?? [],
    );
  }

  @override
  void dispose() {
    _titleSaveDebounce?.cancel();
    // Flush a pending title edit: closing within the debounce window must
    // not lose the last keystrokes.
    if (_titleDirty) {
      _saveTask();
    }
    _titleController.dispose();
    _descController.dispose();
    _todoController.dispose();
    _commentController.dispose();
    super.dispose();
  }

  void _onTitleChanged(String _) {
    _titleDirty = true;
    _titleSaveDebounce?.cancel();
    _titleSaveDebounce = Timer(const Duration(milliseconds: 500), () {
      if (!mounted) return;
      _titleDirty = false;
      _saveTask();
    });
  }

  /// Readout denominator: the edited plan once the user touched it, otherwise
  /// the stored plan (never the stale pre-edit map), else the estimate.
  int get _displayWeeklyPlan =>
      _weeklyPlanEdited ? _weeklyPomodoroPlan : (widget.task['weeklyPomodoroPlan'] as num?)?.toInt() ?? _estimatedPomodoros;

  /// Completed focus sessions for this task within the current week
  /// (Monday start), read from the provider's daily history records.
  int get _completedThisWeek {
    final now = DateTime.now();
    final monday = DateTime(now.year, now.month, now.day).subtract(Duration(days: now.weekday - 1));
    final sunday = monday.add(const Duration(days: 6));
    String fmt(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final start = fmt(monday);
    final end = fmt(sunday);

    var count = 0;
    for (final day in widget.provider.history) {
      final date = day['date'] as String? ?? '';
      if (date.compareTo(start) < 0 || date.compareTo(end) > 0) continue;
      for (final s in (day['sessions'] as List?) ?? const []) {
        if (s is Map && s['type'] == 'focus' && s['completed'] == true && s['taskId'] == widget.task['id']) {
          count++;
        }
      }
    }
    return count;
  }

  void _saveTask() {
    final updatedTask = Map<String, dynamic>.from(widget.task);
    updatedTask['title'] = _titleController.text.trim();
    updatedTask['description'] = _descController.text.trim().isEmpty ? null : _descController.text.trim();
    updatedTask['category'] = _category;
    updatedTask['keyResultId'] = _keyResultId;
    updatedTask['estimatedPomodoros'] = _estimatedPomodoros;
    updatedTask['completedPomodoros'] = _completedPomodoros;
    // Only write the weekly plan when the user actually edited it — absent
    // stays absent (normalizer semantics; never inject the estimate).
    if (_weeklyPlanEdited) {
      updatedTask['weeklyPomodoroPlan'] = _weeklyPomodoroPlan;
    }
    updatedTask['todos'] = _todos;
    updatedTask['comments'] = _comments;
    // Parity with desktop (PomodoroTask.updatedAt): stamp on save so the
    // Task-detail footer's "updated X ago" stays correct across Dropbox sync.
    // Mobile doesn't display the field, but the data must agree. The normalizer
    // preserves unknown keys, so legacy tasks without it stay absent until edited.
    updatedTask['updatedAt'] = DateTime.now().toIso8601String();

    final updatedTasks = widget.provider.tasks.map((t) {
      return t['id'] == widget.task['id'] ? updatedTask : t;
    }).toList();

    // Fire-and-forget (debounce + dispose callers can't await); a failing
    // save must not escape as an unhandled async error (ticket 23).
    unawaited(
      widget.provider.saveTasks(updatedTasks).catchError((Object e) {
        debugPrint('task save failed: $e');
      }),
    );
  }

  void _addTodo() {
    final text = _todoController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _todos.add({
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'text': text,
        'completed': false,
        'createdAt': DateTime.now().toIso8601String(),
      });
      _todoController.clear();
    });
    _saveTask();
  }

  void _toggleTodo(int index, bool completed) {
    setState(() {
      _todos[index]['completed'] = completed;
    });
    _saveTask();
  }

  void _deleteTodo(int index) {
    setState(() {
      _todos.removeAt(index);
    });
    _saveTask();
  }

  void _reorderTodos(int oldIndex, int newIndex) {
    setState(() {
      if (oldIndex < newIndex) {
        newIndex -= 1;
      }
      final item = _todos.removeAt(oldIndex);
      _todos.insert(newIndex, item);
    });
    _saveTask();
  }

  void _addComment() {
    final text = _commentController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _comments.insert(0, {
        'id': DateTime.now().millisecondsSinceEpoch.toString(),
        'text': text,
        'createdAt': DateTime.now().toIso8601String(),
      });
      _commentController.clear();
    });
    _saveTask();
  }

  void _deleteComment(int index) {
    setState(() {
      _comments.removeAt(index);
    });
    _saveTask();
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
        return AppTheme.okrOffTrack; // Red-ish
      case 'decide':
        return AppTheme.okrAtRisk; // Yellow-ish
      case 'delegate':
        return AppTheme.accentCyan; // Cyan
      case 'delete':
        return AppTheme.textMuted; // Muted Grey
      default:
        return AppTheme.okrOffTrack;
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeCycle = widget.provider.activeCycle;
    final cycleKrs = activeCycle != null
        ? widget.provider.keyResults.where((kr) {
            final obj = widget.provider.objectives.firstWhere(
              (o) => o['id'] == kr['objectiveId'],
              orElse: () => <String, dynamic>{},
            );
            return obj['cycleId'] == activeCycle['id'];
          }).toList()
        : <Map<String, dynamic>>[];

    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Pull bar / Close Header
              Center(
                child: Container(
                  width: 40,
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
                  Expanded(
                    child: TextField(
                      controller: _titleController,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary,
                      ),
                      decoration: const InputDecoration(
                        border: InputBorder.none,
                        hintText: 'Task Title',
                        hintStyle: TextStyle(color: AppTheme.textMuted),
                      ),
                      onChanged: _onTitleChanged,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const Divider(color: AppTheme.borderColor),
              const SizedBox(height: 8),

              // Scrollable content
              Flexible(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Category and KR row
                      Wrap(
                        spacing: 12,
                        runSpacing: 8,
                        alignment: WrapAlignment.start,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          // Category Selector Dropdown
                          DropdownButtonHideUnderline(
                            child: DropdownButton<String>(
                              value: _category,
                              dropdownColor: AppTheme.bgTertiary,
                              icon: const Icon(Icons.arrow_drop_down, color: AppTheme.textSecondary),
                              style: TextStyle(color: _getCategoryColor(_category), fontWeight: FontWeight.bold),
                              onChanged: (val) {
                                if (val != null) {
                                  setState(() {
                                    _category = val;
                                  });
                                  _saveTask();
                                }
                              },
                              items: ['do', 'decide', 'delegate', 'delete'].map((cat) {
                                return DropdownMenuItem<String>(
                                  value: cat,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        width: 8,
                                        height: 8,
                                        decoration: BoxDecoration(
                                          color: _getCategoryColor(cat),
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        _getCategoryLabel(cat),
                                        style: TextStyle(color: _getCategoryColor(cat)),
                                      ),
                                    ],
                                  ),
                                );
                              }).toList(),
                            ),
                          ),

                          // Key Result Dropdown
                          if (cycleKrs.isNotEmpty)
                            DropdownButtonHideUnderline(
                              child: DropdownButton<String?>(
                                value: _keyResultId,
                                hint: const Text('🎯 Link to KR', style: TextStyle(color: AppTheme.textSecondary)),
                                dropdownColor: AppTheme.bgTertiary,
                                icon: const Icon(Icons.arrow_drop_down, color: AppTheme.textSecondary),
                                style: const TextStyle(color: AppTheme.accentCyan),
                                onChanged: (val) {
                                  setState(() {
                                    _keyResultId = val;
                                  });
                                  _saveTask();
                                },
                                items: [
                                  const DropdownMenuItem<String?>(
                                    value: null,
                                    child: Text('No Key Result', style: TextStyle(color: AppTheme.textSecondary)),
                                  ),
                                  ...cycleKrs.map((kr) {
                                    return DropdownMenuItem<String?>(
                                      value: kr['id'] as String,
                                      child: SizedBox(
                                        width: 180,
                                        child: Text(
                                          kr['title'] as String? ?? 'Untitled KR',
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(color: AppTheme.textPrimary),
                                        ),
                                      ),
                                    );
                                  }),
                                ],
                              ),
                            ),
                          
                          // Pomodoros Estimator Row
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text('🍅 ', style: TextStyle(fontSize: 16)),
                              IconButton(
                                icon: const Icon(Icons.remove_circle_outline, color: AppTheme.textSecondary),
                                onPressed: _estimatedPomodoros > 1
                                    ? () {
                                        setState(() => _estimatedPomodoros--);
                                        _saveTask();
                                      }
                                    : null,
                              ),
                              Text(
                                '$_completedPomodoros/$_estimatedPomodoros',
                                style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                              ),
                              IconButton(
                                icon: const Icon(Icons.add_circle_outline, color: AppTheme.accentCyan),
                                onPressed: _estimatedPomodoros < 20
                                    ? () {
                                        setState(() => _estimatedPomodoros++);
                                        _saveTask();
                                      }
                                    : null,
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // POMODOROS THIS WEEK (P4 mirror) — completed this week /
                      // planned; "Change weekly plan" edits the weekly target.
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'POMODOROS THIS WEEK',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                          ),
                          if (_editingWeeklyPlan)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.remove_circle_outline, color: AppTheme.textSecondary),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: _weeklyPomodoroPlan > 0
                                      ? () => setState(() {
                                            _weeklyPomodoroPlan--;
                                            _weeklyPlanEdited = true;
                                            _saveTask();
                                          })
                                      : null,
                                ),
                                Text(
                                  '$_weeklyPomodoroPlan',
                                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.add_circle_outline, color: AppTheme.accentCyan),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: _weeklyPomodoroPlan < 99
                                      ? () => setState(() {
                                            _weeklyPomodoroPlan++;
                                            _weeklyPlanEdited = true;
                                            _saveTask();
                                          })
                                      : null,
                                ),
                                IconButton(
                                  icon: const Icon(Icons.check, color: AppTheme.accentCyan),
                                  visualDensity: VisualDensity.compact,
                                  onPressed: () => setState(() => _editingWeeklyPlan = false),
                                ),
                              ],
                            )
                          else
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  '$_completedThisWeek / $_displayWeeklyPlan planned',
                                  style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600),
                                ),
                                TextButton(
                                  onPressed: () {
                                    setState(() {
                                      _weeklyPomodoroPlan = widget.task['weeklyPomodoroPlan'] as int? ??
                                          _estimatedPomodoros;
                                      _editingWeeklyPlan = true;
                                    });
                                  },
                                  child: const Text('Change weekly plan', style: TextStyle(color: AppTheme.accentCyan)),
                                ),
                              ],
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),

                      // Description Section
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Description',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                          ),
                          TextButton(
                            onPressed: () {
                              setState(() {
                                if (_isEditingDesc) {
                                  _saveTask();
                                }
                                _isEditingDesc = !_isEditingDesc;
                              });
                            },
                            child: Text(
                              _isEditingDesc ? 'Save' : 'Edit',
                              style: const TextStyle(color: AppTheme.accentCyan),
                            ),
                          ),
                        ],
                      ),
                      if (_isEditingDesc)
                        TextField(
                          controller: _descController,
                          maxLines: 4,
                          style: const TextStyle(color: AppTheme.textPrimary),
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(
                              borderSide: BorderSide(color: AppTheme.borderColor),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderSide: BorderSide(color: AppTheme.accentCyan),
                            ),
                            hintText: 'Add a detailed description...',
                            hintStyle: TextStyle(color: AppTheme.textMuted),
                          ),
                        )
                      else
                        Text(
                          _descController.text.trim().isEmpty
                              ? 'No description added.'
                              : _descController.text,
                          style: TextStyle(
                            color: _descController.text.trim().isEmpty ? AppTheme.textMuted : AppTheme.textPrimary,
                            height: 1.4,
                          ),
                        ),
                      const SizedBox(height: 24),

                      // Subtasks Section
                      const Text(
                        'Subtasks',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      // Add subtask input
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _todoController,
                              style: const TextStyle(color: AppTheme.textPrimary),
                              decoration: const InputDecoration(
                                hintText: 'Add a subtask...',
                                hintStyle: TextStyle(color: AppTheme.textMuted),
                                isDense: true,
                              ),
                              onSubmitted: (_) => _addTodo(),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.add_circle, color: AppTheme.accentCyan),
                            onPressed: _addTodo,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      // Reorderable list of subtasks
                      if (_todos.isNotEmpty)
                        ReorderableListView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: _todos.length,
                          onReorder: _reorderTodos,
                          itemBuilder: (context, index) {
                            final todo = _todos[index];
                            final isCompleted = todo['completed'] == true;
                            return ListTile(
                              key: ValueKey(todo['id']),
                              contentPadding: EdgeInsets.zero,
                              leading: Checkbox(
                                value: isCompleted,
                                activeColor: AppTheme.accentCyan,
                                onChanged: (val) {
                                  if (val != null) {
                                    _toggleTodo(index, val);
                                  }
                                },
                              ),
                              title: Text(
                                todo['text'] ?? '',
                                style: TextStyle(
                                  color: isCompleted ? AppTheme.textSecondary : AppTheme.textPrimary,
                                  decoration: isCompleted ? TextDecoration.lineThrough : null,
                                ),
                              ),
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.delete, size: 20, color: AppTheme.textSecondary),
                                    onPressed: () => _deleteTodo(index),
                                  ),
                                  const Icon(Icons.drag_handle, color: AppTheme.textMuted),
                                ],
                              ),
                            );
                          },
                        ),
                      const SizedBox(height: 24),

                      // Comments Section
                      const Text(
                        'Comments',
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: AppTheme.textSecondary),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: _commentController,
                              style: const TextStyle(color: AppTheme.textPrimary),
                              decoration: const InputDecoration(
                                hintText: 'Add a comment...',
                                hintStyle: TextStyle(color: AppTheme.textMuted),
                                isDense: true,
                              ),
                              onSubmitted: (_) => _addComment(),
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.send, color: AppTheme.accentCyan),
                            onPressed: _addComment,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      ListView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _comments.length,
                        itemBuilder: (context, index) {
                          final comment = _comments[index];
                          final created = DateTime.tryParse(comment['createdAt'] ?? '')?.toLocal();
                          final timeStr = created != null
                              ? '${created.hour.toString().padLeft(2, '0')}:${created.minute.toString().padLeft(2, '0')}'
                              : '';
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6.0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Text(
                                        comment['text'] ?? '',
                                        style: const TextStyle(color: AppTheme.textPrimary),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline, size: 18, color: AppTheme.textMuted),
                                      onPressed: () => _deleteComment(index),
                                    ),
                                  ],
                                ),
                                if (timeStr.isNotEmpty)
                                  Text(
                                    timeStr,
                                    style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                                  ),
                                const Divider(color: AppTheme.borderColor, height: 12),
                              ],
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
