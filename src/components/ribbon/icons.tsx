/**
 * Значки ленты: короткое имя → значок lucide.
 *
 * Ленты объявляются данными и не должны тянуть за собой React — поэтому в
 * описании стоит строка, а сопоставление живёт здесь. Проверка состава лент
 * (scripts/test-ribbon.ts) сверяется с этим же списком: имя значка, которого
 * тут нет, — это отказ проверки, а не безымянный квадрат в панели.
 */
import React from 'react';
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Baseline, Highlighter,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, CheckSquare,
  Indent, Outdent, Type, Heading1, Heading2, Quote, Code, Search, Replace, Paintbrush,
  Table, Image as ImageIcon, Link2, Minus, Plus, CalendarClock, Star, Tag as TagIcon,
  FileText, Package, Database, RefreshCw, Eye, Scissors, Copy, ClipboardPaste,
  Subscript, Superscript, CaseSensitive, Rows3, Columns3, Combine, Split, Grid3x3,
  PaintBucket, MoveVertical, MoveHorizontal, StretchHorizontal, WrapText, ArrowUpToLine,
  ArrowDownToLine, Percent, Ruler, LayoutTemplate, FileStack, Stamp, Sigma, Filter,
  ArrowUpDown, Eraser, Maximize2, Columns2, ScrollText, PanelLeft, Pilcrow, SpellCheck,
  MessageSquarePlus, ChevronLeft, ChevronRight, Check, X, GitCompare, History,
  Hash, Bookmark, ListTree, Superscript as FootnoteIcon, Trash2, Layers, Boxes,
  Hand, MousePointer2, RotateCcw, RotateCw, Cloud, MoveUpRight, PenLine, Square,
  Circle, StickyNote, MessageSquare, Ruler as MeasureIcon, Crop, Files, Mail,
  ArrowDownWideNarrow, Sun, ZoomIn, Printer, Save, FolderOpen, Info, Braces,
  SquareStack, Link, Unlink, ChevronDown, MoreHorizontal, Lock, Sheet, ChartColumn,
} from 'lucide-react';

type IconCmp = React.ComponentType<{ className?: string }>;

const MAP: Record<string, IconCmp> = {
  undo: Undo2, redo: Redo2,
  bold: Bold, italic: Italic, underline: Underline, strike: Strikethrough,
  color: Baseline, highlight: Highlighter, case: CaseSensitive,
  sub: Subscript, sup: Superscript, font: Type,
  'align-left': AlignLeft, 'align-center': AlignCenter, 'align-right': AlignRight,
  'align-justify': AlignJustify,
  bullets: List, numbers: ListOrdered, checklist: CheckSquare,
  indent: Indent, outdent: Outdent, spacing: MoveVertical,
  h1: Heading1, h2: Heading2, quote: Quote, code: Code, style: Type,
  find: Search, replace: Replace, painter: Paintbrush, eraser: Eraser,
  table: Table, image: ImageIcon, link: Link2, unlink: Unlink, rule: Minus,
  plus: Plus, minus: Minus, date: CalendarClock, star: Star, tag: TagIcon,
  doc: FileText, equipment: Package, data: Database, refresh: RefreshCw, eye: Eye,
  cut: Scissors, copy: Copy, paste: ClipboardPaste,
  rows: Rows3, cols: Columns3, merge: Combine, split: Split, borders: Grid3x3,
  fill: PaintBucket, height: MoveVertical, width: MoveHorizontal,
  distribute: StretchHorizontal, wrap: WrapText, top: ArrowUpToLine, bottom: ArrowDownToLine,
  percent: Percent, ruler: Ruler, page: LayoutTemplate, pages: FileStack, stamp: Stamp,
  sum: Sigma, filter: Filter, sort: ArrowUpDown, fullscreen: Maximize2,
  twopage: Columns2, scroll: ScrollText, panel: PanelLeft, marks: Pilcrow,
  spell: SpellCheck, comment: MessageSquarePlus, prev: ChevronLeft, next: ChevronRight,
  accept: Check, reject: X, compare: GitCompare, history: History,
  hash: Hash, bookmark: Bookmark, toc: ListTree, footnote: FootnoteIcon,
  trash: Trash2, layers: Layers, blocks: Boxes,
  hand: Hand, pointer: MousePointer2, 'rotate-left': RotateCcw, 'rotate-right': RotateCw,
  cloud: Cloud, arrow: MoveUpRight, pen: PenLine, rect: Square, oval: Circle,
  note: StickyNote, callout: MessageSquare, measure: MeasureIcon, crop: Crop,
  files: Files, mail: Mail, extract: ArrowDownWideNarrow, invert: Sun, zoom: ZoomIn,
  print: Printer, save: Save, folder: FolderOpen, info: Info, formula: Braces,
  template: SquareStack, anchor: Link, more: MoreHorizontal, down: ChevronDown,
  lock: Lock, sheet: Sheet, chart: ChartColumn,
};

/** Есть ли такое имя значка — для проверки состава лент */
export const RIBBON_ICON_NAMES = Object.keys(MAP);

/** Значок по имени. Неизвестное имя даёт точку, а не пустоту */
export function ribbonIcon(name?: string): IconCmp {
  return (name && MAP[name]) || Circle;
}
