import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart' as pdf_lib;
import 'package:pdf/widgets.dart' as pw;
import 'package:pdfrx/pdfrx.dart';

import '../models/redaction_models.dart';

class RedactionEngine {
  RedactionEngine._();

  static final _ssn = RegExp(r'\b\d{3}-\d{2}-\d{4}\b');
  static final _email = RegExp(
    r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
  );
  static final _phone = RegExp(
    r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b',
  );
  static final _cardLoose = RegExp(r'\b(?:\d[ -]*?){13,19}\b');

  /// On-device OCR + regex PII detection.
  /// Returned rects use PDF page coordinates (origin bottom-left).
  static Future<List<ui.Rect>> detectPii({
    required PdfPage page,
    required Uint8List pngBytes,
    required ui.Size imageSize,
  }) async {
    final tempDir = await getTemporaryDirectory();
    final tempFile = File(
      p.join(
        tempDir.path,
        'ocr_page_${page.pageNumber}_${DateTime.now().millisecondsSinceEpoch}.png',
      ),
    );
    await tempFile.writeAsBytes(pngBytes, flush: true);

    final inputImage = InputImage.fromFilePath(tempFile.path);
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);

    try {
      final recognized = await recognizer.processImage(inputImage);
      final pageHeight = page.height;
      final scaleX = page.width / imageSize.width;
      final scaleY = page.height / imageSize.height;

      final rects = <ui.Rect>[];

      for (final block in recognized.blocks) {
        for (final line in block.lines) {
          for (final element in line.elements) {
            final text = element.text;
            if (!_containsPii(text)) continue;

            final box = element.boundingBox;
            final left = box.left * scaleX;
            final width = box.width * scaleX;
            final height = box.height * scaleY;
            final bottom = pageHeight - (box.top * scaleY) - height;
            final top = bottom + height;

            rects.add(
              ui.Rect.fromLTRB(
                left - 4,
                bottom - 2,
                left + width + 4,
                top + 2,
              ),
            );
          }
        }
      }

      return _mergeOverlapping(rects);
    } finally {
      await recognizer.close();
      if (await tempFile.exists()) {
        await tempFile.delete();
      }
    }
  }

  static bool _containsPii(String text) {
    if (_ssn.hasMatch(text) || _email.hasMatch(text) || _phone.hasMatch(text)) {
      return true;
    }
    for (final match in _cardLoose.allMatches(text)) {
      final digits = match.group(0)!.replaceAll(RegExp(r'\D'), '');
      if (digits.length >= 13 && digits.length <= 19 && _luhn(digits)) {
        return true;
      }
    }
    return false;
  }

  static bool _luhn(String digits) {
    var sum = 0;
    final reversed = digits.split('').reversed.toList();
    for (var i = 0; i < reversed.length; i++) {
      var d = int.parse(reversed[i]);
      if (i.isOdd) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }
    return sum % 10 == 0;
  }

  static List<ui.Rect> _mergeOverlapping(List<ui.Rect> rects) {
    if (rects.isEmpty) return [];
    var merged = List<ui.Rect>.from(rects);
    var changed = true;
    while (changed) {
      changed = false;
      final result = <ui.Rect>[];
      final used = <int>{};
      for (var i = 0; i < merged.length; i++) {
        if (used.contains(i)) continue;
        var current = merged[i];
        for (var j = i + 1; j < merged.length; j++) {
          if (used.contains(j)) continue;
          if (current.overlaps(merged[j])) {
            current = current.expandToInclude(merged[j]);
            used.add(j);
            changed = true;
          }
        }
        result.add(current);
      }
      merged = result;
    }
    return merged;
  }

  /// Permanently burns redactions into rasterized pages — text layers destroyed.
  static Future<File?> burnAndFlatten({
    required PdfDocument document,
    required List<RedactionRect> redactions,
  }) async {
    final pdf = pw.Document();

    for (var i = 0; i < document.pages.length; i++) {
      final page = document.pages[i];
      final pageWidth = page.width;
      final pageHeight = page.height;

      const scale = 2.0;
      final pageImage = await page.render(
        fullWidth: pageWidth * scale,
        fullHeight: pageHeight * scale,
      );
      if (pageImage == null) continue;

      var decoded = img.Image.fromBytes(
        width: pageImage.width,
        height: pageImage.height,
        bytes: pageImage.pixels.buffer,
        order: img.ChannelOrder.bgra,
        numChannels: 4,
      );

      final pageRedactions = redactions.where((r) => r.pageIndex == i);
      for (final redaction in pageRedactions) {
        decoded = _applyRedaction(
          decoded,
          redaction,
          pageWidth: pageWidth,
          pageHeight: pageHeight,
          scale: scale,
        );
      }

      final outPng = Uint8List.fromList(img.encodePng(decoded));
      final memoryImage = pw.MemoryImage(outPng);

      pdf.addPage(
        pw.Page(
          pageFormat: pdf_lib.PdfPageFormat(pageWidth, pageHeight),
          margin: pw.EdgeInsets.zero,
          build: (_) => pw.SizedBox(
            width: pageWidth,
            height: pageHeight,
            child: pw.Image(memoryImage, fit: pw.BoxFit.fill),
          ),
        ),
      );

      pageImage.dispose();
    }

    final dir = await getTemporaryDirectory();
    final out = File(
      p.join(dir.path, 'RedactPDF_${DateTime.now().millisecondsSinceEpoch}.pdf'),
    );
    await out.writeAsBytes(await pdf.save(), flush: true);
    return out;
  }

  /// Renders a page to PNG for OCR / preview overlays.
  static Future<({Uint8List bytes, ui.Size size})?> renderPagePng(
    PdfPage page, {
    double scale = 2.0,
  }) async {
    final rendered = await page.render(
      fullWidth: page.width * scale,
      fullHeight: page.height * scale,
    );
    if (rendered == null) return null;

    final decoded = img.Image.fromBytes(
      width: rendered.width,
      height: rendered.height,
      bytes: rendered.pixels.buffer,
      order: img.ChannelOrder.bgra,
      numChannels: 4,
    );
    final png = Uint8List.fromList(img.encodePng(decoded));
    final size = ui.Size(rendered.width.toDouble(), rendered.height.toDouble());
    rendered.dispose();
    return (bytes: png, size: size);
  }

  static img.Image _applyRedaction(
    img.Image image,
    RedactionRect redaction, {
    required double pageWidth,
    required double pageHeight,
    required double scale,
  }) {
    final r = redaction.rect;
    final left = (r.left * scale).round().clamp(0, image.width - 1);
    final right = (r.right * scale).round().clamp(0, image.width);
    final top =
        ((pageHeight - r.top) * scale).round().clamp(0, image.height - 1);
    final bottom =
        ((pageHeight - r.bottom) * scale).round().clamp(0, image.height);
    final x = math.min(left, right);
    final y = math.min(top, bottom);
    final w = (right - left).abs().clamp(1, image.width - x);
    final h = (bottom - top).abs().clamp(1, image.height - y);

    switch (redaction.style) {
      case RedactionStyle.black:
        img.fillRect(
          image,
          x1: x,
          y1: y,
          x2: x + w,
          y2: y + h,
          color: img.ColorRgba8(0, 0, 0, 255),
        );
      case RedactionStyle.white:
        img.fillRect(
          image,
          x1: x,
          y1: y,
          x2: x + w,
          y2: y + h,
          color: img.ColorRgba8(255, 255, 255, 255),
        );
      case RedactionStyle.blur:
        final cropped = img.copyCrop(image, x: x, y: y, width: w, height: h);
        final blurred = img.gaussianBlur(cropped, radius: 12);
        img.compositeImage(image, blurred, dstX: x, dstY: y);
    }
    return image;
  }
}
