// DOM Elements
const credentialsSection = document.getElementById('credentialsSection');
const uploadSection = document.getElementById('uploadSection');
const previewSection = document.getElementById('previewSection');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');

const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const loanTableBody = document.getElementById('loanTableBody');
const loanCount = document.getElementById('loanCount');
const startBtn = document.getElementById('startBtn');
const changeFileBtn = document.getElementById('changeFileBtn');
const newBatchBtn = document.getElementById('newBatchBtn');

const progressCircle = document.getElementById('progressCircle');
const progressPercent = document.getElementById('progressPercent');
const progressStatus = document.getElementById('progressStatus');
const progressDetail = document.getElementById('progressDetail');
const logSection = document.getElementById('logSection');

const resultsIcon = document.getElementById('resultsIcon');
const resultsTitle = document.getElementById('resultsTitle');
const resultsSubtitle = document.getElementById('resultsSubtitle');
const resultsList = document.getElementById('resultsList');

let currentFile = null;
let loans = [];
let ws = null;
let clientId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  connectWebSocket();
});

function setupEventListeners() {
  // File upload
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);
  
  // Buttons
  startBtn.addEventListener('click', startLocking);
  changeFileBtn.addEventListener('click', resetToUpload);
  newBatchBtn.addEventListener('click', resetAll);
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(connectWebSocket, 2000);
  };
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'connected':
      clientId = data.clientId;
      break;
      
    case 'status':
      progressStatus.textContent = data.message;
      log(data.message, 'info');
      break;
      
    case 'progress':
      updateProgress(data.current, data.total);
      progressStatus.textContent = `Locking ${data.loan}...`;
      progressDetail.textContent = `${data.current} of ${data.total} complete`;
      break;
      
    case 'success':
      log(`✓ ${data.loan}: ${data.message}`, 'success');
      break;
      
    case 'error':
      log(`✗ ${data.loan}: ${data.message}`, 'error');
      break;
      
    case 'fatal':
      log(`Fatal error: ${data.message}`, 'error');
      showResults([{ status: 'error', message: data.message }]);
      break;
      
    case 'complete':
      showResults(data.results);
      break;
  }
}

function handleDrop(e) {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

async function processFile(file) {
  if (!file.name.endsWith('.csv')) {
    alert('Please upload a CSV file');
    return;
  }
  
  currentFile = file;
  
  // Show file name in upload zone
  dropZone.classList.add('has-file');
  dropZone.innerHTML = `
    <div class="upload-icon">✅</div>
    <div class="upload-text">File selected</div>
    <div class="file-name">${file.name}</div>
  `;
  
  // Preview the file
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    const response = await fetch('/api/preview', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.error) {
      alert(data.error);
      return;
    }
    
    loans = data.loans;
    renderLoans();
    showSection('preview');
    
  } catch (err) {
    console.error('Preview error:', err);
    alert('Error reading file: ' + err.message);
  }
}

function renderLoans() {
  loanCount.textContent = `${loans.length} loans ready to lock`;
  
  loanTableBody.innerHTML = loans.map(loan => `
    <tr>
      <td class="loan-number">${loan.loanNumber || '-'}</td>
      <td class="rate">${loan.rate || '-'}%</td>
      <td class="price">${loan.price || '-'}</td>
      <td>${truncate(loan.investor, 12)}</td>
      <td>${truncate(loan.product, 12)}</td>
      <td>${loan.lockDays || '-'}</td>
      <td>${truncate(loan.program, 12)}</td>
      <td>${truncate(loan.borrowerLastName, 10)}</td>
      <td>${truncate(loan.address, 15)}</td>
    </tr>
  `).join('');
}

function truncate(str, max) {
  if (!str) return '-';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

async function startLocking() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!username || !password) {
    alert('Please enter your LoanNex credentials');
    return;
  }
  
  if (!currentFile) {
    alert('Please upload a CSV file');
    return;
  }
  
  showSection('progress');
  logSection.innerHTML = '';
  updateProgress(0, loans.length);
  progressStatus.textContent = 'Starting...';
  progressDetail.textContent = '';
  
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);
  formData.append('clientId', clientId);
  formData.append('file', currentFile);
  
  try {
    const response = await fetch('/api/lock', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.error) {
      log(`Error: ${data.error}`, 'error');
      showResults([{ status: 'error', message: data.error }]);
      return;
    }
    
    log(`Processing ${data.loanCount} loans...`, 'info');
    
  } catch (err) {
    console.error('Lock error:', err);
    log(`Error: ${err.message}`, 'error');
    showResults([{ status: 'error', message: err.message }]);
  }
}

function updateProgress(current, total) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const circumference = 408; // 2 * PI * 65
  const offset = circumference - (percent / 100) * circumference;
  
  progressCircle.style.strokeDashoffset = offset;
  progressPercent.textContent = `${percent}%`;
}

function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logSection.appendChild(entry);
  logSection.scrollTop = logSection.scrollHeight;
}

function showResults(results) {
  showSection('results');
  
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed = results.length - succeeded;
  
  if (failed === 0 && succeeded > 0) {
    resultsIcon.textContent = '✅';
    resultsTitle.textContent = 'Complete!';
  } else if (succeeded === 0) {
    resultsIcon.textContent = '❌';
    resultsTitle.textContent = 'Failed';
  } else {
    resultsIcon.textContent = '⚠️';
    resultsTitle.textContent = 'Partial Success';
  }
  
  resultsSubtitle.textContent = `${succeeded} of ${results.length} loans locked`;
  
  resultsList.innerHTML = results.map(result => `
    <div class="result-item ${result.status}">
      <span>${result.status === 'success' ? '✓' : '✗'}</span>
      <span class="loan-id">${result.loan || 'Error'}</span>
      <span class="message">${result.message}</span>
    </div>
  `).join('');
}

function showSection(section) {
  // Hide all sections except credentials (always visible)
  uploadSection.classList.remove('active');
  previewSection.classList.remove('active');
  progressSection.classList.remove('active');
  resultsSection.classList.remove('active');
  
  switch (section) {
    case 'upload':
      uploadSection.classList.add('active');
      break;
    case 'preview':
      previewSection.classList.add('active');
      break;
    case 'progress':
      progressSection.classList.add('active');
      break;
    case 'results':
      resultsSection.classList.add('active');
      break;
  }
}

function resetToUpload() {
  currentFile = null;
  loans = [];
  fileInput.value = '';
  
  dropZone.classList.remove('has-file');
  dropZone.innerHTML = `
    <div class="upload-icon">📄</div>
    <div class="upload-text">
      Drop your CSV here<br>
      or <span class="link">click to browse</span>
    </div>
  `;
  
  showSection('upload');
}

function resetAll() {
  resetToUpload();
  // Don't clear credentials - user probably wants to lock more
}
