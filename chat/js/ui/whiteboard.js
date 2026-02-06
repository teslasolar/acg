/**
 * ACG Chat - Collaborative Whiteboard
 * Canvas-based drawing with tools (pen, eraser, shapes, text, color)
 * Syncs drawing operations over P2P via event bus.
 */
import { bus } from '../core/events.js';
import { getState } from '../core/state.js';
import { uuid } from '../core/crypto.js';

let _canvas, _ctx;
let _tool = 'pen';
let _color = '#e4e6ed';
let _lineWidth = 2;
let _drawing = false;
let _lastPoint = null;
let _history = [];      // local undo stack
let _visible = false;
let _shapeStart = null;  // for rectangle/ellipse start coords
let _snapshot = null;    // canvas snapshot before shape drag

const TOOLS = ['pen', 'eraser', 'line', 'rect', 'ellipse', 'text'];

export function initWhiteboard() {
  const panel = document.getElementById('whiteboard-panel');
  const toggle = document.getElementById('whiteboard-toggle');
  const closeBtn = document.getElementById('whiteboard-close');

  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    _visible = !_visible;
    panel.classList.toggle('open', _visible);
    if (_visible && !_canvas) setupCanvas();
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      _visible = false;
      panel.classList.remove('open');
    });
  }

  // Tool buttons
  panel.addEventListener('click', (e) => {
    const toolBtn = e.target.closest('[data-wb-tool]');
    if (toolBtn) {
      _tool = toolBtn.dataset.wbTool;
      panel.querySelectorAll('[data-wb-tool]').forEach(b => b.classList.remove('active'));
      toolBtn.classList.add('active');
    }

    if (e.target.id === 'wb-clear') {
      clearCanvas();
      bus.emit('whiteboard:clear', { id: uuid() });
    }
    if (e.target.id === 'wb-undo') undo();
  });

  // Color & width inputs
  const colorInput = document.getElementById('wb-color');
  const widthInput = document.getElementById('wb-width');
  if (colorInput) colorInput.addEventListener('input', (e) => { _color = e.target.value; });
  if (widthInput) widthInput.addEventListener('input', (e) => { _lineWidth = parseInt(e.target.value, 10) || 2; });

  // P2P incoming drawing events
  bus.on('whiteboard:draw-remote', applyRemoteDraw);
  bus.on('whiteboard:clear-remote', () => clearCanvas());
}

function setupCanvas() {
  const container = document.getElementById('wb-canvas-container');
  if (!container) return;

  _canvas = document.createElement('canvas');
  _canvas.id = 'wb-canvas';
  container.appendChild(_canvas);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  _ctx = _canvas.getContext('2d');
  _ctx.lineCap = 'round';
  _ctx.lineJoin = 'round';

  // Pointer events for drawing
  _canvas.addEventListener('pointerdown', onPointerDown);
  _canvas.addEventListener('pointermove', onPointerMove);
  _canvas.addEventListener('pointerup', onPointerUp);
  _canvas.addEventListener('pointerleave', onPointerUp);

  // Text tool click
  _canvas.addEventListener('dblclick', onDoubleClick);
}

function resizeCanvas() {
  if (!_canvas) return;
  const container = _canvas.parentElement;
  const snapshot = _ctx ? _ctx.getImageData(0, 0, _canvas.width, _canvas.height) : null;
  _canvas.width = container.clientWidth;
  _canvas.height = container.clientHeight;
  if (_ctx) {
    _ctx.lineCap = 'round';
    _ctx.lineJoin = 'round';
    if (snapshot) _ctx.putImageData(snapshot, 0, 0);
  }
}

function onPointerDown(e) {
  _drawing = true;
  const pt = getPoint(e);
  _lastPoint = pt;

  if (_tool === 'line' || _tool === 'rect' || _tool === 'ellipse') {
    _shapeStart = pt;
    _snapshot = _ctx.getImageData(0, 0, _canvas.width, _canvas.height);
  }
}

