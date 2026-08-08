import 'dart:async';
import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/widgets/timer_ring.dart';
import 'package:myokr_mobile/src/theme.dart';
import 'package:myokr_mobile/src/widgets/task_details_sheet.dart';
import 'package:myokr_mobile/src/widgets/settings_sheet.dart';
import 'package:myokr_mobile/src/services/background_timer_manager.dart';
import 'package:myokr_mobile/src/widgets/analytics_view.dart';

class TimerScreen extends StatefulWidget {
  final StorageProvider provider;

  const TimerScreen({super.key, required this.provider});

  @override
  State<TimerScreen> createState() => _TimerScreenState();
}

class _TimerScreenState extends State<TimerScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int _timeLeft = 25 * 60;
  bool _isRunning = false;
  String _sessionType = 'focus'; // 'focus', 'shortBreak', 'longBreak'
  int _completedPomos = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _resetToCurrentSession();
    // Re-evaluate focus music when settings change (e.g. the Focus Music toggle
    // flipped mid-session). The timer owns the session state, so it must drive
    // the re-sync on provider notifications — not just on transitions. ADR-0005.
    widget.provider.addListener(_syncFocusMusic);
  }

  @override
  void dispose() {
    widget.provider.removeListener(_syncFocusMusic);
    _tabController.dispose();
    _taskController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  void _resetToCurrentSession() {
    final settings = widget.provider.settings;
    if (_sessionType == 'focus') {
      _timeLeft = (settings['focusDuration'] as int? ?? 25) * 60;
    } else if (_sessionType == 'shortBreak') {
      _timeLeft = (settings['shortBreakDuration'] as int? ?? 5) * 60;
    } else {
      _timeLeft = (settings['longBreakDuration'] as int? ?? 15) * 60;
    }
  }

  // Drive the focus-music controller to match the current session state. Called
  // after every transition (toggle/complete/switch) AND on provider notifications
  // (so a mid-session Focus Music toggle takes effect immediately); the
  // controller is idempotent so this is safe to repeat. No-op when no controller
  // is attached (tests).
  void _syncFocusMusic() {
    final controller = widget.provider.focusMusic;
    if (controller == null) return;
    final enabled = widget.provider.settings['focusMusicEnabled'] as bool? ?? false;
    // Fire-and-forget: audio must never throw into the timer. Swallow player
    // errors (missing asset / session conflict) so a focus session isn't
    // disrupted; the controller stays idempotent and retries on the next sync.
    unawaited(
      controller
          .sync(sessionType: _sessionType, isRunning: _isRunning, enabled: enabled)
          .catchError((Object _) {}),
    );
  }

  void _toggleTimer() {
    final activeTaskId = widget.provider.activeTaskId;
    final activeTask = activeTaskId != null
        ? widget.provider.tasks.firstWhere(
            (t) => t['id'] == activeTaskId,
            orElse: () => <String, dynamic>{},
          )
        : null;
    final activeTaskTitle = (activeTask != null && activeTask.isNotEmpty)
        ? activeTask['title'] as String
        : 'No active task';

    if (_isRunning) {
      _timer?.cancel();
      BackgroundTimerManager.stopTimer();
      setState(() {
        _isRunning = false;
      });
    } else {
      _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
        setState(() {
          if (_timeLeft > 0) {
            _timeLeft--;
            BackgroundTimerManager.startOrUpdateTimer(
              sessionType: _sessionType,
              taskName: activeTaskTitle,
              remainingSeconds: _timeLeft,
            );
          } else {
            _handleSessionComplete();
          }
        });
      });
      setState(() {
        _isRunning = true;
      });
      BackgroundTimerManager.startOrUpdateTimer(
        sessionType: _sessionType,
        taskName: activeTaskTitle,
        remainingSeconds: _timeLeft,
      );
    }
    _syncFocusMusic();
  }

  void _handleSessionComplete() {
    _timer?.cancel();
    _isRunning = false;
    BackgroundTimerManager.stopTimer();
    final settings = widget.provider.settings;

    if (_sessionType == 'focus') {
      _completedPomos++;
      final pomosBeforeLong = settings['pomosBeforeLongBreak'] as int? ?? 4;
      final isLongBreak = _completedPomos % pomosBeforeLong == 0;
      
      // Update active task focus counts
      final activeId = widget.provider.activeTaskId;
      if (activeId != null) {
        final updatedTasks = widget.provider.tasks.map((t) {
          if (t['id'] == activeId) {
            final updated = Map<String, dynamic>.from(t);
            updated['completedPomodoros'] = (updated['completedPomodoros'] as int? ?? 0) + 1;
            return updated;
          }
          return t;
        }).toList();
        widget.provider.saveTasks(updatedTasks);
      }

      _sessionType = isLongBreak ? 'longBreak' : 'shortBreak';
    } else {
      _sessionType = 'focus';
    }

    _resetToCurrentSession();
    _syncFocusMusic();
  }

  void _switchSession(String type) {
    _timer?.cancel();
    BackgroundTimerManager.stopTimer();
    setState(() {
      _isRunning = false;
      _sessionType = type;
      _resetToCurrentSession();
    });
    _syncFocusMusic();
  }

  int _getCompletedTodosCount(List todos) {
    return todos.where((t) => t['completed'] == true).length;
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
        return Column(
          children: [
            TabBar(
              controller: _tabController,
              labelColor: AppTheme.accentCyan,
              unselectedLabelColor: AppTheme.textSecondary,
              indicatorColor: AppTheme.accentCyan,
              tabs: const [
                Tab(text: 'Timer', icon: Icon(Icons.timer)),
                Tab(text: 'Tasks', icon: Icon(Icons.check_circle_outline)),
                Tab(text: 'Analytics', icon: Icon(Icons.bar_chart)),
              ],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  _buildTimerTab(),
                  _buildTasksTab(),
                  _buildAnalyticsTab(),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTimerTab() {
    final settings = widget.provider.settings;
    
    int totalSeconds = 25 * 60;
    if (_sessionType == 'focus') totalSeconds = (settings['focusDuration'] as int? ?? 25) * 60;
    if (_sessionType == 'shortBreak') totalSeconds = (settings['shortBreakDuration'] as int? ?? 5) * 60;
    if (_sessionType == 'longBreak') totalSeconds = (settings['longBreakDuration'] as int? ?? 15) * 60;

    final progress = totalSeconds > 0 ? (totalSeconds - _timeLeft) / totalSeconds : 0.0;
    final minutes = _timeLeft ~/ 60;
    final seconds = _timeLeft % 60;
    final timeStr = '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    
    final label = _sessionType == 'focus' ? 'Focus' 
                : _sessionType == 'shortBreak' ? 'Short Break' 
                : 'Long Break';

    final activeTaskId = widget.provider.activeTaskId;
    final activeTask = activeTaskId != null
        ? widget.provider.tasks.firstWhere(
            (t) => t['id'] == activeTaskId,
            orElse: () => <String, dynamic>{},
          )
        : null;

    final activeTaskTitle = (activeTask != null && activeTask.isNotEmpty)
        ? activeTask['title'] as String
        : 'No task active';

    return Center(
      child: SingleChildScrollView(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Row(
                children: [
                  const SizedBox(width: 48), // balance settings icon
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          TextButton(
                            style: TextButton.styleFrom(
                              minimumSize: Size.zero,
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            ),
                            onPressed: () => _switchSession('focus'),
                            child: Text('Focus', style: TextStyle(color: _sessionType == 'focus' ? AppTheme.accentCyan : AppTheme.textSecondary, fontWeight: _sessionType == 'focus' ? FontWeight.bold : FontWeight.normal)),
                          ),
                          TextButton(
                            style: TextButton.styleFrom(
                              minimumSize: Size.zero,
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            ),
                            onPressed: () => _switchSession('shortBreak'),
                            child: Text('Short Break', style: TextStyle(color: _sessionType == 'shortBreak' ? AppTheme.accentCyan : AppTheme.textSecondary, fontWeight: _sessionType == 'shortBreak' ? FontWeight.bold : FontWeight.normal)),
                          ),
                          TextButton(
                            style: TextButton.styleFrom(
                              minimumSize: Size.zero,
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            ),
                            onPressed: () => _switchSession('longBreak'),
                            child: Text('Long Break', style: TextStyle(color: _sessionType == 'longBreak' ? AppTheme.accentCyan : AppTheme.textSecondary, fontWeight: _sessionType == 'longBreak' ? FontWeight.bold : FontWeight.normal)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.settings, color: AppTheme.textSecondary),
                    onPressed: () {
                      showModalBottomSheet(
                        context: context,
                        isScrollControlled: true,
                        builder: (context) => SettingsSheet(provider: widget.provider),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            
            // Active task header card
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 24),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.bgSecondary,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.borderColor),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.play_circle_filled, size: 18, color: AppTheme.accentCyan),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      activeTaskTitle,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 32),
            TimerRing(
              progress: progress,
              timeText: timeStr,
              labelText: label,
              isBreak: _sessionType != 'focus',
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _toggleTimer,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.accentCyan,
                foregroundColor: Colors.white,
                minimumSize: const Size(120, 44),
              ),
              child: Text(_isRunning ? 'Pause' : 'Start'),
            ),
          ],
        ),
      ),
    );
  }

  final TextEditingController _taskController = TextEditingController();

  Widget _buildTasksTab() {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _taskController,
                  decoration: const InputDecoration(
                    hintText: 'What are you working on?',
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _addTask(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                icon: const Icon(Icons.add),
                color: AppTheme.accentCyan,
                onPressed: _addTask,
              ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.builder(
              itemCount: widget.provider.tasks.length,
              itemBuilder: (context, index) {
                final task = widget.provider.tasks[index];
                final hasTodos = task['todos'] != null && (task['todos'] as List).isNotEmpty;
                final activeTaskId = widget.provider.activeTaskId;
                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8),
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
                  leading: Checkbox(
                    value: task['completed'] == true,
                    activeColor: AppTheme.accentCyan,
                    onChanged: (val) {
                      _toggleTaskCompletion(index, val ?? false);
                    },
                  ),
                  title: Text(
                    task['title'] ?? '',
                    style: TextStyle(
                      decoration: task['completed'] == true ? TextDecoration.lineThrough : null,
                      color: task['completed'] == true ? AppTheme.textSecondary : Colors.white,
                    ),
                  ),
                  subtitle: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          color: _getCategoryColor(task['category'] ?? 'do'),
                          shape: BoxShape.circle,
                        ),
                      ),
                      Text(
                        _getCategoryLabel(task['category'] ?? 'do'),
                        style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        '🍅 ${task['completedPomodoros'] ?? 0}/${task['estimatedPomodoros'] ?? 1}',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                      ),
                      if (hasTodos) ...[
                        const SizedBox(width: 12),
                        Text(
                          '☑ ${_getCompletedTodosCount(task['todos'] as List)}/${(task['todos'] as List).length}',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                      ],
                    ],
                  ),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        icon: Icon(
                          activeTaskId == task['id'] ? Icons.play_circle_filled : Icons.play_circle_outline,
                          color: activeTaskId == task['id'] ? AppTheme.accentCyan : AppTheme.textSecondary,
                        ),
                        onPressed: () {
                          widget.provider.setActiveTaskId(task['id']);
                          setState(() {
                            _resetToCurrentSession();
                          });
                          _tabController.animateTo(0);
                          if (!_isRunning) {
                            _toggleTimer();
                          }
                        },
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete, color: AppTheme.textSecondary),
                        onPressed: () => _deleteTask(index),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _addTask() {
    final title = _taskController.text.trim();
    if (title.isEmpty) return;

    final newTask = {
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'title': title,
      'completed': false,
      'estimatedPomodoros': 1,
      'completedPomodoros': 0,
      'category': 'do',
      'createdAt': DateTime.now().toIso8601String(),
    };

    final newTasks = List<Map<String, dynamic>>.from(widget.provider.tasks)..add(newTask);
    widget.provider.saveTasks(newTasks);
    _taskController.clear();
  }

  void _toggleTaskCompletion(int index, bool isCompleted) {
    final updatedTasks = List<Map<String, dynamic>>.from(widget.provider.tasks);
    updatedTasks[index]['completed'] = isCompleted;
    
    final taskId = updatedTasks[index]['id'];
    if (isCompleted && widget.provider.activeTaskId == taskId) {
      widget.provider.setActiveTaskId(null);
    }
    
    widget.provider.saveTasks(updatedTasks);
  }

  void _deleteTask(int index) {
    final task = widget.provider.tasks[index];
    if (widget.provider.activeTaskId == task['id']) {
      widget.provider.setActiveTaskId(null);
    }
    final updatedTasks = List<Map<String, dynamic>>.from(widget.provider.tasks)..removeAt(index);
    widget.provider.saveTasks(updatedTasks);
  }

  Widget _buildAnalyticsTab() {
    return AnalyticsView(provider: widget.provider);
  }
}
