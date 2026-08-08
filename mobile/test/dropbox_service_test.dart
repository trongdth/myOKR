import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myokr_mobile/src/dropbox_service.dart';

void main() {
  group('getDropboxAuthUrl', () {
    test('includes a cryptographically random state parameter', () {
      final service = DropboxService(
        client: MockClient((_) async => http.Response('', 200)),
      );
      final (verifier, state, url) = service.getDropboxAuthUrl('client-1');

      expect(state, isNotEmpty);
      expect(url, contains('state=$state'));
      // Independent random values, not the PKCE verifier reused.
      expect(state, isNot(equals(verifier)));
    });
  });

  group('parseAuthResponse', () {
    test('bare code has no state', () {
      final parsed = parseAuthResponse('abc123');
      expect(parsed.code, 'abc123');
      expect(parsed.state, isNull);
    });

    test('query string yields code and state', () {
      final parsed = parseAuthResponse('code=XyZ&state=St8');
      expect(parsed.code, 'XyZ');
      expect(parsed.state, 'St8');
    });

    test('full redirect URL yields code and state', () {
      final parsed = parseAuthResponse(
          'https://example.com/callback?code=CODE&state=STATE123');
      expect(parsed.code, 'CODE');
      expect(parsed.state, 'STATE123');
    });
  });

  group('exchangeDropboxCode', () {
    test('rejects a state mismatch without calling the API', () async {
      var apiCalls = 0;
      final service = DropboxService(
        client: MockClient((_) async {
          apiCalls++;
          return http.Response('{"refresh_token": "tok"}', 200);
        }),
      );

      await expectLater(
        service.exchangeDropboxCode('c', 'code', 'verifier',
            expectedState: 'expected', returnedState: 'attacker'),
        throwsException,
      );
      expect(apiCalls, 0); // the CSRF check happens before any network I/O
    });

    test('exchanges when the state matches', () async {
      final service = DropboxService(
        client: MockClient((_) async {
          return http.Response('{"refresh_token": "rt-1"}', 200);
        }),
      );

      final token = await service.exchangeDropboxCode('c', 'code', 'verifier',
          expectedState: 'st8', returnedState: 'st8');
      expect(token, 'rt-1');
    });
  });
}
