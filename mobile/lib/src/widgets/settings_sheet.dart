import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';

class SettingsSheet extends StatefulWidget {
  final StorageProvider provider;

  const SettingsSheet({super.key, required this.provider});

  @override
  State<SettingsSheet> createState() => _SettingsSheetState();
}

class _SettingsSheetState extends State<SettingsSheet> {
  late int _focusDuration;
  late int _shortBreakDuration;
  late int _longBreakDuration;
  late int _pomosBeforeLongBreak;
  late bool _autoStartBreaks;
  late bool _autoStartFocus;
  late bool _focusMusic;

  @override
  void initState() {
    super.initState();
    final s = widget.provider.settings;
    _focusDuration = s['focusDuration'] as int? ?? 25;
    _shortBreakDuration = s['shortBreakDuration'] as int? ?? 5;
    _longBreakDuration = s['longBreakDuration'] as int? ?? 15;
    _pomosBeforeLongBreak = s['pomosBeforeLongBreak'] as int? ?? 4;
    _autoStartBreaks = s['autoStartBreaks'] as bool? ?? true; // posture ii (matches desktop)
    _autoStartFocus = s['autoStartFocus'] as bool? ?? false;
    _focusMusic = s['focusMusicEnabled'] as bool? ?? false;
  }

  // Read-modify-write: build from the loaded settings so sibling keys the other
  // app wrote (e.g. focusMusicEnabled) survive the save. ADR-0004.
  void _saveSettings() {
    final newSettings = Map<String, dynamic>.from(widget.provider.settings)
      ..['focusDuration'] = _focusDuration
      ..['shortBreakDuration'] = _shortBreakDuration
      ..['longBreakDuration'] = _longBreakDuration
      ..['pomosBeforeLongBreak'] = _pomosBeforeLongBreak
      ..['autoStartBreaks'] = _autoStartBreaks
      ..['autoStartFocus'] = _autoStartFocus
      ..['focusMusicEnabled'] = _focusMusic;
    widget.provider.saveSettings(newSettings);
  }

  Widget _buildSliderRow({
    required String title,
    required int value,
    required int min,
    required int max,
    required String unit,
    required ValueChanged<int> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            Text(
              '$value $unit',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: AppTheme.accentCyan,
              ),
            ),
          ],
        ),
        Slider(
          value: value.toDouble(),
          min: min.toDouble(),
          max: max.toDouble(),
          divisions: max - min,
          activeColor: AppTheme.accentCyan,
          inactiveColor: AppTheme.borderColor,
          onChanged: (val) {
            // Update the live label only — the drag fires dozens of ticks.
            onChanged(val.round());
          },
          // Persist once per interaction, not per tick (ticket 15). Keyboard
          // and a11y changes go through increaseAction/decreaseAction, which
          // fire onChangeEnd too (pinned SDK, slider.dart:1948-1956) — so
          // they persist here as well.
          onChangeEnd: (_) => _saveSettings(),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _buildSwitchRow({
    required String title,
    required String description,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Switch(
            value: value,
            activeThumbColor: AppTheme.accentCyan,
            activeTrackColor: AppTheme.accentCyan.withValues(alpha: 0.3),
            inactiveThumbColor: AppTheme.textSecondary,
            inactiveTrackColor: AppTheme.borderColor,
            onChanged: (val) {
              onChanged(val);
              _saveSettings();
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppTheme.bgSecondary,
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      padding: const EdgeInsets.all(16.0),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Pull bar
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
                  const Text(
                    'Timer Settings',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.close,
                      color: AppTheme.textSecondary,
                    ),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const Divider(color: AppTheme.borderColor),
              const SizedBox(height: 16),

              // Durations
              _buildSliderRow(
                title: 'Focus Duration',
                value: _focusDuration,
                min: 5,
                max: 60,
                unit: 'min',
                onChanged: (val) {
                  setState(() => _focusDuration = val);
                },
              ),
              _buildSliderRow(
                title: 'Short Break Duration',
                value: _shortBreakDuration,
                min: 1,
                max: 30,
                unit: 'min',
                onChanged: (val) {
                  setState(() => _shortBreakDuration = val);
                },
              ),
              _buildSliderRow(
                title: 'Long Break Duration',
                value: _longBreakDuration,
                min: 5,
                max: 45,
                unit: 'min',
                onChanged: (val) {
                  setState(() => _longBreakDuration = val);
                },
              ),
              _buildSliderRow(
                title: 'Pomos Before Long Break',
                value: _pomosBeforeLongBreak,
                min: 1,
                max: 10,
                unit: 'sessions',
                onChanged: (val) {
                  setState(() => _pomosBeforeLongBreak = val);
                },
              ),

              const Divider(color: AppTheme.borderColor, height: 24),

              // Auto-start options
              _buildSwitchRow(
                title: 'Auto-start Breaks',
                description:
                    'Automatically start break when Focus session ends',
                value: _autoStartBreaks,
                onChanged: (val) {
                  setState(() => _autoStartBreaks = val);
                },
              ),
              _buildSwitchRow(
                title: 'Auto-start Focus',
                description:
                    'Automatically start focus when Break session ends',
                value: _autoStartFocus,
                onChanged: (val) {
                  setState(() => _autoStartFocus = val);
                },
              ),
              _buildSwitchRow(
                title: 'Focus Music',
                description: 'Play ambient music during focus sessions',
                value: _focusMusic,
                onChanged: (val) {
                  setState(() => _focusMusic = val);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
