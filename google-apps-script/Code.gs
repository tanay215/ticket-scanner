/**
 * Ticket Verification, Check-in & Automatic Ticket Generation Backend
 * Google Apps Script Web App
 * 
 * Google Sheet Tab Name: "dandiya"
 * Columns:
 * A (1)  : Timestamp
 * B (2)  : Full Name
 * C (3)  : Phone Number
 * D (4)  : Email Address
 * E (5)  : Ticket Type ("Couple", "Stag", etc.)
 * F (6)  : Upload Screenshot
 * G (7)  : UTR Number
 * H (8)  : Upload Screenshot (couple)
 * I (9)  : UTR Number (couple)
 * J (10) : Ticket ID ("EVT-0001", etc.)
 * K (11) : QR Token (UUID)
 * L (12) : Payment Status ("PENDING", "PAID", "REJECTED")
 * M (13) : Checked In ("NO", "YES")
 * N (14) : QR Code
 */

const SHEET_NAME = 'dandiya';

// Column Indices (1-based)
const COL_FULL_NAME      = 2;  // B
const COL_TICKET_TYPE    = 5;  // E
const COL_TICKET_ID      = 10; // J
const COL_QR_TOKEN       = 11; // K
const COL_PAYMENT_STATUS = 12; // L
const COL_CHECKED_IN     = 13; // M


/**
 * 0. Automatic Ticket Generator Trigger
 * Trigger: On Form Submit (or run on edit)
 */
function generateTicketData(e) {
  let sheet, row;
  if (e && e.range) {
    sheet = e.range.getSheet();
    row = e.range.getRow();
  } else {
    sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) return;
    row = sheet.getLastRow();
  }

  const ticketColumn = 10;    // J = Ticket ID
  const qrTokenColumn = 11;   // K = QR Token
  const paymentColumn = 12;   // L = Payment Status
  const checkedInColumn = 13; // M = Checked In
  const qrCodeColumn = 14;    // N = QR Code

  // 1. Generate Ticket ID (EVT-0001, EVT-0002, etc.)
  let ticketId = sheet.getRange(row, ticketColumn).getValue();
  if (!ticketId || !String(ticketId).startsWith("EVT-")) {
    const ticketNumber = row - 1;
    ticketId = "EVT-" + String(ticketNumber).padStart(4, "0");
    sheet.getRange(row, ticketColumn).setValue(ticketId);
  }

  // 2. Generate unique QR Token
  let qrToken = sheet.getRange(row, qrTokenColumn).getValue();
  if (!qrToken) {
    qrToken = Utilities.getUuid();
    sheet.getRange(row, qrTokenColumn).setValue(qrToken);
  }

  // 3. Set Payment Status to PENDING (if cell is empty)
  if (!sheet.getRange(row, paymentColumn).getValue()) {
    sheet.getRange(row, paymentColumn).setValue("PENDING");
  }

  // 4. Set Checked In to NO (if cell is empty)
  if (!sheet.getRange(row, checkedInColumn).getValue()) {
    sheet.getRange(row, checkedInColumn).setValue("NO");
  }

  // 5. Generate QR Code Formula
  const qrUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(qrToken) + "&size=300";
  sheet.getRange(row, qrCodeColumn).setFormula('=IMAGE("' + qrUrl + '")');
}


/**
 * Web App Entry Point: GET Requests
 * Supports external HTTPS fetch from GitHub Pages
 */
function doGet(e) {
  try {
    var action = e ? e.parameter.action : '';
    var token = e ? e.parameter.token : '';
    var callback = e ? e.parameter.callback : '';

    if (!token) {
      return createFormattedResponse({
        status: 'INVALID',
        message: 'Missing ticket token parameter.'
      }, callback);
    }

    token = String(token).trim();

    var result;
    if (action === 'checkInTicket') {
      result = checkInTicket(token);
    } else {
      // Default action: verifyTicket
      result = verifyTicket(token);
    }

    return createFormattedResponse(result, callback);

  } catch (err) {
    return createFormattedResponse({
      status: 'INVALID',
      message: 'Server Error: ' + err.toString()
    }, e ? e.parameter.callback : null);
  }
}

/**
 * Web App Entry Point: POST Requests (Fallback)
 */
function doPost(e) {
  try {
    var data = {};
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = e.parameter;
      }
    } else {
      data = e.parameter;
    }

    var action = data.action || e.parameter.action;
    var token = data.token || e.parameter.token;
    var callback = data.callback || e.parameter.callback;

    if (!token) {
      return createFormattedResponse({
        status: 'INVALID',
        message: 'Missing ticket token parameter.'
      }, callback);
    }

    token = String(token).trim();

    var result;
    if (action === 'checkInTicket') {
      result = checkInTicket(token);
    } else {
      result = verifyTicket(token);
    }

    return createFormattedResponse(result, callback);

  } catch (err) {
    return createFormattedResponse({
      status: 'INVALID',
      message: 'Server Error: ' + err.toString()
    }, e ? e.parameter.callback : null);
  }
}

/**
 * Formats response as JSON or JSONP based on callback parameter presence
 */
