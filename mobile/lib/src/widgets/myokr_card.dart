import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';

class MyOkrCard extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final bool isInteractive;

  const MyOkrCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(16.0),
    this.isInteractive = false,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppTheme.bgCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppTheme.borderColor, width: 1),
      ),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        splashColor: isInteractive ? AppTheme.accentCyan.withValues(alpha: 0.1) : Colors.transparent,
        highlightColor: isInteractive ? AppTheme.accentCyan.withValues(alpha: 0.05) : Colors.transparent,
        child: Padding(
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}
