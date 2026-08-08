import 'package:flutter/material.dart';
import 'package:myokr_mobile/src/theme.dart';

class ReviewEntryEditSheet extends StatefulWidget {
  final Map<String, dynamic> entry;
  final Map<String, dynamic> keyResult;
  final ValueChanged<Map<String, dynamic>> onSave;

  const ReviewEntryEditSheet({
    super.key,
    required this.entry,
    required this.keyResult,
    required this.onSave,
  });

  @override
  State<ReviewEntryEditSheet> createState() => _ReviewEntryEditSheetState();
}

class _ReviewEntryEditSheetState extends State<ReviewEntryEditSheet> {
  late TextEditingController _valueController;
  late TextEditingController _noteController;
  late String _selectedConfidence;

  @override
  void initState() {
    super.initState();
    final currVal = (widget.entry['currentValue'] as num?)?.toDouble() ?? 0.0;
    _valueController = TextEditingController(text: currVal.toString());
    _noteController = TextEditingController(text: widget.entry['note'] as String? ?? '');
    _selectedConfidence = widget.entry['confidence'] as String? ?? 'on_track';
  }

  @override
  void dispose() {
    _valueController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  void _handleSave() {
    final mode = widget.keyResult['completionMode'] as String? ?? 'manual';
    double val;
    if (mode != 'manual') {
      val = (widget.entry['currentValue'] as num?)?.toDouble() ?? 0.0;
    } else {
      val = double.tryParse(_valueController.text) ?? (widget.entry['currentValue'] as num?)?.toDouble() ?? 0.0;
    }

    final updated = Map<String, dynamic>.from(widget.entry);
    updated['currentValue'] = val;
    updated['confidence'] = _selectedConfidence;
    final noteText = _noteController.text.trim();
    if (noteText.isNotEmpty) {
      updated['note'] = noteText;
    } else {
      updated.remove('note');
    }

    widget.onSave(updated);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.keyResult['title'] as String? ?? 'Key Result';
    final unit = widget.keyResult['unit'] as String? ?? '';
    final mode = widget.keyResult['completionMode'] as String? ?? 'manual';
    final isManual = mode == 'manual';

    return Padding(
      padding: EdgeInsets.only(
        left: 16, right: 16, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    'Edit Entry: $title',
                    style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: AppTheme.textMuted),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Value', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
            const SizedBox(height: 6),
            if (!isManual)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.bgCard,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppTheme.borderColor),
                ),
                child: Row(
                  children: [
                    Text(
                      '${widget.entry['currentValue']} $unit',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.accentCyan.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text('auto', style: TextStyle(fontSize: 11, color: AppTheme.accentCyan, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              )
            else
              TextField(
                controller: _valueController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: const TextStyle(color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  suffixText: unit,
                  suffixStyle: const TextStyle(color: AppTheme.textMuted),
                  filled: true,
                  fillColor: AppTheme.bgCard,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: AppTheme.borderColor)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: AppTheme.borderColor)),
                ),
              ),
            const SizedBox(height: 16),
            const Text('Confidence', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
            const SizedBox(height: 8),
            Row(
              children: [
                _buildConfidenceButton('on_track', '🟢 On Track', AppTheme.okrOnTrack),
                const SizedBox(width: 8),
                _buildConfidenceButton('at_risk', '🟡 At Risk', AppTheme.okrAtRisk),
                const SizedBox(width: 8),
                _buildConfidenceButton('off_track', '🔴 Off Track', AppTheme.okrOffTrack),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Note', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.textSecondary)),
            const SizedBox(height: 6),
            TextField(
              controller: _noteController,
              maxLines: 3,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: 'Add a note...',
                hintStyle: const TextStyle(color: AppTheme.textMuted),
                filled: true,
                fillColor: AppTheme.bgCard,
                contentPadding: const EdgeInsets.all(12),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: AppTheme.borderColor)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(6), borderSide: const BorderSide(color: AppTheme.borderColor)),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.textSecondary,
                      side: const BorderSide(color: AppTheme.borderColor),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    onPressed: _handleSave,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.accentCyan,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    child: const Text('Save Changes', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfidenceButton(String value, String label, Color color) {
    final isSelected = _selectedConfidence == value;
    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() {
            _selectedConfidence = value;
          });
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.2) : AppTheme.bgCard,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(
              color: isSelected ? color : AppTheme.borderColor,
              width: isSelected ? 1.5 : 1.0,
            ),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
              color: isSelected ? color : AppTheme.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