function onPointerMove(e) {
  if (!_drawing) return;
  const pt = getPoint(e);

  if (_tool === 'pen' || _tool === 'eraser') {
    const op = {
      id: uuid(),
      tool: _tool,
      color: _tool === 'eraser' ? '#0f1117' : _color,
      width: _tool === 'eraser' ? _lineWidth * 4 : _lineWidth,
      from: _lastPoint,
      to: pt,
    };
    drawLine(op);
    bus.emit('whiteboard:draw', op);
    _lastPoint = pt;
  } else if (_tool === 'line' || _tool === 'rect' || _tool === 'ellipse') {
    // Preview shape
    _ctx.putImageData(_snapshot, 0, 0);
    previewShape(_shapeStart, pt);
  }
}

function onPointerUp(e) {
  if (!_drawing) return;
  _drawing = false;

  if ((_tool === 'line' || _tool === 'rect' || _tool === 'ellipse') && _shapeStart) {
    const pt = getPoint(e);
    const op = {
      id: uuid(),
      tool: _tool,
      color: _color,
      width: _lineWidth,
      from: _shapeStart,
      to: pt,
    };
    // Restore snapshot then draw final shape
    _ctx.putImageData(_snapshot, 0, 0);
    drawShape(op);
    bus.emit('whiteboard:draw', op);
    _shapeStart = null;
    _snapshot = null;
  }

  _lastPoint = null;
  // Save history point
  if (_ctx) _history.push(_ctx.getImageData(0, 0, _canvas.width, _canvas.height));
  if (_history.length > 50) _history.shift();
}

function onDoubleClick(e) {
  if (_tool !== 'text') return;
  const pt = getPoint(e);
  const text = prompt('Enter text:');
  if (!text) return;

  const op = {
    id: uuid(),
    tool: 'text',
    color: _color,
    width: _lineWidth,
    to: pt,
    text,
  };
  drawText(op);
  bus.emit('whiteboard:draw', op);
}

function getPoint(e) {
  const rect = _canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

function toPixel(pt) {
  return { x: pt.x * _canvas.width, y: pt.y * _canvas.height };
}

function drawLine(op) {
  if (!_ctx) return;
  const from = toPixel(op.from);
  const to = toPixel(op.to);
  _ctx.strokeStyle = op.color;
  _ctx.lineWidth = op.width;
  _ctx.beginPath();
  _ctx.moveTo(from.x, from.y);
  _ctx.lineTo(to.x, to.y);
  _ctx.stroke();
}

function drawShape(op) {
  if (!_ctx) return;
  const from = toPixel(op.from);
  const to = toPixel(op.to);
  _ctx.strokeStyle = op.color;
  _ctx.lineWidth = op.width;

  if (op.tool === 'line') {
    _ctx.beginPath();
    _ctx.moveTo(from.x, from.y);
    _ctx.lineTo(to.x, to.y);
    _ctx.stroke();
  } else if (op.tool === 'rect') {
    _ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
  } else if (op.tool === 'ellipse') {
    const cx = (from.x + to.x) / 2;
    const cy = (from.y + to.y) / 2;
    const rx = Math.abs(to.x - from.x) / 2;
    const ry = Math.abs(to.y - from.y) / 2;
    _ctx.beginPath();
    _ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    _ctx.stroke();
  }
}

function previewShape(from, to) {
  const op = { tool: _tool, color: _color, width: _lineWidth, from, to };
  drawShape(op);
}

function drawText(op) {
  if (!_ctx) return;
  const pt = toPixel(op.to);
  _ctx.fillStyle = op.color;
  _ctx.font = `${Math.max(14, op.width * 6)}px sans-serif`;
  _ctx.fillText(op.text, pt.x, pt.y);
}

function applyRemoteDraw(op) {
  if (!_ctx) return;
  if (op.tool === 'pen' || op.tool === 'eraser') {
    drawLine(op);
  } else if (op.tool === 'text') {
    drawText(op);
  } else {
    drawShape(op);
  }
}

function clearCanvas() {
  if (!_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  _history = [];
}

function undo() {
  if (!_ctx || _history.length === 0) return;
  _history.pop(); // remove current
  if (_history.length > 0) {
    _ctx.putImageData(_history[_history.length - 1], 0, 0);
  } else {
    clearCanvas();
  }
}

export function getWhiteboardVisible() { return _visible; }
