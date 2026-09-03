import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/redaction_models.dart';
import '../services/haptic_service.dart';
import '../services/redaction_engine.dart';
import '../services/subscription_manager.dart';
import '../theme/apple_components.dart';
import '../theme/apple_design_system.dart';
import 'paywall_screen.dart';

class PdfEditorScreen extends StatefulWidget {
  const PdfEditorScreen({super.key, required this.document});

  final LoadedPdfDocument document;

  @override
  State<PdfEditorScreen> createState() => _PdfEditorScreenState();
}

class _PdfEditorScreenState extends State<PdfEditorScreen> {
  PdfDocument? _pdf;
  final _controller = PdfViewerController();

  RedactionMode _mode = RedactionMode.manual;
  RedactionStyle _style = RedactionStyle.black;
  final List<RedactionRect> _redactions = [];

  int _pageIndex = 0;
  bool _detecting = false;
  bool _exporting = false;

  Offset? _dragStart;
  Offset? _dragCurrent;
  Size _viewportSize = Size.zero;

  @override
  void initState() {
    super.initState();
    _open();
  }

  Future<void> _open() async {
    final doc = await PdfDocument.openFile(widget.document.path);
    if (!mounted) return;
    setState(() => _pdf = doc);
  }

  @override
  void dispose() {
    _pdf?.dispose();
    super.dispose();
  }

  Future<void> _runSmartDetection() async {
    final pdf = _pdf;
    if (pdf == null || _detecting) return;
    setState(() => _detecting = true);
    try {
      final page = pdf.pages[_pageIndex];
      final rendered = await RedactionEngine.renderPagePng(page, scale: 2);
      if (rendered == null) return;
      final rects = await RedactionEngine.detectPii(
        page: page,
        pngBytes: rendered.bytes,
        imageSize: rendered.size,
      );
      if (!mounted) return;
      setState(() {
        _redactions.addAll(
          rects.map(
            (r) => RedactionRect(
              pageIndex: _pageIndex,
              rect: r,
              style: _style,
            ),
          ),
        );
      });
      await HapticService.success();
      if (rects.isEmpty) await HapticService.warning();
    } finally {
      if (mounted) setState(() => _detecting = false);
    }
  }

  void _undo() {
    if (_redactions.isEmpty) return;
    setState(() => _redactions.removeLast());
    HapticService.selection();
  }

  Future<void> _handleExport() async {
    await HapticService.medium();
    if (!mounted) return;
    final manager = context.read<SubscriptionManager>();
    if (!manager.isSubscribed) {
      final granted = await manager.requestExportAccess();
      if (!granted) {
        if (!mounted) return;
        final ok = await showModalBottomSheet<bool>(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => const FractionallySizedBox(
            heightFactor: 0.92,
            child: PaywallScreen(),
          ),
        );
        if (ok != true) return;
      }
    }
    if (!mounted) return;
    await _performExport();
  }

  Future<void> _performExport() async {
    final pdf = _pdf;
    if (pdf == null) return;
    setState(() => _exporting = true);
    try {
      final file = await RedactionEngine.burnAndFlatten(
        document: pdf,
        redactions: List.of(_redactions),
      );
      if (file == null) {
        await HapticService.error();
        return;
      }
      await HapticService.success();
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf')],
          subject: 'Redacted ${widget.document.title}',
        ),
      );
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  /// Convert overlay drag (top-left view coords) into PDF page rect.
  ui.Rect _viewRectToPdf(ui.Rect viewRect, Size pageSize, Size viewSize) {
    final scale = viewSize.width / pageSize.width;
    final contentHeight = pageSize.height * scale;
    final yOffset = (viewSize.height - contentHeight) / 2;

    final left = viewRect.left / scale;
    final width = viewRect.width / scale;
    final topFromView = (viewRect.top - yOffset) / scale;
    final height = viewRect.height / scale;

    // PDF origin is bottom-left
    final bottom = pageSize.height - topFromView - height;
    final top = bottom + height;
    return ui.Rect.fromLTRB(left, bottom, left + width, top);
  }

  ui.Rect _pdfRectToView(ui.Rect pdfRect, Size pageSize, Size viewSize) {
    final scale = viewSize.width / pageSize.width;
    final contentHeight = pageSize.height * scale;
    final yOffset = (viewSize.height - contentHeight) / 2;

    final left = pdfRect.left * scale;
    final width = pdfRect.width * scale;
    final topFromPdf = pageSize.height - pdfRect.top;
    final top = yOffset + topFromPdf * scale;
    final height = pdfRect.height * scale;
    return ui.Rect.fromLTWH(left, top, width, height);
  }