function createFormattedResponse(obj, callback) {
  var jsonString = JSON.stringify(obj);

  if (callback) {
    var safeCallback = String(callback).replace(/[^a-zA-Z0-9_.]/g, '');
    return ContentService.createTextOutput(safeCallback + '(' + jsonString + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(jsonString)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper to determine entry rule text based on Ticket Type
 */
function getEntryRule(ticketType) {
  if (!ticketType) return "1 Person";
  var typeStr = String(ticketType).trim().toLowerCase();
  
  if (typeStr.indexOf("couple") !== -1) {
    return "2 People";
  } else if (typeStr.indexOf("stag") !== -1) {
    return "1 Female";
  } else {
    return "1 Person";
  }
}

/**
 * 1. Verify Ticket Logic
 */
function verifyTicket(token) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return {
      status: 'INVALID',
      message: 'Sheet "' + SHEET_NAME + '" not found in spreadsheet.'
    };
  }

  var data = sheet.getDataRange().getValues();
  var tokenLower = token.toLowerCase();
  
  var matchedRowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    var rowToken = String(data[i][COL_QR_TOKEN - 1]).trim();
    if (rowToken.toLowerCase() === tokenLower) {
      matchedRowIndex = i;
      break;
    }
  }

  if (matchedRowIndex === -1) {
    return {
      status: 'INVALID',
      message: 'Ticket not found in the ticket database.'
    };
  }

  var matchedRow = data[matchedRowIndex];
  var name = String(matchedRow[COL_FULL_NAME - 1]).trim();
  var ticketId = String(matchedRow[COL_TICKET_ID - 1]).trim();
  var ticketType = String(matchedRow[COL_TICKET_TYPE - 1]).trim();
  var paymentStatus = String(matchedRow[COL_PAYMENT_STATUS - 1]).trim().toUpperCase();
  var checkedIn = String(matchedRow[COL_CHECKED_IN - 1]).trim().toUpperCase();
  var entryRule = getEntryRule(ticketType);

  if (paymentStatus !== 'PAID') {
    return {
      status: 'INVALID',
      message: 'Payment has not been verified for this ticket.'
    };
  }

  if (checkedIn === 'YES') {
    return {
      status: 'USED',
      message: 'This ticket has already been checked in.',
      name: name,
      ticketId: ticketId,
      ticketType: ticketType,
      entry: entryRule
    };
  }

  return {
    status: 'VALID',
    name: name,
    ticketId: ticketId,
    ticketType: ticketType,
    entry: entryRule
  };
}

/**
 * 2. Check-In Ticket Logic with LockService Concurrency Guard
 */
function checkInTicket(token) {
  var lock = LockService.getScriptLock();
  
  var success = lock.tryLock(10000);
  if (!success) {
    return {
      success: false,
      status: 'ERROR',
      message: 'Server busy handling concurrent check-ins. Please tap CHECK IN again.'
    };
  }

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return {
        success: false,
        status: 'INVALID',
        message: 'Sheet "' + SHEET_NAME + '" not found in spreadsheet.'
      };
    }

    var data = sheet.getDataRange().getValues();
    var tokenLower = token.toLowerCase();
    var matchedRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      var rowToken = String(data[i][COL_QR_TOKEN - 1]).trim();
      if (rowToken.toLowerCase() === tokenLower) {
        matchedRowIndex = i;
        break;
      }
    }

    if (matchedRowIndex === -1) {
      return {
        success: false,
        status: 'INVALID',
        message: 'Ticket not found in the ticket database.'
      };
    }

    var matchedRow = data[matchedRowIndex];
    var name = String(matchedRow[COL_FULL_NAME - 1]).trim();
    var ticketId = String(matchedRow[COL_TICKET_ID - 1]).trim();
    var ticketType = String(matchedRow[COL_TICKET_TYPE - 1]).trim();
    var paymentStatus = String(matchedRow[COL_PAYMENT_STATUS - 1]).trim().toUpperCase();
    var checkedIn = String(matchedRow[COL_CHECKED_IN - 1]).trim().toUpperCase();
    var entryRule = getEntryRule(ticketType);

    if (paymentStatus !== 'PAID') {
      return {
        success: false,
        status: 'INVALID',
        message: 'Payment has not been verified for this ticket.'
      };
    }

    if (checkedIn === 'YES') {
      return {
        success: false,
        status: 'USED',
        message: 'This ticket has already been checked in.',
        name: name,
        ticketId: ticketId,
        ticketType: ticketType,
        entry: entryRule
      };
    }

    // Update Checked In column (Column M, index 13) to "YES"
    var sheetRowNumber = matchedRowIndex + 1;
    sheet.getRange(sheetRowNumber, COL_CHECKED_IN).setValue('YES');

    SpreadsheetApp.flush();

    return {
      success: true,
      status: 'SUCCESS',
      name: name,
      ticketId: ticketId,
      ticketType: ticketType,
      entry: entryRule
    };

  } catch (err) {
    return {
      success: false,
      status: 'ERROR',
      message: 'Check-in error: ' + err.toString()
    };
  } finally {
    lock.releaseLock();
  }
}
