// LoanNex Bulk Locker - Client Application

let ws = null;
let clientId = null;
let selectedFile = null;

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const loanPreview = document.getElementById('loanPreview');
const previewBody = document.getElementById('previewBody');
const startBtn = document.getElementById('startBtn');
const progressSection = document.getElementById('progressSection');
const progressRing = document.getElementById('progressRing');
const progressPercent = document.getElementById('progressPercent');
const progressLabel = document.getElementById('progressLabel');
const progressStats = document.getElementById('progressStats');
const statusLog = document.getElementById('statusLog');
const resultsSection = document.getElementById('resultsSection');
const resultsList = document.getElementById('resultsList');

// Initialize WebSocket connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleMessage(data);
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(initWebSocket, 2000);
  };
}

// Handle incoming WebSocket messages
function handleMessage(data) {
  switch (data.type) {
    case 'connected':
      clientId = data.clientId;
      break;
      
    case 'status':
      addLogEntry(data.message);
      progressLabel.textContent = data.message;
      break;
      
    case 'progress':
      updateProgress(data.current, data.total);
      addLogEntry(data.message);
      break;
      
    case 'success':
      addLogEntry(`✓ ${data.loan}: ${data.message}`, 'success');
      break;
      
    case 'error':
      addLogEntry(`✗ ${data.loan}: ${data.message}`, 'error');
      break;
      
    case 'complete':
      showResults(data.results);
      break;
      
    case 'fatal':
      addLogEntry(`Fatal error: ${data.message}`, 'error');
      progressLabel.textContent = 'Error occurred';
      break;
  }
}

// Update progress ring
function updateProgress(current, total) {
  const percent = Math.round(((current + 1) / total) * 100);
  const circumference = 2 * Math.PI * 60; // r=60
  const offset = circumference - (percent / 100) * circumference;
  
  progressRing.style.strokeDashoffset = offset;
  progressPercent.textContent = `${percent}%`;
  progressStats.textContent = `${current + 1} of ${total}`;
}

// Add entry to status log
function addLogEntry(message, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-message">${message}</span>
  `;
  
  statusLog.appendChild(entry);
  statusLog.scrollTop = statusLog.scrollHeight;
}

// Show final results
function showResults(results) {
  resultsSection.classList.add('active');
  resultsList.innerHTML = '';
  
  results.forEach(result => {
    const item = document.createElement('div');
    item.className = `result-item ${result.status}`;
    item.innerHTML = `
      <div class="result-icon">${result.status === 'success' ? '✓' : '✗'}</div>
      <div class="result-details">
        <div class="result-loan">${result.loan}</div>
        <div class="result-message">${result.message}</div>
      </div>
    `;
    resultsList.appendChild(item);
  });
  
  progressLabel.textContent = 'Complete';
}

// File handling
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    handleFile(file);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  selectedFile = file;
  fileName.textContent = `📎 ${file.name}`;
  fileName.classList.remove('hidden');
  
  // Preview the file
  previewFile(file);
  
  checkReady();
}

async function previewFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.loans && data.loans.length > 0) {
      previewBody.innerHTML = '';
      
      data.loans.forEach(loan => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${loan.loanNumber || '-'}</td>
          <td>${loan.rate || '-'}</td>
          <td>${loan.price || '-'}</td>
          <td>${loan.investor || '-'}</td>
          <td>${loan.lockDays || '-'}</td>
        `;
        previewBody.appendChild(row);
      });
      
      loanPreview.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Preview error:', err);
  }
}

function checkReady() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  startBtn.disabled = !(username && password && selectedFile);
}

// Input listeners
document.getElementById('username').addEventListener('input', checkReady);
document.getElementById('password').addEventListener('input', checkReady);

// Start process
startBtn.addEventListener('click', async () => {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password || !selectedFile) return;
  
  // Show progress section
  progressSection.classList.add('active');
  resultsSection.classList.remove('active');
  statusLog.innerHTML = '';
  resultsList.innerHTML = '';
  
  // Reset progress
  progressRing.style.strokeDashoffset = 377;
  progressPercent.textContent = '0%';
  progressLabel.textContent = 'Starting...';
  progressStats.textContent = '0 of 0';
  
  startBtn.disabled = true;
  addLogEntry('Processing started...');
  
  // Send request
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('clientId', clientId);
  formData.append('file', selectedFile);
  
  try {
    const response = await fetch('/api/lock', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.error) {
      addLogEntry(`Error: ${data.error}`, 'error');
      startBtn.disabled = false;
    } else {
      addLogEntry(`Processing ${data.loanCount} loans...`);
    }
  } catch (err) {
    addLogEntry(`Error: ${err.message}`, 'error');
    startBtn.disabled = false;
  }
});

// Initialize
initWebSocket();
