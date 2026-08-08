import 'dart:math';
import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';

class TimerRing extends StatelessWidget {
  final double progress; // 0.0 to 1.0
  final bool isBreak;
  final String timeText;
  final String labelText;

  const TimerRing({
    super.key,
    required this.progress,
    required this.timeText,
    required this.labelText,
    this.isBreak = false,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = min(constraints.maxWidth, constraints.maxHeight);
        return SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CustomPaint(
                size: Size(size, size),
                painter: _TimerRingPainter(
                  progress: progress,
                  isBreak: isBreak,
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    timeText,
                    style: const TextStyle(
                      fontSize: 48,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  Text(
                    labelText,
                    style: const TextStyle(
                      fontSize: 16,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _TimerRingPainter extends CustomPainter {
  final double progress;
  final bool isBreak;

  _TimerRingPainter({
    required this.progress,
    required this.isBreak,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - 10;

    // Background circle
    final bgPaint = Paint()
      ..color = AppTheme.bgSecondary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10;
    canvas.drawCircle(center, radius, bgPaint);

    // Foreground arc
    final fgPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;

    if (isBreak) {
      fgPaint.color = AppTheme.accentEmerald;
    } else {
      final gradient = const LinearGradient(
        colors: [AppTheme.accentCyan, AppTheme.accentPurple],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ).createShader(Rect.fromCircle(center: center, radius: radius));
      fgPaint.shader = gradient;
    }

    final sweepAngle = 2 * pi * progress;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2, // Start at the top
      sweepAngle,
      false,
      fgPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _TimerRingPainter oldDelegate) {
    return oldDelegate.progress != progress || oldDelegate.isBreak != isBreak;
  }
}
