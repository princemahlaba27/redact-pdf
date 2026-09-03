import 'package:flutter_test/flutter_test.dart';
import 'package:redact_pdf/main.dart';
import 'package:redact_pdf/services/subscription_manager.dart';
import 'package:provider/provider.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Dashboard renders brand and primary action', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider.value(
        value: SubscriptionManager.instance,
        child: const RedactPdfApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('RedactPDF'), findsOneWidget);
    expect(find.textContaining('Sanitize documents'), findsOneWidget);
    expect(find.text('Open PDF Document'), findsOneWidget);
  });
}
