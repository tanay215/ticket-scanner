/**
 * Dandiya Ticket Verification & Check-in Backend
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
 * Web App Entry Point: GET Requests
 * Accessible via HTTPS by external web scanner
 */
function doGet(e) {
  try {
    var action = e.parameter.action;
    var token = e.parameter.token;

    if (!token) {
      return createJsonResponse({
        status: 'INVALID',
        message: 'Missing ticket token parameter.'
      });
    }

    token = String(token).trim();

    if (action === 'checkInTicket') {
      return createJsonResponse(checkInTicket(token));
    } else {
      // Default action: verifyTicket
      return createJsonResponse(verifyTicket(token));
    }
  } catch (err) {
    return createJsonResponse({
      status: 'INVALID',
      message: 'Server Error: ' + err.toString()
    });
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

    if (!token) {
      return createJsonResponse({
        status: 'INVALID',
        message: 'Missing ticket token parameter.'
      });
    }

    token = String(token).trim();

    if (action === 'checkInTicket') {
      return createJsonResponse(checkInTicket(token));
    } else {
      return createJsonResponse(verifyTicket(token));
    }
  } catch (err) {
    return createJsonResponse({
      status: 'INVALID',
      message: 'Server Error: ' + err.toString()
    });
  }
}

/**
 * Helper to construct JSON response output
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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
 * 
 * Validation steps:
 * 1. Find QR Token in Column K
 * 2. If token does not exist -> INVALID ("Ticket not found in the ticket database.")
 * 3. If Payment Status is not PAID -> INVALID ("Payment has not been verified for this ticket.")
 * 4. If Checked In is YES -> USED ("This ticket has already been checked in.")
 * 5. If Payment Status == PAID and Checked In == NO -> VALID
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
  
  // Find matching row (skipping header row)
  var matchedRowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    var rowToken = String(data[i][COL_QR_TOKEN - 1]).trim();
    if (rowToken === token) {
      matchedRowIndex = i;
      break;
    }
  }

  // Token not found
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

  // Check Payment Status
  if (paymentStatus !== 'PAID') {
    return {
      status: 'INVALID',
      message: 'Payment has not been verified for this ticket.'
    };
  }

  // Check Checked In Status
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

  // Valid Ticket
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
 * 
 * Ensures Scanner A and Scanner B cannot both check in the same ticket simultaneously.
 */
function checkInTicket(token) {
  var lock = LockService.getScriptLock();
  
  // Wait up to 10 seconds to acquire script lock
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
    var matchedRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      var rowToken = String(data[i][COL_QR_TOKEN - 1]).trim();
      if (rowToken === token) {
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
    // Sheet row number is index + 1
    var sheetRowNumber = matchedRowIndex + 1;
    sheet.getRange(sheetRowNumber, COL_CHECKED_IN).setValue('YES');

    // Flush spreadsheet updates
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
    // Always release lock
    lock.releaseLock();
  }
}
