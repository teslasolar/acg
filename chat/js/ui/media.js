/**
 * ACG Chat - Screen Sharing & Webcam Module
 * Uses getUserMedia / getDisplayMedia for local capture,
 * and P2P (trystero) streams for remote sharing.
 */
import { bus } from '../core/events.js';
import { getState } from '../core/state.js';

let _localStream = null;
let _screenStream = null;
let _visible = false;
let _remoteStreams = new Map(); // peerId → MediaStream

export function initMedia() {
  const panel = document.getElementById('media-panel');
  const toggle = document.getElementById('media-toggle');
  const closeBtn = document.getElementById('media-close');

  if (!panel || !toggle) return;

  toggle.addEventListener('click', () => {
    _visible = !_visible;
    panel.classList.toggle('open', _visible);
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      _visible = false;
      panel.classList.remove('open');
    });
  }

  // Wire buttons
  const camBtn = document.getElementById('media-cam-btn');
  const screenBtn = document.getElementById('media-screen-btn');
  const stopBtn = document.getElementById('media-stop-btn');

  if (camBtn) camBtn.addEventListener('click', startCamera);
  if (screenBtn) screenBtn.addEventListener('click', startScreenShare);
  if (stopBtn) stopBtn.addEventListener('click', stopAllStreams);

  // Listen for remote streams from P2P
  bus.on('media:remote-stream', onRemoteStream);
  bus.on('media:remote-stream-removed', onRemoteStreamRemoved);
}

async function startCamera() {
  try {
    if (_localStream) stopCamera();
    _localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true,
    });
    showLocalVideo(_localStream, 'camera');
    bus.emit('media:local-stream', { stream: _localStream, type: 'camera' });
    updateButtons();
  } catch (err) {
    console.error('[ACG Media] Camera error:', err);
    bus.emit('media:error', `Camera: ${err.message}`);
  }
}

async function startScreenShare() {
  try {
    if (_screenStream) stopScreenShare();
    _screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });
    // Handle user clicking "Stop sharing" in browser UI
    _screenStream.getVideoTracks()[0].addEventListener('ended', () => {
      stopScreenShare();
    });
    showLocalVideo(_screenStream, 'screen');
    bus.emit('media:local-stream', { stream: _screenStream, type: 'screen' });
    updateButtons();
  } catch (err) {
    if (err.name === 'NotAllowedError') return; // user cancelled
    console.error('[ACG Media] Screen share error:', err);
    bus.emit('media:error', `Screen: ${err.message}`);
  }
}

function stopCamera() {
  if (_localStream) {
    _localStream.getTracks().forEach(t => t.stop());
    _localStream = null;
    removeVideo('local-camera');
    bus.emit('media:stream-stopped', { type: 'camera' });
  }
  updateButtons();
}

function stopScreenShare() {
  if (_screenStream) {
    _screenStream.getTracks().forEach(t => t.stop());
    _screenStream = null;
    removeVideo('local-screen');
    bus.emit('media:stream-stopped', { type: 'screen' });
  }
  updateButtons();
}

function stopAllStreams() {
  stopCamera();
  stopScreenShare();
}

function showLocalVideo(stream, type) {
  const grid = document.getElementById('media-grid');
  if (!grid) return;

  const id = `local-${type}`;
  removeVideo(id);

  const wrapper = document.createElement('div');
  wrapper.className = 'media-tile';
  wrapper.id = id;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true; // mute local to avoid feedback
  video.playsInline = true;

  const label = document.createElement('div');
  label.className = 'media-tile-label';
  const user = getState().currentUser;
  label.textContent = `${user?.name || 'You'} (${type})`;

  wrapper.appendChild(video);
  wrapper.appendChild(label);
  grid.appendChild(wrapper);
}

function onRemoteStream({ peerId, stream, type }) {
  _remoteStreams.set(peerId, stream);

  const grid = document.getElementById('media-grid');
  if (!grid) return;

  const id = `remote-${peerId}`;
  removeVideo(id);

  const wrapper = document.createElement('div');
  wrapper.className = 'media-tile';
  wrapper.id = id;

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.playsInline = true;

  const label = document.createElement('div');
  label.className = 'media-tile-label';
  label.textContent = `Peer ${peerId.slice(0, 6)}… (${type || 'stream'})`;

  wrapper.appendChild(video);
  wrapper.appendChild(label);
  grid.appendChild(wrapper);
}

function onRemoteStreamRemoved({ peerId }) {
  _remoteStreams.delete(peerId);
  removeVideo(`remote-${peerId}`);
}

function removeVideo(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function updateButtons() {
  const camBtn = document.getElementById('media-cam-btn');
  const screenBtn = document.getElementById('media-screen-btn');
  const stopBtn = document.getElementById('media-stop-btn');

  if (camBtn) camBtn.textContent = _localStream ? 'Stop Camera' : 'Camera';
  if (screenBtn) screenBtn.textContent = _screenStream ? 'Stop Share' : 'Screen Share';
  if (stopBtn) stopBtn.style.display = (_localStream || _screenStream) ? '' : 'none';
}

export function getLocalStream() { return _localStream; }
export function getScreenStream() { return _screenStream; }
export function getRemoteStreams() { return _remoteStreams; }
export function getMediaVisible() { return _visible; }
