/**
 * Dandiya Ticket Verification System - Frontend Logic
 * Standalone HTTPS Frontend for GitHub Pages & Mobile Web
 */

(function () {
  'use strict';

  // Configuration Constants
  const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbz9asD_F3ZM9wtowg-Qcbk7YBskBkdnlFx1sIQfNGCTRxmXb2gTMcITGPwFy2m1tg0o/exec';
  const STORAGE_KEY_API = 'dandiya_api_url';
  const STORAGE_KEY_AUDIO = 'dandiya_audio_enabled';

  // State Variables
  let html5Qrcode = null;
  let currentCameraId = null;
  let isScanning = false;
  let currentTicketData = null; // Stores currently loaded ticket details
  let lastScannedToken = null;
  let audioEnabled = true;
  let torchOn = false;

  // DOM Elements
  const sections = {
    scanning: document.getElementById('scanning-section'),
    loading: document.getElementById('loading-section'),
    valid: document.getElementById('valid-section'),
    checkedIn: document.getElementById('checked-in-section'),
    used: document.getElementById('used-section'),
    invalid: document.getElementById('invalid-section'),
    cameraError: document.getElementById('camera-error-section')
  };

  const elements = {
    cameraSelect: document.getElementById('camera-select'),
    torchBtn: document.getElementById('torch-toggle-btn'),
    audioToggleBtn: document.getElementById('audio-toggle-btn'),
    audioIcon: document.getElementById('audio-icon'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    resetApiUrlBtn: document.getElementById('reset-api-url-btn'),
    apiUrlInput: document.getElementById('api-url-input'),

    toggleManualBtn: document.getElementById('toggle-manual-btn'),
    manualContainer: document.getElementById('manual-input-container'),
    manualForm: document.getElementById('manual-token-form'),
    manualTokenInput: document.getElementById('manual-token-input'),

    // Valid state elements
    validName: document.getElementById('valid-name'),
    validTicketId: document.getElementById('valid-ticket-id'),
    validTicketType: document.getElementById('valid-ticket-type'),
    validEntry: document.getElementById('valid-entry'),
    checkinBtn: document.getElementById('checkin-btn'),

    // Checked-in state elements
    checkedName: document.getElementById('checked-name'),
    checkedTicketId: document.getElementById('checked-ticket-id'),
    checkedTicketType: document.getElementById('checked-ticket-type'),
    checkedEntry: document.getElementById('checked-entry'),

    // Used state elements
    usedName: document.getElementById('used-name'),
    usedTicketId: document.getElementById('used-ticket-id'),
    usedTicketType: document.getElementById('used-ticket-type'),
    usedMessage: document.getElementById('used-message'),

    // Invalid state elements
    invalidMessage: document.getElementById('invalid-message'),

    // Error state elements
    cameraErrorMessage: document.getElementById('camera-error-message'),
    retryCameraBtn: document.getElementById('retry-camera-btn'),
    fallbackManualBtn: document.getElementById('fallback-manual-btn'),

    scanAgainBtns: document.querySelectorAll('.scan-again-btn')
  };

  // Helper: Get active API URL
  function getApiUrl() {
    return localStorage.getItem(STORAGE_KEY_API) || DEFAULT_API_URL;
  }

  // View Switcher Helper
  function showView(targetSection) {
    Object.keys(sections).forEach(key => {
      if (sections[key] === targetSection) {
        sections[key].classList.remove('hidden');
        sections[key].classList.add('active');
      } else {
        sections[key].classList.add('hidden');
        sections[key].classList.remove('active');
      }
    });
  }

  /* ==========================================================================
     Audio & Sound Synthesizer (Web Audio API)
     ========================================================================== */
  function playSound(type) {
    if (!audioEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      if (type === 'valid' || type === 'success') {
        // High ascending chime
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

        osc2.frequency.setValueAtTime(880, ctx.currentTime); 
        osc2.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1); // D6

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.35);
        osc2.stop(ctx.currentTime + 0.35);
      } else if (type === 'warning' || type === 'used') {
        // Double low alert chime
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(330, ctx.currentTime + 0.12);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'error' || type === 'invalid') {
        // Low double buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.setValueAtTime(140, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  function triggerHaptic(type) {
    if ('vibrate' in navigator) {
      if (type === 'valid' || type === 'success') {
        navigator.vibrate(120);
      } else if (type === 'used') {
        navigator.vibrate([100, 80, 100]);
      } else if (type === 'invalid' || type === 'error') {
        navigator.vibrate([200, 100, 200]);
      }
    }
  }

  /* ==========================================================================
     QR Scanner Initialization & Controls
     ========================================================================== */
  async function initScanner() {
    showView(sections.scanning);

    if (html5Qrcode && isScanning) {
      try {
        await html5Qrcode.resume();
        return;
      } catch (e) {
        console.log('Resume failed, re-initializing...', e);
      }
    }

    try {
      if (!html5Qrcode) {
        html5Qrcode = new Html5Qrcode("qr-reader");
      }

      // Query cameras
      const devices = await Html5Qrcode.getCameras();
      populateCameraDropdown(devices);

      if (devices && devices.length > 0) {
        // Prefer rear camera
        let backCamera = devices.find(device => 
          device.label.toLowerCase().includes('back') || 
          device.label.toLowerCase().includes('rear') ||
          device.label.toLowerCase().includes('environment')
        );

        currentCameraId = backCamera ? backCamera.id : devices[0].id;
        elements.cameraSelect.value = currentCameraId;

        await startCamera(currentCameraId);
      } else {
        throw new Error('No camera devices found on this device.');
      }
    } catch (err) {
      console.error('Camera initialization error:', err);
      handleCameraError(err);
    }
  }

  function populateCameraDropdown(devices) {
    elements.cameraSelect.innerHTML = '';
    if (!devices || devices.length === 0) {
      elements.cameraSelect.innerHTML = '<option value="">No camera found</option>';
      return;
    }

    devices.forEach((device, idx) => {
      const option = document.createElement('option');
      option.value = device.id;
      option.textContent = device.label || `Camera ${idx + 1}`;
      elements.cameraSelect.appendChild(option);
    });
  }

  async function startCamera(cameraId) {
    if (!html5Qrcode) return;

    try {
      if (isScanning) {
        await html5Qrcode.stop();
        isScanning = false;
      }

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await html5Qrcode.start(
        cameraId ? cameraId : { facingMode: "environment" },
        config,
        onQrCodeScanned,
        onQrCodeError
      );

      isScanning = true;
      checkTorchSupport();
    } catch (err) {
      console.error('Failed to start camera stream:', err);
      handleCameraError(err);
    }
  }

  function checkTorchSupport() {
    try {
      const capabilities = html5Qrcode.getRunningTrackCapabilities();
      if (capabilities && capabilities.torch) {
        elements.torchBtn.classList.remove('hidden');
      } else {
        elements.torchBtn.classList.add('hidden');
      }
    } catch (e) {
      elements.torchBtn.classList.add('hidden');
    }
  }

  function handleCameraError(err) {
    isScanning = false;
    let msg = "Unable to access camera. Please allow camera permissions in browser settings.";
    if (err && err.message) {
      msg = err.message;
    } else if (typeof err === 'string') {
      msg = err;
    }
    elements.cameraErrorMessage.textContent = msg;
    showView(sections.cameraError);
  }

  /* ==========================================================================
     QR Scanning Callbacks & Handling
     ========================================================================== */
  function onQrCodeScanned(decodedText, decodedResult) {
    if (!decodedText || decodedText === lastScannedToken) {
      return; // Prevent duplicate trigger for same frame
    }

    // Pause scanning immediately so multiple requests aren't fired
    if (html5Qrcode && isScanning) {
      try {
        html5Qrcode.pause(true);
      } catch (e) {
        console.warn('Pause scanner error:', e);
      }
    }

    // Sanitize token (trim whitespace / trailing slashes if full URL was scanned)
    let token = decodedText.trim();

    // If QR contains a full URL with token query param or path, extract token
    if (token.includes('token=')) {
      try {
        const urlObj = new URL(token);
        token = urlObj.searchParams.get('token') || token;
      } catch (e) {}
    } else if (token.includes('/')) {
      const parts = token.split('/');
      token = parts[parts.length - 1];
    }

    lastScannedToken = token;
    verifyToken(token);
  }

  function onQrCodeError(errorMessage) {
    // Ignore routine frame read failures
  }

  /* ==========================================================================
     Backend API Communication (Apps Script Web App)
     ========================================================================== */
  async function verifyToken(token) {
    showView(sections.loading);
    document.getElementById('loading-title').textContent = 'Verifying Ticket...';
    document.getElementById('loading-desc').textContent = 'Checking database records...';

    const apiUrl = getApiUrl();
    const requestUrl = `${apiUrl}?action=verifyTicket&token=${encodeURIComponent(token)}&t=${Date.now()}`;

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();
      currentTicketData = { ...data, token: token };
      displayVerificationResult(data);

    } catch (error) {
      console.error('API Verification error:', error);
      playSound('error');
      triggerHaptic('error');

      elements.invalidMessage.textContent = 'Network or API Connection Error. Please check your internet connection and try again.';
      showView(sections.invalid);
    }
  }

  function displayVerificationResult(data) {
    const status = data.status ? data.status.toUpperCase() : (data.success ? 'VALID' : 'INVALID');

    if (status === 'VALID') {
      playSound('valid');
      triggerHaptic('valid');

      elements.validName.textContent = data.name || 'Guest';
      elements.validTicketId.textContent = data.ticketId || 'EVT-XXXX';
      elements.validTicketType.textContent = data.ticketType || 'Standard';
      elements.validEntry.textContent = data.entry || formatEntryRule(data.ticketType);

      // Reset Check-in button state
      elements.checkinBtn.disabled = false;
      elements.checkinBtn.querySelector('.btn-text').textContent = 'CHECK IN';
      elements.checkinBtn.querySelector('.btn-icon').textContent = '📥';

      showView(sections.valid);

    } else if (status === 'USED') {
      playSound('used');
      triggerHaptic('used');

      elements.usedName.textContent = data.name || '-';
      elements.usedTicketId.textContent = data.ticketId || '-';
      elements.usedTicketType.textContent = data.ticketType || '-';
      elements.usedMessage.textContent = data.message || 'This ticket has already been checked in.';

      showView(sections.used);

    } else if (status === 'INVALID' || status === 'REJECTED' || status === 'NOT_FOUND') {
      playSound('invalid');
      triggerHaptic('invalid');

      elements.invalidMessage.textContent = data.message || 'Ticket is invalid or payment has not been verified.';
      showView(sections.invalid);

    } else {
      playSound('invalid');
      triggerHaptic('invalid');

      elements.invalidMessage.textContent = data.message || 'Unknown response from ticket server.';
      showView(sections.invalid);
    }
  }

  function formatEntryRule(ticketType) {
    if (!ticketType) return '1 Person';
    const typeLower = ticketType.toLowerCase();
    if (typeLower.includes('couple')) return '2 People';
    if (typeLower.includes('stag')) return '1 Female';
    return '1 Person';
  }

  /* ==========================================================================
     Check-In Action Handler
     ========================================================================== */
  async function checkInTicket() {
    if (!currentTicketData || !currentTicketData.token) {
      alert('Error: Missing ticket token.');
      return;
    }

    // UI Loading state on button
    elements.checkinBtn.disabled = true;
    elements.checkinBtn.querySelector('.btn-text').textContent = 'Checking in...';
    elements.checkinBtn.querySelector('.btn-icon').textContent = '⏳';

    const apiUrl = getApiUrl();
    const token = currentTicketData.token;
    const requestUrl = `${apiUrl}?action=checkInTicket&token=${encodeURIComponent(token)}&t=${Date.now()}`;

    try {
      const response = await fetch(requestUrl, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }

      const data = await response.json();

      if (data.success || data.status === 'SUCCESS' || data.status === 'VALID') {
        playSound('success');
        triggerHaptic('success');

        elements.checkedName.textContent = data.name || currentTicketData.name || 'Guest';
        elements.checkedTicketId.textContent = data.ticketId || currentTicketData.ticketId || 'EVT-XXXX';
        elements.checkedTicketType.textContent = data.ticketType || currentTicketData.ticketType || 'Standard';
        elements.checkedEntry.textContent = data.entry || currentTicketData.entry || formatEntryRule(data.ticketType);

        showView(sections.checkedIn);
      } else {
        playSound('error');
        triggerHaptic('error');

        // Check-in failed (e.g. race condition where someone else checked in)
        elements.usedName.textContent = data.name || currentTicketData.name || '-';
        elements.usedTicketId.textContent = data.ticketId || currentTicketData.ticketId || '-';
        elements.usedTicketType.textContent = data.ticketType || currentTicketData.ticketType || '-';
        elements.usedMessage.textContent = data.message || 'Check-in failed. Ticket may have already been used.';

        showView(sections.used);
      }
    } catch (err) {
      console.error('Check-in network error:', err);
      playSound('error');
      triggerHaptic('error');
      alert('Network error while checking in ticket. Please try again.');
      
      elements.checkinBtn.disabled = false;
      elements.checkinBtn.querySelector('.btn-text').textContent = 'CHECK IN';
      elements.checkinBtn.querySelector('.btn-icon').textContent = '📥';
    }
  }

  /* ==========================================================================
     Resume & Reset Actions
     ========================================================================== */
  async function resetAndResumeScanner() {
    currentTicketData = null;
    lastScannedToken = null;
    showView(sections.scanning);

    if (html5Qrcode) {
      try {
        await html5Qrcode.resume();
      } catch (e) {
        // If resume fails, attempt restarting camera
        if (currentCameraId) {
          startCamera(currentCameraId);
        }
      }
    } else {
      initScanner();
    }
  }

  /* ==========================================================================
     Event Listeners Initialization
     ========================================================================== */
  function setupEventListeners() {
    // Camera Selection Dropdown
    elements.cameraSelect.addEventListener('change', (e) => {
      currentCameraId = e.target.value;
      if (currentCameraId) {
        startCamera(currentCameraId);
      }
    });

    // Torch Button
    elements.torchBtn.addEventListener('click', async () => {
      if (!html5Qrcode) return;
      try {
        torchOn = !torchOn;
        await html5Qrcode.applyVideoConstraints({ advanced: [{ torch: torchOn }] });
        elements.torchBtn.classList.toggle('active', torchOn);
      } catch (e) {
        console.warn('Torch toggle failed:', e);
      }
    });

    // Audio Sound Toggle
    const storedAudio = localStorage.getItem(STORAGE_KEY_AUDIO);
    audioEnabled = storedAudio !== null ? storedAudio === 'true' : true;
    updateAudioIcon();

    elements.audioToggleBtn.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      localStorage.setItem(STORAGE_KEY_AUDIO, audioEnabled.toString());
      updateAudioIcon();
    });

    function updateAudioIcon() {
      elements.audioIcon.textContent = audioEnabled ? '🔊' : '🔇';
    }

    // Manual Input Toggle
    elements.toggleManualBtn.addEventListener('click', () => {
      elements.manualContainer.classList.toggle('hidden');
      if (!elements.manualContainer.classList.contains('hidden')) {
        elements.manualTokenInput.focus();
      }
    });

    // Manual Form Submit
    elements.manualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const token = elements.manualTokenInput.value.trim();
      if (token) {
        elements.manualTokenInput.value = '';
        elements.manualContainer.classList.add('hidden');
        lastScannedToken = token;
        verifyToken(token);
      }
    });

    // Check In Button
    elements.checkinBtn.addEventListener('click', checkInTicket);

    // Scan Again Buttons (all instances across cards)
    elements.scanAgainBtns.forEach(btn => {
      btn.addEventListener('click', resetAndResumeScanner);
    });

    // Camera Retry Button
    elements.retryCameraBtn.addEventListener('click', initScanner);
    elements.fallbackManualBtn.addEventListener('click', () => {
      showView(sections.scanning);
      elements.manualContainer.classList.remove('hidden');
      elements.manualTokenInput.focus();
    });

    // Settings Modal Listeners
    elements.settingsBtn.addEventListener('click', () => {
      elements.apiUrlInput.value = getApiUrl();
      elements.settingsModal.classList.remove('hidden');
    });

    elements.closeSettingsBtn.addEventListener('click', () => {
      elements.settingsModal.classList.add('hidden');
    });

    elements.saveSettingsBtn.addEventListener('click', () => {
      const url = elements.apiUrlInput.value.trim();
      if (url) {
        localStorage.setItem(STORAGE_KEY_API, url);
        elements.settingsModal.classList.add('hidden');
        alert('API Web App URL updated successfully.');
      }
    });

    elements.resetApiUrlBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY_API);
      elements.apiUrlInput.value = DEFAULT_API_URL;
      alert('API Web App URL reset to default.');
    });
  }

  // Application Entry Point
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initScanner();
  });

})();
