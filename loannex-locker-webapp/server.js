const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.json());

// Store active WebSocket connections
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Date.now().toString();
  clients.set(clientId, ws);
  ws.send(JSON.stringify({ type: 'connected', clientId }));
  
  ws.on('close', () => {
    clients.delete(clientId);
  });
});

function sendProgress(clientId, data) {
  const client = clients.get(clientId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

// Parse CSV and extract loan data
function parseCSV(csvContent) {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  return records.map((row, index) => {
    const get = (names) => {
      for (const name of names) {
        const key = Object.keys(row).find(k => 
          k.toLowerCase().replace(/[^a-z0-9]/g, '') === name.toLowerCase().replace(/[^a-z0-9]/g, '')
        );
        if (key && row[key]) return row[key];
      }
      return '';
    };
    
    const shouldLock = get(['lock', 'lock?', 'shouldlock']).toUpperCase() === 'X' || 
                       get(['lock', 'lock?', 'shouldlock']).toLowerCase() === 'yes';
    
    if (!shouldLock) return null;
    
    return {
      id: index,
      loanNumber: get(['loannumber', 'loan_number', 'loanid', 'loan']),
      targetRate: get(['rate', 'targetrate']),
      targetPrice: get(['price', 'targetprice']),
      investorName: get(['investorname', 'investor_name', 'investor']),
      productDescription: get(['productdescription', 'product_description', 'product']),
      lockDays: get(['lockdays', 'lock_days', 'lockperiod']),
      programName: get(['programname', 'program_name', 'program']),
      loanType: get(['loantype', 'loan_type']) || 'First Lien',
      citizenship: get(['citizenship']) || 'US Citizen',
      incomeDoc: get(['incomedoc', 'income_doc', 'incomedocumentation']),
      selfEmployed: get(['selfemployed', 'self_employed']) === 'true' || get(['selfemployed', 'self_employed']) === 'Yes',
      purpose: get(['purpose', 'loanpurpose']) || 'Purchase',
      firstTimeHomebuyer: get(['firsttimehomebuyer', 'ftb']) === 'true' || get(['firsttimehomebuyer', 'ftb']) === 'Yes',
      occupancy: get(['occupancy', 'occupancytype']),
      propertyType: get(['propertytype', 'property_type']),
      appraisedValue: get(['appraisedvalue', 'appraised_value', 'value']),
      purchasePrice: get(['purchaseprice', 'purchase_price']),
      loanAmount: get(['loanamount', 'loan_amount', 'firstlienamount', 'amount']),
      secondaryFinancing: get(['secondaryfinancing', 'secondary_financing']) || 'None',
      state: get(['state', 'propertystate']),
      county: get(['county', 'propertycounty']),
      ruralProperty: get(['ruralproperty', 'rural']) === 'true' || get(['ruralproperty', 'rural']) === 'Yes',
      fico: get(['fico', 'creditscore', 'credit_score']),
      noFico: get(['nofico', 'no_fico']) === 'true',
      dti: get(['dti', 'debttoincomeratio']),
      monthsReserves: get(['monthsreserves', 'reserves_months']),
      mortgageLates: get(['mortgagelates', 'mortgage_lates']) || '0x30x24',
      bankruptcy: get(['bankruptcy']) || 'None',
      foreclosure: get(['foreclosure']) || 'None',
      deedInLieu: get(['deedinlieu', 'deed_in_lieu']) || 'None',
      shortSale: get(['shortsale', 'short_sale']) || 'None',
      escrows: get(['escrows']) || 'Yes',
      temporaryBuydown: get(['temporarybuydown', 'buydown']) || 'None',
      borrowerFirstName: get(['borrowerfirstname', 'borrower first name', 'borrower_first_name']),
      borrowerLastName: get(['borrowerlastname', 'borrower last name', 'borrower_last_name']),
      coBorrowerFirstName: get(['coborrowerfirstname', 'co-borrower first name', 'coborrower_first_name']),
      coBorrowerLastName: get(['coborrowerlastname', 'co-borrower last name', 'coborrower_last_name']),
      propertyAddress: get(['subjectpropertyaddress', 'subject property address', 'property_address', 'address', 'street']),
      city: get(['city']),
      zip: get(['zip', 'zipcode', 'zip_code', 'postalcode']),
      originatorLoanNumber: get(['originatorloannumber', 'originator loan number', 'originator_loan_number']),
      universalLoanIdentifier: get(['universalloanidentifier', 'universal loan identifier', 'uli'])
    };
  }).filter(loan => loan !== null);
}

// Process a single loan on a given page
async function processSingleLoan(page, loan, loanIndex, totalLoans, clientId) {
  console.log(`[Tab] Processing loan ${loan.loanNumber}...`);
  
  sendProgress(clientId, { 
    type: 'progress', 
    current: loanIndex, 
    total: totalLoans, 
    loan: loan.loanNumber,
    message: `Processing ${loan.loanNumber}...`
  });
  
  try {
    // Navigate to NexApp
    await page.goto('https://dev.loannex.com/iframe/loadiframe?page=nex-app');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Get the iframe
    await page.waitForSelector('iframe', { timeout: 10000 });
    const frameElement = await page.$('iframe');
    const frame = frameElement ? await frameElement.contentFrame() : page;
    
    // Wait for form to be ready
    await frame.waitForSelector('[tabindex="1"]', { timeout: 10000 });
    console.log(`[${loan.loanNumber}] Form found, filling...`);
    sendProgress(clientId, { type: 'status', message: `Filling form for ${loan.loanNumber}...` });
    
    // Fill the loan form
    await fillLoanForm(frame, loan, page);
    sendProgress(clientId, { type: 'status', message: `Form filled for ${loan.loanNumber}` });
    
    // Click Get Price
    sendProgress(clientId, { type: 'status', message: `Getting price for ${loan.loanNumber}...` });
    await frame.click('button:has-text("Get Price")');
    await page.waitForTimeout(5000);
    
    // Clear target price filter
    const targetPriceInput = await frame.$('input[placeholder="Target Price"]');
    if (targetPriceInput) {
      await targetPriceInput.fill('');
      await page.waitForTimeout(2000);
    }
    
    // Find and click the correct Lock button
    sendProgress(clientId, { type: 'status', message: `Finding matching price for ${loan.loanNumber}...` });
    const locked = await findAndClickLock(frame, loan, page);
    
    if (locked) {
      // Fill lock form
      await page.waitForTimeout(2000);
      await fillLockForm(frame, loan, page);
      
      sendProgress(clientId, { type: 'success', loan: loan.loanNumber, message: 'Locked successfully' });
      return { loan: loan.loanNumber, status: 'success', message: 'Locked' };
    } else {
      sendProgress(clientId, { type: 'error', loan: loan.loanNumber, message: 'No matching price found' });
      return { loan: loan.loanNumber, status: 'error', message: 'Could not find matching price row' };
    }
    
  } catch (err) {
    console.error(`[${loan.loanNumber}] Error:`, err.message);
    sendProgress(clientId, { type: 'error', loan: loan.loanNumber, message: err.message });
    return { loan: loan.loanNumber, status: 'error', message: err.message };
  }
}

// Main automation function - PARALLEL VERSION
async function lockLoans(username, password, loans, clientId) {
  const PARALLEL_TABS = 3;
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const results = [];
  
  try {
    // Login once on initial page
    sendProgress(clientId, { type: 'status', message: 'Logging into LoanNex...' });
    
    const loginPage = await context.newPage();
    await loginPage.goto('https://dev.loannex.com');
    await loginPage.waitForLoadState('networkidle');
    
    // Fill login form
    await loginPage.fill('input[type="text"], input[name="username"], input[name="email"]', username);
    await loginPage.fill('input[type="password"]', password);
    
    // Click the Sign In button
    await loginPage.click('input#btnSubmit');
    
    // Wait for login to complete
    await loginPage.waitForTimeout(5000);
    await loginPage.waitForLoadState('networkidle');
    
    sendProgress(clientId, { type: 'status', message: 'Login successful! Starting parallel processing...' });
    
    // Close login page - session cookies are stored in context
    await loginPage.close();
    
    // Process loans in batches of PARALLEL_TABS
    for (let i = 0; i < loans.length; i += PARALLEL_TABS) {
      const batch = loans.slice(i, i + PARALLEL_TABS);
      const batchNum = Math.floor(i / PARALLEL_TABS) + 1;
      const totalBatches = Math.ceil(loans.length / PARALLEL_TABS);
      
      sendProgress(clientId, { 
        type: 'status', 
        message: `Processing batch ${batchNum} of ${totalBatches} (${batch.length} loans in parallel)...` 
      });
      
      // Create pages for this batch
      const pages = await Promise.all(
        batch.map(() => context.newPage())
      );
      
      // Process all loans in batch simultaneously
      const batchResults = await Promise.all(
        batch.map((loan, batchIndex) => 
          processSingleLoan(pages[batchIndex], loan, i + batchIndex, loans.length, clientId)
        )
      );
      
      results.push(...batchResults);
      
      // Close pages from this batch
      await Promise.all(pages.map(p => p.close()));
    }
    
  } catch (err) {
    console.error('Automation error:', err);
    sendProgress(clientId, { type: 'fatal', message: err.message });
  } finally {
    await browser.close();
  }
  
  return results;
}

// Fill the loan form with data
async function fillLoanForm(frame, loan, page) {
  console.log('Filling loan form...');
  
  // Helper to fill a dropdown (PrimeNG p-autocomplete or p-dropdown)
  async function fillDropdown(tabindex, value, waitAfter = 0) {
    if (!value) {
      return;
    }
    
    try {
      const element = await frame.$(`[tabindex="${tabindex}"]`);
      if (!element) {
        return;
      }
      
      // Click to focus and open dropdown
      await element.click();
      await frame.waitForTimeout(300);
      
      // Select all existing text and clear it
      await page.keyboard.press('Control+a');
      await frame.waitForTimeout(50);
      await page.keyboard.press('Backspace');
      await frame.waitForTimeout(100);
      
      // Type the value to filter
      await page.keyboard.type(value, { delay: 50 });
      await frame.waitForTimeout(500);
      
      // Look for matching option and click it
      const option = await frame.$(`li.p-autocomplete-item:has-text("${value}"), li.p-dropdown-item:has-text("${value}"), li:has-text("${value}")`);
      if (option) {
        await option.click();
      } else {
        await page.keyboard.press('Enter');
      }
      
      await frame.waitForTimeout(200 + waitAfter);
    } catch (err) {
      // Continue on error
    }
  }
  
  // Helper to fill a number field
  async function fillNumber(tabindex, value) {
    if (!value) {
      return;
    }
    
    try {
      const element = await frame.$(`[tabindex="${tabindex}"]`);
      if (!element) {
        return;
      }
      
      // Click to focus
      await element.click();
      await frame.waitForTimeout(100);
      
      // Select all and clear
      await page.keyboard.press('Control+a');
      await frame.waitForTimeout(50);
      
      // Type the value
      await page.keyboard.type(String(value), { delay: 30 });
      await frame.waitForTimeout(100);
      
      // Tab out to trigger validation
      await page.keyboard.press('Tab');
      await frame.waitForTimeout(100);
    } catch (err) {
      // Continue on error
    }
  }
  
  // Helper to set checkbox
  async function setCheckbox(tabindex, shouldBeChecked) {
    if (!shouldBeChecked) return;
    
    try {
      const element = await frame.$(`[tabindex="${tabindex}"]`);
      if (element) {
        await element.click();
      }
    } catch (err) {
      // Continue on error
    }
  }
  
  // Fill dropdowns in order
  await fillDropdown('1', loan.loanType);
  await fillDropdown('2', loan.citizenship);
  await fillDropdown('3', loan.incomeDoc, 300);
  await fillDropdown('5', loan.occupancy);
  await fillDropdown('9', loan.propertyType);
  
  // Fill number fields
  await fillNumber('12', loan.appraisedValue);
  await fillNumber('13', loan.purchasePrice);
  await fillNumber('14', loan.loanAmount);
  
  await fillDropdown('18', loan.secondaryFinancing);
  
  // State and County
  await fillDropdown('25', loan.state, 500);
  await fillDropdown('26', loan.county);
  
  // FICO, DTI, Reserves
  await fillNumber('27', loan.fico);
  await fillNumber('28', loan.dti);
  await fillNumber('30', loan.monthsReserves);
  
  // Credit history dropdowns
  await fillDropdown('31', loan.mortgageLates);
  await fillDropdown('32', loan.bankruptcy);
  await fillDropdown('34', loan.foreclosure);
  await fillDropdown('35', loan.deedInLieu);
  await fillDropdown('36', loan.shortSale);
  await fillDropdown('37', loan.escrows);
  await fillDropdown('38', loan.temporaryBuydown);
  
  // Checkboxes
  await setCheckbox('1002', loan.selfEmployed);
  await setCheckbox('1003', loan.firstTimeHomebuyer);
  await setCheckbox('1025', loan.ruralProperty);
  await setCheckbox('1026', loan.noFico);
  
  console.log('Form filling complete');
  await frame.waitForTimeout(500);
}

// Find the matching price row and click Lock
async function findAndClickLock(frame, loan, page) {
  const targetRate = parseFloat(loan.targetRate);
  const targetPrice = parseFloat(loan.targetPrice);
  const targetLockDays = String(loan.lockDays).trim();
  const targetProduct = loan.productDescription?.toLowerCase();
  const targetInvestor = loan.investorName?.toLowerCase();
  const targetProgram = loan.programName?.toLowerCase();
  
  // Get all table rows
  const rows = await frame.$$('tr.ng-star-inserted');
  
  for (const row of rows) {
    try {
      const cells = await row.$$('td');
      if (cells.length < 4) continue;
      
      // Cell 0: Rate + Lock Days
      const rateCell = await cells[0].textContent();
      const rateMatch = rateCell.match(/([0-9.]+)%/);
      const rowRate = rateMatch ? parseFloat(rateMatch[1]) : null;
      
      const lockDaysMatch = rateCell.match(/(\d+)\s*Days?/i);
      const rowLockDays = lockDaysMatch ? lockDaysMatch[1] : null;
      
      // Cell 1: Price
      const priceCell = await cells[1].textContent();
      const priceMatch = priceCell.match(/([0-9.]+)/);
      const rowPrice = priceMatch ? parseFloat(priceMatch[1]) : null;
      
      // Cell 2: Product
      const productCell = await cells[2].textContent();
      const rowProduct = productCell.toLowerCase();
      
      // Cell 3: Investor + Program
      const programCell = await cells[3].textContent();
      const rowInvestorProgram = programCell.toLowerCase();
      
      // Check all criteria
      const rateMatches = rowRate !== null && Math.abs(rowRate - targetRate) < 0.01;
      const priceMatches = rowPrice !== null && Math.abs(rowPrice - targetPrice) < 0.01;
      const lockDaysMatches = rowLockDays === targetLockDays;
      const productMatches = rowProduct.includes(targetProduct);
      const investorMatches = rowInvestorProgram.includes(targetInvestor);
      const programMatches = rowInvestorProgram.includes(targetProgram);
      
      if (rateMatches && priceMatches && lockDaysMatches && productMatches && investorMatches && programMatches) {
        // Found match - click Lock button
        const lockBtn = await row.$('button:has-text("Lock")');
        if (lockBtn) {
          await lockBtn.click();
          await page.waitForTimeout(2000);
          return true;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return false;
}

// Fill the lock form popup
async function fillLockForm(frame, loan, page) {
  try {
    console.log('Waiting for lock form popup...');
    
    await frame.waitForSelector('button:has-text("Submit Lock")', { timeout: 10000 });
    await page.waitForTimeout(1500);
    
    console.log('Lock form popup found, filling fields...');
    
    const results = await frame.evaluate((loanData) => {
      const logs = [];
      
      const lockFields = [
        { loanField: 'borrowerFirstName', formFor: 'borrowerFirstName' },
        { loanField: 'borrowerLastName', formFor: 'borrowerLastName' },
        { loanField: 'coBorrowerFirstName', formFor: 'coBorrowerFirstName' },
        { loanField: 'coBorrowerLastName', formFor: 'coBorrowerLastName' },
        { loanField: 'propertyAddress', formFor: 'address' },
        { loanField: 'city', formFor: 'city' },
        { loanField: 'zip', formFor: 'zipCode' },
        { loanField: 'originatorLoanNumber', formFor: 'loanNumber' },
        { loanField: 'universalLoanIdentifier', formFor: 'uli' }
      ];
      
      for (const field of lockFields) {
        const value = loanData[field.loanField];
        if (!value) {
          continue;
        }
        
        const label = document.querySelector(`label[for="${field.formFor}"]`);
        if (!label) {
          continue;
        }
        
        const container = label.closest('.flex.flex-col');
        const input = container?.querySelector('input');
        
        if (!input) {
          continue;
        }
        
        input.focus();
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.blur();
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        
        logs.push(`Filled ${field.formFor}: ${value}`);
      }
      
      return logs;
    }, loan);
    
    await page.waitForTimeout(500);
    
    // Click Submit Lock button
    console.log('Clicking Submit Lock...');
    const submitBtn = await frame.$('button:has-text("Submit Lock")');
    if (submitBtn) {
      await submitBtn.click();
      console.log('Submit Lock clicked!');
      await page.waitForTimeout(3000);
      
      try {
        await frame.waitForSelector('button:has-text("Submit Lock")', { 
          state: 'hidden', 
          timeout: 5000 
        });
        console.log('Lock submitted - popup closed');
      } catch (e) {
        console.log('Popup may still be open - continuing');
      }
    }
    
  } catch (e) {
    console.log('Error filling lock form:', e.message);
  }
}

// API endpoint to start locking process
app.post('/api/lock', upload.single('file'), async (req, res) => {
  const { username, password, clientId } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file required' });
  }
  
  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const loans = parseCSV(csvContent);
    
    if (loans.length === 0) {
      return res.status(400).json({ error: 'No loans marked for locking (Lock? column must be "X")' });
    }
    
    // Send immediate response with loan count
    res.json({ 
      message: 'Processing started', 
      loanCount: loans.length,
      loans: loans.map(l => ({
        loanNumber: l.loanNumber,
        rate: l.targetRate,
        price: l.targetPrice,
        investor: l.investorName,
        program: l.programName
      }))
    });
    
    // Start processing in background
    lockLoans(username, password, loans, clientId).then(results => {
      sendProgress(clientId, { type: 'complete', results });
    });
    
  } catch (err) {
    console.error('Error processing request:', err);
    res.status(500).json({ error: err.message });
  }
});

// Preview CSV without processing
app.post('/api/preview', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file required' });
  }
  
  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const loans = parseCSV(csvContent);
    
    res.json({ 
      loans: loans.map(l => ({
        loanNumber: l.loanNumber,
        rate: l.targetRate,
        price: l.targetPrice,
        investor: l.investorName,
        product: l.productDescription,
        lockDays: l.lockDays,
        program: l.programName,
        borrowerLastName: l.borrowerLastName,
        address: l.propertyAddress
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 LoanNex Bulk Locker running at http://localhost:${PORT}`);
});
