import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';

import 'package:http/http.dart' as http;
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';

import 'dropbox_test.mocks.dart';

@GenerateMocks([http.Client])
void main() {
  group('DropboxService', () {
    late MockClient mockClient;
    late DropboxService service;

    setUp(() {
      mockClient = MockClient();
      service = DropboxService(client: mockClient);
    });

    test('getDropboxAuthUrl generates valid URL with state', () {
      final (verifier, state, url) = service.getDropboxAuthUrl('my_client_id');
      expect(verifier, isNotEmpty);
      expect(state, isNotEmpty);
      expect(url, contains('https://www.dropbox.com/oauth2/authorize'));
      expect(url, contains('client_id=my_client_id'));
      expect(url, contains('code_challenge='));
      expect(url, contains('state=$state'));
    });

    test('exchangeDropboxCode returns refresh token on success', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'refresh_token': 'test_refresh_token'}), 200));

      final token = await service.exchangeDropboxCode('client_id', 'code', 'verifier',
          expectedState: 'st8', returnedState: 'st8');
      expect(token, 'test_refresh_token');
    });

    test('validateDropboxToken returns true on valid token', () async {
      // Mock access token fetch
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      // Mock user validation
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/2/users/get_current_account'),
        headers: anyNamed('headers'),
      )).thenAnswer((_) async => http.Response('{}', 200));

      final isValid = await service.validateDropboxToken('client_id', 'refresh_token');
      expect(isValid, true);
    });

    test('downloadFromDropbox returns Uint8List on success', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/download'),
        headers: anyNamed('headers'),
      )).thenAnswer((_) async => http.Response.bytes([1, 2, 3, 4], 200));

      final result = await service.downloadFromDropbox('client_id', 'refresh_token');
      expect(result, [1, 2, 3, 4]);
    });

    test('downloadFromDropbox returns null when file not found', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/download'),
        headers: anyNamed('headers'),
      )).thenAnswer((_) async => http.Response('{"error": "path/not_found"}', 409));

      final result = await service.downloadFromDropbox('client_id', 'refresh_token');
      expect(result, isNull);
    });

    test('uploadToDropbox succeeds on 200', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/upload'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response('{}', 200));

      await expectLater(
        service.uploadToDropbox('client_id', 'refresh_token', [1, 2, 3]),
        completes,
      );
    });

    test('syncWithDropbox performs download, merge, and upload', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/download'),
        headers: anyNamed('headers'),
      )).thenAnswer((_) async => http.Response.bytes([10, 20], 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/upload'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response('{}', 200));

      bool mergeCalled = false;
      final success = await service.syncWithDropbox(
        clientId: 'client_id',
        refreshToken: 'refresh_token',
        getLocalBinary: () async => Uint8List.fromList([1, 2]),
        mergeExternalBinary: (remote) async {
          mergeCalled = true;
          expect(remote, [10, 20]);
          return Uint8List.fromList([1, 2, 10, 20]);
        },
      );

      expect(success, true);
      expect(mergeCalled, true);
    });

    test('syncWithDropbox forceUpload skips download and merge', () async {
      when(mockClient.post(
        Uri.parse('https://api.dropboxapi.com/oauth2/token'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(
          jsonEncode({'access_token': 'test_access_token'}), 200));

      when(mockClient.post(
        Uri.parse('https://content.dropboxapi.com/2/files/upload'),
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response('{}', 200));

      bool mergeCalled = false;
      final success = await service.syncWithDropbox(
        clientId: 'client_id',
        refreshToken: 'refresh_token',
        getLocalBinary: () async => Uint8List.fromList([1, 2]),
        mergeExternalBinary: (remote) async {
          mergeCalled = true;
          return Uint8List.fromList([1, 2]);
        },
        forceUpload: true,
      );

      expect(success, true);
      expect(mergeCalled, false);
    });
  });
}

