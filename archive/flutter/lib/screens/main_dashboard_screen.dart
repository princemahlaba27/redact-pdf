import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/redaction_models.dart';
import '../services/haptic_service.dart';
import '../theme/apple_components.dart';
import '../theme/apple_design_system.dart';
import 'pdf_editor_screen.dart';

class MainDashboardScreen extends StatefulWidget {
  const MainDashboardScreen({super.key});

  @override
  State<MainDashboardScreen> createState() => _MainDashboardScreenState();
}

class _MainDashboardScreenState extends State<MainDashboardScreen> {
  bool _busy = false;

  Future<void> _openPdf() async {
    await HapticService.medium();
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;
    final path = result.files.single.path;
    if (path == null) return;
    await _launchEditor(path, p.basenameWithoutExtension(path));
  }

  Future<void> _openPhotos() async {
    await HapticService.light();
    final picker = ImagePicker();
    final images = await picker.pickMultiImage(imageQuality: 92);
    if (images.isEmpty) return;

    setState(() => _busy = true);
    try {
      final pdfPath = await _imagesToPdf(images);
      if (pdfPath == null) {
        await HapticService.error();
        return;
      }
      await _launchEditor(pdfPath, 'Scan');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _imagesToPdf(List<XFile> images) async {
    final doc = pw.Document();
    for (final file in images) {
      final bytes = await file.readAsBytes();
      final memory = pw.MemoryImage(bytes);
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.letter,
          margin: const pw.EdgeInsets.all(24),
          build: (_) => pw.Center(
            child: pw.Image(memory, fit: pw.BoxFit.contain),
          ),
        ),
      );
    }
    final dir = await getTemporaryDirectory();
    final out = File(
      p.join(dir.path, 'Scan_${DateTime.now().millisecondsSinceEpoch}.pdf'),
    );
    await out.writeAsBytes(await doc.save(), flush: true);
    return out.path;
  }

  Future<void> _launchEditor(String path, String title) async {
    // Copy into app temp so scoped storage URIs stay readable.
    final dir = await getTemporaryDirectory();
    final dest = File(p.join(dir.path, p.basename(path)));
    if (path != dest.path) {
      await File(path).copy(dest.path);
    }
    await HapticService.success();
    if (!mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PdfEditorScreen(
          document: LoadedPdfDocument(path: dest.path, title: title),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const AppleScreenBackground(),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Row(
                    children: [
                      const Icon(Icons.description_rounded,
                          color: AppleDS.accent, size: 22),
                      const SizedBox(width: 8),
                      Text('RedactPDF', style: AppleDS.navBrand),
                      const Spacer(),
                      const AppleBadge(text: '100% On-Device'),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 28, 20, 40),
                    children: [
                      Text(
                        'Sanitize documents.\nKeep data private.',
                        style: AppleDS.hero,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Permanently black out text, SSNs, and financials with on-device pixel-burning.',
                        style: AppleDS.body,
                      ),
                      const SizedBox(height: 28),
                      AppleActionCard(
                        icon: Icons.picture_as_pdf_rounded,
                        title: 'Open PDF Document',
                        subtitle: 'Contracts, tax forms, statements',
                        isPrimary: true,
                        onTap: _busy ? () {} : _openPdf,
                      ),
                      const SizedBox(height: 14),
                      AppleActionCard(
                        icon: Icons.photo_library_outlined,
                        title: 'Select Photo or Scan',
                        subtitle: 'Import scanned pages as PDF',
                        onTap: _busy ? () {} : _openPhotos,
                      ),
                      const SizedBox(height: 28),
                      const AppleTrustBanner(
                        icon: Icons.shield_outlined,
                        text:
                            'Zero Cloud Processing • Metadata Flattened On Export',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (_busy)
            const AppleLoadingOverlay(message: 'Preparing document…'),
        ],
      ),
    );
  }
}
