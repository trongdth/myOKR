import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:myokr_mobile/src/providers/storage_provider.dart';
import 'package:myokr_mobile/src/theme.dart';

class CloudSyncScreen extends StatefulWidget {
  final StorageProvider provider;
  const CloudSyncScreen({super.key, required this.provider});

  @override
  State<CloudSyncScreen> createState() => _CloudSyncScreenState();
}

class _CloudSyncScreenState extends State<CloudSyncScreen> {
  final TextEditingController _clientIdController = TextEditingController();
  final TextEditingController _authCodeController = TextEditingController();

  String? _authUrl;
  String? _codeVerifier;

  @override
  void initState() {
    super.initState();
    if (widget.provider.dropboxClientId != null) {
      _clientIdController.text = widget.provider.dropboxClientId!;
    }
    widget.provider.addListener(_onProviderChange);
  }

  @override
  void dispose() {
    widget.provider.removeListener(_onProviderChange);
    _clientIdController.dispose();
    _authCodeController.dispose();
    super.dispose();
  }

  void _onProviderChange() {
    if (mounted) setState(() {});
  }

  Future<void> _handleGetLink() async {
    final clientId = _clientIdController.text.trim();
    if (clientId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your App Key first.')),
      );
      return;
    }

    try {
      final (verifier, url) = widget.provider.dropboxService.getDropboxAuthUrl(clientId);
      setState(() {
        _authUrl = url;
        _codeVerifier = verifier;
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to generate authorization URL: $e')),
      );
    }
  }

  Future<void> _handleOpenLink() async {
    if (_authUrl == null) return;
    final uri = Uri.parse(_authUrl!);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open browser for authorization link.')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open browser: $e')),
        );
      }
    }
  }

  Future<void> _handleConnect() async {
    final clientId = _clientIdController.text.trim();
    final authCode = _authCodeController.text.trim();

    if (clientId.isEmpty || authCode.isEmpty || _codeVerifier == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please complete the authorization step.')),
      );
      return;
    }

    final success = await widget.provider.connectDropbox(clientId, authCode, _codeVerifier!);
    if (success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Successfully connected to Dropbox!')),
      );
    }
  }

  Future<void> _handleDisconnect() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgCard,
        title: const Text('Disconnect Dropbox?', style: TextStyle(color: AppTheme.textPrimary)),
        content: const Text(
          'Your local data will remain saved on this device, but background sync will stop.',
          style: TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.okrOffTrack),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await widget.provider.disconnectDropbox();
      if (mounted) {
        setState(() {
          _authUrl = null;
          _codeVerifier = null;
          _authCodeController.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Dropbox disconnected.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isConnected = widget.provider.isDropboxConnected;
    final isSyncing = widget.provider.isSyncing;
    final syncError = widget.provider.syncError;
    final lastSync = widget.provider.lastSyncTime;

    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Icon(Icons.cloud_sync, color: AppTheme.accentCyan),
            SizedBox(width: 8),
            Text('Cloud Sync'),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Local-First Banner
            Card(
              color: AppTheme.bgSecondary,
              elevation: 0,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              child: const Padding(
                padding: EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.bolt, color: AppTheme.okrAtRisk, size: 22),
                        SizedBox(width: 8),
                        Text(
                          'True Local-First Experience',
                          style: TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Enjoy lightning-fast performance and full offline support. Connect Dropbox to seamlessly sync your data across all devices.',
                      style: TextStyle(color: AppTheme.textSecondary, height: 1.4),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Error Banner
            if (syncError != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.okrOffTrack.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.okrOffTrack.withOpacity(0.3)),
                ),
                child: Text(
                  syncError,
                  style: const TextStyle(color: AppTheme.okrOffTrack, fontSize: 14),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Disconnected or Connected Content
            Card(
              color: AppTheme.bgCard,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: AppTheme.borderColor),
              ),
              child: Padding(
                padding: const EdgeInsets.all(20.0),
                child: !isConnected ? _buildDisconnectedView(isSyncing) : _buildConnectedView(isSyncing, lastSync, syncError),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDisconnectedView(bool isSyncing) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Connect to Dropbox',
          style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        const Text(
          'How to connect:',
          style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        const Text(
          '1. Go to the Dropbox App Console (dropbox.com/developers/apps) and sign in.\n'
          '2. Click "Create app". Choose "Scoped access" and "App folder". Name your app (e.g. "myOKR Sync").\n'
          '3. Under "Permissions", check files.content.read and files.content.write, then click Submit.\n'
          '4. Under "Settings", copy your App key (Client ID).\n'
          '5. Paste your App Key below and tap "Get Authorization Link".',
          style: TextStyle(color: AppTheme.textSecondary, height: 1.5, fontSize: 13),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _clientIdController,
          enabled: _authUrl == null,
          style: const TextStyle(color: AppTheme.textPrimary),
          decoration: InputDecoration(
            hintText: 'Paste your Dropbox App Key here',
            hintStyle: const TextStyle(color: AppTheme.textMuted),
            filled: true,
            fillColor: AppTheme.bgSecondary,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: AppTheme.borderColor),
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (_authUrl == null)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _handleGetLink,
              child: const Text('Get Authorization Link'),
            ),
          ),
        if (_authUrl != null) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.bgSecondary,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.borderColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Step 2: Authorize App',
                  style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold, fontSize: 15),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Tap the button below to authorize the app in your browser, then copy the provided authorization code.',
                  style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.4),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.accentCyan,
                    side: const BorderSide(color: AppTheme.accentCyan),
                  ),
                  onPressed: _handleOpenLink,
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Open Authorization Page'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _authCodeController,
                  obscureText: true,
                  style: const TextStyle(color: AppTheme.textPrimary),
                  decoration: InputDecoration(
                    hintText: 'Paste the Authorization Code here',
                    hintStyle: const TextStyle(color: AppTheme.textMuted),
                    filled: true,
                    fillColor: AppTheme.bgCard,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppTheme.borderColor),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: isSyncing ? null : _handleConnect,
                    child: isSyncing
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Connect'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildConnectedView(bool isSyncing, String? lastSync, String? syncError) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppTheme.okrOnTrack.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.check, color: AppTheme.okrOnTrack, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Dropbox Connected',
                    style: TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    lastSync != null ? 'Last successful sync: $lastSync' : 'Your app is ready to sync.',
                    style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            ElevatedButton.icon(
              onPressed: isSyncing ? null : () => widget.provider.syncData(),
              icon: isSyncing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.sync, size: 18),
              label: Text(isSyncing ? 'Syncing...' : 'Sync Now'),
            ),
            if (syncError != null && (syncError.contains('corrupt') || syncError.contains('conflict') || syncError.contains('failed')))
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.okrOffTrack,
                  side: const BorderSide(color: AppTheme.okrOffTrack),
                ),
                onPressed: isSyncing ? null : () => widget.provider.syncData(forceUpload: true),
                child: const Text('Overwrite Cloud Data'),
              ),
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.okrOffTrack,
                side: const BorderSide(color: AppTheme.borderColor),
              ),
              onPressed: isSyncing ? null : _handleDisconnect,
              child: const Text('Disconnect'),
            ),
          ],
        ),
        const SizedBox(height: 24),
        const Row(
          children: [
            Icon(Icons.info_outline, color: AppTheme.textMuted, size: 18),
            SizedBox(width: 8),
            Expanded(
              child: Text(
                'Auto-sync runs in the background every 15 minutes. The app automatically updates if new changes arrive.',
                style: TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
