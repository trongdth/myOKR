import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';

const List<Color> krColors = [
  Color(0xFF06B6D4), // cyan
  Color(0xFFA855F7), // purple
  Color(0xFFF97316), // orange
  Color(0xFF22C55E), // green
  Color(0xFFEAB308), // yellow
  Color(0xFFEC4899), // pink
  Color(0xFF3B82F6), // blue
  Color(0xFF14B8A6), // teal
  Color(0xFFF43E5E), // rose
  Color(0xFF8B5CF6), // violet
];

class ProgressChartWidget extends StatelessWidget {
  final List<Map<String, dynamic>> reviews;
  final List<Map<String, dynamic>> keyResults;

  const ProgressChartWidget({
    super.key,
    required this.reviews,
    required this.keyResults,
  });

  @override
  Widget build(BuildContext context) {
    final sortedReviews = [...reviews]
        .where((r) => r['completedAt'] != null)
        .toList();
    sortedReviews.sort((a, b) {
      final dateA = a['weekStartDate'] as String? ?? '';
      final dateB = b['weekStartDate'] as String? ?? '';
      return dateA.compareTo(dateB);
    });

    if (sortedReviews.length < 2) {
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
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '📈 Progress Over Time',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
              ),
            ),
            SizedBox(height: 16),
            Text(
              'Complete at least 2 weekly reviews to see your progress chart',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: AppTheme.textMuted),
            ),
          ],
        ),
      );
    }

    final data = buildChartData(
      sortedReviews: sortedReviews,
      keyResults: keyResults,
    );

    return Container(
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
          const Text(
            '📈 Progress Over Time',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
          ),
          const SizedBox(height: 16),

          // Chart with Y-axis labels
          SizedBox(
            height: 140,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Y-axis labels column
                const Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('100%', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text('75%', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text('50%', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text('25%', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                    Text('0%', style: TextStyle(fontSize: 10, color: AppTheme.textMuted)),
                  ],
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: CustomPaint(
                    painter: _ProgressChartPainter(
                      dates: data.dates,
                      seriesList: data.seriesList,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),

          // X-axis date labels row
          Padding(
            padding: const EdgeInsets.only(left: 36.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: data.dates
                  .map((d) => Text(
                        d,
                        style: const TextStyle(fontSize: 10, color: AppTheme.textMuted),
                      ))
                  .toList(),
            ),
          ),
          const SizedBox(height: 16),

          // Legend
          Wrap(
            spacing: 12,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: data.seriesList.map((s) {
              return Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: s.color,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    s.title,
                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                  ),
                ],
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

/// One KR's line in the chart: [points] are (reviewIndex, percent) pairs.
/// Weeks where the review had no entry for this KR (or its target was 0)
/// are omitted — gaps in data must not read as a 0% drop (ticket 04).
@immutable
class ChartSeries {
  const ChartSeries({
    required this.krId,
    required this.title,
    required this.color,
    required this.points,
  });

  final String krId;
  final String title;
  final Color color;
  final List<Offset> points;

  @override
  bool operator ==(Object other) =>
      other is ChartSeries &&
      other.krId == krId &&
      other.title == title &&
      other.color == color &&
      listEquals(other.points, points);

  @override
  int get hashCode => Object.hash(krId, title, color, Object.hashAll(points));
}

/// The chart's data: x-axis [dates] and one [ChartSeries] per KR.
@immutable
class ChartData {
  const ChartData({required this.dates, required this.seriesList});

  final List<String> dates;
  final List<ChartSeries> seriesList;
}

/// Builds the chart series from completed reviews (already sorted by
/// weekStartDate). Extracted from the widget so the data shape — including
/// the gap-skipping rule — is unit-testable.
ChartData buildChartData({
  required List<Map<String, dynamic>> sortedReviews,
  required List<Map<String, dynamic>> keyResults,
}) {
  final krIds = <String>{};
  for (final r in sortedReviews) {
    final entries = r['entries'];
    if (entries is List) {
      for (final e in entries) {
        if (e is Map && e['keyResultId'] != null) {
          krIds.add(e['keyResultId'] as String);
        }
      }
    }
  }

  final seriesList = <ChartSeries>[];
  int colorIdx = 0;
  for (final krId in krIds) {
    Map<String, dynamic>? kr;
    for (final item in keyResults) {
      if (item['id'] == krId) {
        kr = item;
        break;
      }
    }

    final title = kr?['title'] as String? ?? 'Key Result';
    final target = (kr?['targetValue'] as num?)?.toDouble() ?? 0.0;
    final color = krColors[colorIdx % krColors.length];
    colorIdx++;

    final points = <Offset>[];
    for (int i = 0; i < sortedReviews.length; i++) {
      final r = sortedReviews[i];
      final entriesList = r['entries'] as List? ?? [];
      Map? entry;
      for (final item in entriesList) {
        if (item is Map && item['keyResultId'] == krId) {
          entry = item;
          break;
        }
      }
      // A missing entry or a zero target is a data gap, not 0% progress —
      // skip the point so the line bridges the gap instead of dropping.
      if (entry != null && target > 0) {
        final curr = (entry['currentValue'] as num?)?.toDouble() ?? 0.0;
        final pct = min(100.0, (curr / target) * 100.0);
        points.add(Offset(i.toDouble(), pct));
      }
    }

    seriesList.add(ChartSeries(
      krId: krId,
      title: title,
      color: color,
      points: points,
    ));
  }

  final dates = sortedReviews.map((r) {
    final wStart = r['weekStartDate'] as String? ?? '';
    return wStart.length >= 10 ? wStart.substring(5) : wStart;
  }).toList();

  return ChartData(dates: dates, seriesList: seriesList);
}

class _ProgressChartPainter extends CustomPainter {
  final List<String> dates;
  final List<ChartSeries> seriesList;

  _ProgressChartPainter({
    required this.dates,
    required this.seriesList,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (dates.length < 2 || size.width <= 0 || size.height <= 0) return;

    final gridPaint = Paint()
      ..color = AppTheme.borderColor.withOpacity(0.5)
      ..strokeWidth = 1.0;

    // Y-axis grid lines (0%, 25%, 50%, 75%, 100%)
    for (final v in [0, 25, 50, 75, 100]) {
      final y = size.height - (v / 100.0) * size.height;

      canvas.drawLine(
        Offset(0, y),
        Offset(size.width, y),
        gridPaint,
      );
    }

    // Series lines and point circles
    for (final series in seriesList) {
      if (series.points.isEmpty) continue;

      final path = Path();
      final linePaint = Paint()
        ..color = series.color
        ..strokeWidth = 2.0
        ..style = PaintingStyle.stroke;

      final dotFillPaint = Paint()
        ..color = series.color
        ..style = PaintingStyle.fill;

      final dotStrokePaint = Paint()
        ..color = AppTheme.bgCard
        ..strokeWidth = 1.5
        ..style = PaintingStyle.stroke;

      for (int i = 0; i < series.points.length; i++) {
        final pt = series.points[i];
        final x = (pt.dx / (dates.length - 1)) * size.width;
        final y = size.height - (pt.dy / 100.0) * size.height;

        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }

      canvas.drawPath(path, linePaint);

      // Draw dots
      for (int i = 0; i < series.points.length; i++) {
        final pt = series.points[i];
        final x = (pt.dx / (dates.length - 1)) * size.width;
        final y = size.height - (pt.dy / 100.0) * size.height;

        canvas.drawCircle(Offset(x, y), 3.5, dotFillPaint);
        canvas.drawCircle(Offset(x, y), 3.5, dotStrokePaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ProgressChartPainter oldDelegate) {
    return !listEquals(dates, oldDelegate.dates) ||
        !listEquals(seriesList, oldDelegate.seriesList);
  }
}
