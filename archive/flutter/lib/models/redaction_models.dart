import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

enum RedactionMode {
  smart('AI Detect'),
  manual('Manual Draw');

  const RedactionMode(this.label);
  final String label;
}

enum RedactionStyle {
  black('Solid Black', Colors.black),
  blur('Gaussian Blur', Color(0x99FFFFFF)),
  white('Solid White', Colors.white);

  const RedactionStyle(this.label, this.previewColor);
  final String label;
  final Color previewColor;
}

class RedactionRect {
  RedactionRect({
    String? id,
    required this.pageIndex,
    required this.rect,
    this.style = RedactionStyle.black,
  }) : id = id ?? const Uuid().v4();

  final String id;
  final int pageIndex;
  final Rect rect;
  final RedactionStyle style;
}

class LoadedPdfDocument {
  LoadedPdfDocument({
    required this.path,
    required this.title,
  });

  final String path;
  final String title;
}
