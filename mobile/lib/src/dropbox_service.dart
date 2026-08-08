import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

import 'package:crypto/crypto.dart';

class DropboxService {
  final http.Client _client;

  DropboxService({http.Client? client}) : _client = client ?? http.Client();

  /// Generates a PKCE code verifier and challenge.
  /// Returns a tuple: (codeVerifier, url)
  (String, String) getDropboxAuthUrl(String clientId) {
    // Generate code verifier
    final rand = Random.secure();
    final values = List<int>.generate(32, (i) => rand.nextInt(256));
    final codeVerifier = base64UrlEncode(values).replaceAll('=', '');

    // Generate code challenge
    final bytes = utf8.encode(codeVerifier);
    final digest = sha256.convert(bytes);
    final codeChallenge = base64UrlEncode(digest.bytes).replaceAll('=', '');

    // Construct URL
    final url = Uri.https('www.dropbox.com', '/oauth2/authorize', {
      'client_id': clientId,
      'response_type': 'code',
      'token_access_type': 'offline',
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
    }).toString();

    return (codeVerifier, url);
  }

  /// Exchanges the authorization code for a refresh token.
  Future<String> exchangeDropboxCode(String clientId, String code, String codeVerifier) async {
    final response = await _client.post(
      Uri.parse('https://api.dropboxapi.com/oauth2/token'),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': clientId,
        'code_verifier': codeVerifier,
      },
    );

    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['refresh_token'] as String;
    } else {
      throw Exception('Failed to exchange code: ${response.body}');
    }
  }

  /// Validates the token by getting current account
  Future<bool> validateDropboxToken(String clientId, String refreshToken) async {
    try {
      final accessToken = await _getAccessToken(clientId, refreshToken);
      final response = await _client.post(
        Uri.parse('https://api.dropboxapi.com/2/users/get_current_account'),
        headers: {
          'Authorization': 'Bearer $accessToken',
        },
      );
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  Future<String> _getAccessToken(String clientId, String refreshToken) async {
    final response = await _client.post(
      Uri.parse('https://api.dropboxapi.com/oauth2/token'),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: {
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
        'client_id': clientId,
      },
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      final json = jsonDecode(response.body);
      return json['access_token'] as String;
    } else {
      throw Exception('Failed to get access token: ${response.statusCode}');
    }
  }

  /// Downloads the automerge binary file from Dropbox.
  /// Returns null if the file does not exist.
  Future<Uint8List?> downloadFromDropbox(String clientId, String refreshToken) async {
    final accessToken = await _getAccessToken(clientId, refreshToken);
    final response = await _client.post(
      Uri.parse('https://content.dropboxapi.com/2/files/download'),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Dropbox-API-Arg': jsonEncode({'path': '/myokr-data.automerge'}),
      },
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      const maxSyncBytes = 50 * 1024 * 1024; // 50 MB cap
      if (response.bodyBytes.length > maxSyncBytes) {
        throw Exception('Sync aborted: remote document (${response.bodyBytes.length} bytes) exceeds 50MB cap');
      }
      return response.bodyBytes;
    } else if (response.statusCode == 409 || response.body.contains('path/not_found')) {
      return null;
    } else {
      throw Exception('Download failed with status ${response.statusCode}: ${response.body}');
    }
  }

  /// Uploads the automerge binary file to Dropbox.
  Future<void> uploadToDropbox(String clientId, String refreshToken, List<int> binary) async {
    final accessToken = await _getAccessToken(clientId, refreshToken);
    final response = await _client.post(
      Uri.parse('https://content.dropboxapi.com/2/files/upload'),
      headers: {
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': jsonEncode({
          'path': '/myokr-data.automerge',
          'mode': 'overwrite',
          'autorename': false,
          'mute': false,
          'strict_conflict': false,
        }),
      },
      body: binary,
    ).timeout(const Duration(seconds: 10));

    if (response.statusCode != 200) {
      throw Exception('Upload failed with status ${response.statusCode}: ${response.body}');
    }
  }


  /// Performs full synchronization with Dropbox:
  /// 1. Downloads remote file (if forceUpload/compacted is false)
  /// 2. Merges with local binary callback
  /// 3. Uploads merged result
  Future<bool> syncWithDropbox({
    required String clientId,
    required String refreshToken,
    required Future<Uint8List> Function() getLocalBinary,
    required Future<Uint8List> Function(Uint8List remoteBinary) mergeExternalBinary,
    bool forceUpload = false,
    bool compactedSinceLastSync = false,
  }) async {
    if (clientId.isEmpty || refreshToken.isEmpty) return false;

    Uint8List finalBinary = await getLocalBinary();

    if (!forceUpload && !compactedSinceLastSync) {
      final remoteBinary = await downloadFromDropbox(clientId, refreshToken);
      if (remoteBinary != null && remoteBinary.isNotEmpty) {
        finalBinary = await mergeExternalBinary(remoteBinary);
      }
    }

    await uploadToDropbox(clientId, refreshToken, finalBinary);
    return true;
  }
}

