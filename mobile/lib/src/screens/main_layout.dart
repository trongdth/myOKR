import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';

import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/screens/today_screen.dart';
import 'package:myokr_mobile/src/screens/timer_screen.dart';
import 'package:myokr_mobile/src/screens/okr_screen.dart';
import 'package:myokr_mobile/src/screens/eisenhower_matrix_screen.dart';
import 'package:myokr_mobile/src/screens/review_screen.dart';
import 'package:myokr_mobile/src/screens/cloud_sync_screen.dart';
import 'package:myokr_mobile/src/screens/habits_screen.dart';

class MainLayout extends StatefulWidget {
  final StorageProvider provider;
  const MainLayout({super.key, required this.provider});

  @override
  State<MainLayout> createState() => _MainLayoutState();
}

class _ReviewScreenWrapper extends StatefulWidget {
  final StorageProvider provider;
  const _ReviewScreenWrapper({required this.provider});

  @override
  State<_ReviewScreenWrapper> createState() => _ReviewScreenWrapperState();
}

class _ReviewScreenWrapperState extends State<_ReviewScreenWrapper> {
  @override
  Widget build(BuildContext context) {
    return ReviewScreen(
      provider: widget.provider,
      onStartWizard: () {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Review Wizard launch placeholder (Ticket 04)')),
        );
      },
    );
  }
}

class _MainLayoutState extends State<MainLayout> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    widget.provider.loadAllData();
    widget.provider.initSync();
    widget.provider.addListener(_onProviderChange);
  }

  @override
  void dispose() {
    widget.provider.removeListener(_onProviderChange);
    super.dispose();
  }

  void _onProviderChange() {
    if (mounted) setState(() {});
  }

  List<Widget> get _screens => [
    TodayScreen(
      provider: widget.provider,
      onStartFocus: () {
        setState(() {
          _currentIndex = 2;
        });
      },
    ),
    OkrScreen(provider: widget.provider),
    TimerScreen(provider: widget.provider),
    _ReviewScreenWrapper(provider: widget.provider),
    HabitsScreen(provider: widget.provider),
  ];

  @override
  Widget build(BuildContext context) {
    final isConnected = widget.provider.isDropboxConnected;
    final isSyncing = widget.provider.isSyncing;

    return Scaffold(
      appBar: AppBar(
        title: const Text('myOKR'),
        actions: [
          IconButton(
            icon: const Icon(Icons.grid_view),
            tooltip: 'Prioritize (Eisenhower matrix)',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) =>
                      EisenhowerMatrixScreen(provider: widget.provider),
                ),
              );
            },
          ),
          IconButton(
            icon: isSyncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.accentCyan),
                  )
                : Icon(
                    isConnected ? Icons.cloud_done : Icons.cloud_sync,
                    color: isConnected ? AppTheme.accentCyan : AppTheme.textSecondary,
                  ),
            tooltip: 'Cloud Sync',
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => CloudSyncScreen(provider: widget.provider),
                ),
              );
            },
          ),
        ],
      ),

      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        type: BottomNavigationBarType.fixed,
        backgroundColor: AppTheme.bgSecondary,
        selectedItemColor: AppTheme.accentCyan,
        unselectedItemColor: AppTheme.textSecondary,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.today),
            label: 'Today',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.track_changes),
            label: 'OKRs',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.timer),
            label: 'Pomodoro',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.rate_review),
            label: 'Review',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.show_chart),
            label: 'Habits',
          ),
        ],
      ),
    );
  }
}

