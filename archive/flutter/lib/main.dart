import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:provider/provider.dart';

import 'screens/main_dashboard_screen.dart';
import 'services/subscription_manager.dart';
import 'theme/apple_design_system.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await pdfrxFlutterInitialize();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppleDS.canvas,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  await SubscriptionManager.instance.init();

  runApp(
    ChangeNotifierProvider.value(
      value: SubscriptionManager.instance,
      child: const RedactPdfApp(),
    ),
  );
}

class RedactPdfApp extends StatelessWidget {
  const RedactPdfApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'RedactPDF',
      debugShowCheckedModeBanner: false,
      theme: AppleDS.darkTheme,
      home: const MainDashboardScreen(),
    );
  }
}