  @override
  Widget build(BuildContext context) {
    final pdf = _pdf;
    final pageRedactions =
        _redactions.where((r) => r.pageIndex == _pageIndex).toList();

    return Scaffold(
      backgroundColor: AppleDS.surface,
      appBar: AppBar(
        backgroundColor: AppleDS.surface,
        leading: TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text('Cancel', style: AppleDS.body),
        ),
        leadingWidth: 88,
        title: Text(
          widget.document.title,
          style: AppleDS.footnoteMedium,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: FilledButton(
              onPressed: (_exporting || pdf == null) ? null : _handleExport,
              style: FilledButton.styleFrom(
                backgroundColor: AppleDS.accent,
                foregroundColor: Colors.white,
                shape: const StadiumBorder(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              child: const Text('Export'),
            ),
          ),
        ],
      ),
      body: Stack(
        children: [
          if (pdf == null)
            const Center(child: CircularProgressIndicator())
          else
            Column(
              children: [
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      _viewportSize = Size(
                        constraints.maxWidth,
                        constraints.maxHeight,
                      );
                      final page = pdf.pages[_pageIndex];
                      final pageSize = Size(page.width, page.height);

                      return Stack(
                        children: [
                          PdfViewer.file(
                            widget.document.path,
                            controller: _controller,
                            params: PdfViewerParams(
                              backgroundColor: AppleDS.surface,
                              onPageChanged: (pageNumber) {
                                if (pageNumber == null) return;
                                setState(() => _pageIndex = pageNumber - 1);
                              },
                            ),
                          ),
                          // Drawing overlay — only when manual mode
                          if (_mode == RedactionMode.manual)
                            Positioned.fill(
                              child: GestureDetector(
                                behavior: HitTestBehavior.translucent,
                                onPanStart: (d) {
                                  setState(() {
                                    _dragStart = d.localPosition;
                                    _dragCurrent = d.localPosition;
                                  });
                                },
                                onPanUpdate: (d) {
                                  setState(() => _dragCurrent = d.localPosition);
                                },
                                onPanEnd: (_) {
                                  if (_dragStart == null || _dragCurrent == null) {
                                    return;
                                  }
                                  final viewRect = ui.Rect.fromPoints(
                                    _dragStart!,
                                    _dragCurrent!,
                                  );
                                  if (viewRect.width > 4 && viewRect.height > 4) {
                                    final pdfRect = _viewRectToPdf(
                                      viewRect,
                                      pageSize,
                                      _viewportSize,
                                    );
                                    setState(() {
                                      _redactions.add(
                                        RedactionRect(
                                          pageIndex: _pageIndex,
                                          rect: pdfRect,
                                          style: _style,
                                        ),
                                      );
                                    });
                                    HapticService.light();
                                  }
                                  setState(() {
                                    _dragStart = null;
                                    _dragCurrent = null;
                                  });
                                },
                                child: CustomPaint(
                                  painter: _RedactionPainter(
                                    redactions: pageRedactions
                                        .map(
                                          (r) => (
                                            rect: _pdfRectToView(
                                              r.rect,
                                              pageSize,
                                              _viewportSize,
                                            ),
                                            style: r.style,
                                          ),
                                        )
                                        .toList(),
                                    draft: (_dragStart != null &&
                                            _dragCurrent != null)
                                        ? ui.Rect.fromPoints(
                                            _dragStart!,
                                            _dragCurrent!,
                                          )
                                        : null,
                                    draftStyle: _style,
                                  ),
                                ),
                              ),
                            )
                          else
                            IgnorePointer(
                              child: CustomPaint(
                                size: _viewportSize,
                                painter: _RedactionPainter(
                                  redactions: pageRedactions
                                      .map(
                                        (r) => (
                                          rect: _pdfRectToView(
                                            r.rect,
                                            pageSize,
                                            _viewportSize,
                                          ),
                                          style: r.style,
                                        ),
                                      )
                                      .toList(),
                                  draft: null,
                                  draftStyle: _style,
                                ),
                              ),
                            ),
                        ],
                      );
                    },
                  ),
                ),
                AppleFloatingToolbar(
                  child: Row(
                    children: [
                      Expanded(
                        child: SegmentedButton<RedactionMode>(
                          segments: [
                            for (final mode in RedactionMode.values)
                              ButtonSegment(
                                value: mode,
                                label: Text(
                                  mode.label,
                                  style: const TextStyle(fontSize: 11),
                                ),
                              ),
                          ],
                          selected: {_mode},
                          onSelectionChanged: (s) {
                            final next = s.first;
                            setState(() => _mode = next);
                            HapticService.selection();
                            if (next == RedactionMode.smart) {
                              _runSmartDetection();
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      PopupMenuButton<RedactionStyle>(
                        tooltip: 'Style',
                        onSelected: (s) {
                          setState(() => _style = s);
                          HapticService.selection();
                        },
                        itemBuilder: (_) => [
                          for (final s in RedactionStyle.values)
                            PopupMenuItem(
                              value: s,
                              child: Row(
                                children: [
                                  CircleAvatar(
                                    radius: 8,
                                    backgroundColor: s.previewColor,
                                  ),
                                  const SizedBox(width: 10),
                                  Text(s.label),
                                ],
                              ),
                            ),
                        ],
                        child: Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: _style.previewColor,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppleDS.separator),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        '${_redactions.length} Redactions',
                        style: AppleDS.captionMedium,
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: _redactions.isEmpty ? null : _undo,
                        icon: Icon(
                          Icons.undo_rounded,
                          color: _redactions.isEmpty
                              ? AppleDS.labelQuaternary
                              : AppleDS.labelPrimary.withValues(alpha: 0.85),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          if (_detecting)
            const AppleLoadingOverlay(message: 'Scanning for sensitive data…'),
          if (_exporting)
            const AppleLoadingOverlay(message: 'Flattening & sanitizing…'),
        ],
      ),
    );
  }
}

class _RedactionPainter extends CustomPainter {
  _RedactionPainter({
    required this.redactions,
    required this.draft,
    required this.draftStyle,
  });

  final List<({ui.Rect rect, RedactionStyle style})> redactions;
  final ui.Rect? draft;
  final RedactionStyle draftStyle;

  @override
  void paint(Canvas canvas, Size size) {
    for (final item in redactions) {
      _paintRect(canvas, item.rect, item.style);
    }
    if (draft != null) {
      _paintRect(canvas, draft!, draftStyle);
    }
  }

  void _paintRect(Canvas canvas, ui.Rect rect, RedactionStyle style) {
    final paint = Paint();
    switch (style) {
      case RedactionStyle.black:
        paint.color = Colors.black;
      case RedactionStyle.white:
        paint.color = Colors.white;
      case RedactionStyle.blur:
        paint.color = Colors.black.withValues(alpha: 0.35);
    }
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(covariant _RedactionPainter oldDelegate) => true;
}
