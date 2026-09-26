/**
 * Ticket Verification, Check-in, Automatic Ticket Generation & Email Dispatch System
 * Google Apps Script Web App & Spreadsheet Automation
 * 
 * Google Sheet Tab Name: "dandiya" (or automatically falls back to first sheet tab)
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
 * N (14) : QR Code Formula (=IMAGE("..."))
 * O (15) : Ticket Email ("NOT SENT", "SENT")
 */

const SHEET_NAME = 'dandiya';

// Column Indices (1-based)
const COL_TIMESTAMP      = 1;  // A
const COL_FULL_NAME      = 2;  // B
const COL_PHONE          = 3;  // C
const COL_EMAIL          = 4;  // D
const COL_TICKET_TYPE    = 5;  // E
const COL_SCREENSHOT1    = 6;  // F
const COL_UTR1           = 7;  // G
const COL_SCREENSHOT2    = 8;  // H
const COL_UTR2           = 9;  // I
const COL_TICKET_ID      = 10; // J
const COL_QR_TOKEN       = 11; // K
const COL_PAYMENT_STATUS = 12; // L
const COL_CHECKED_IN     = 13; // M
const COL_QR_CODE        = 14; // N
const COL_TICKET_EMAIL   = 15; // O


/**
 * Helper to safely acquire target Sheet tab
 * 1. Checks exact tab name "dandiya"
 * 2. Checks case-insensitive tab name "dandiya"
 * 3. Fallback: Returns the very first sheet tab in the spreadsheet
 */
function getTicketSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;

  // 1. Try exact match
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  // 2. Try case-insensitive match
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === SHEET_NAME.toLowerCase()) {
      return sheets[i];
    }
  }

  // 3. Fallback to first sheet tab
  return (sheets && sheets.length > 0) ? sheets[0] : null;
}


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
    sheet = getTicketSheet();
    if (!sheet) return;
    row = sheet.getLastRow();
  }

  const ticketColumn = COL_TICKET_ID;         // J (10)
  const qrTokenColumn = COL_QR_TOKEN;        // K (11)
  const paymentColumn = COL_PAYMENT_STATUS;  // L (12)
  const checkedInColumn = COL_CHECKED_IN;    // M (13)
  const qrCodeColumn = COL_QR_CODE;          // N (14)
  const ticketEmailColumn = COL_TICKET_EMAIL; // O (15)

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

  // 6. Set Ticket Email to NOT SENT (if cell is empty)
  if (!sheet.getRange(row, ticketEmailColumn).getValue()) {
    sheet.getRange(row, ticketEmailColumn).setValue("NOT SENT");
  }
}


/**
 * Installable Spreadsheet Edit Trigger
 * Reacts specifically to edits in Column L (Payment Status)
 */
function handlePaymentEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var editedSheet = getTicketSheet();
  if (!editedSheet || sheet.getName() !== editedSheet.getName()) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();

  // Skip header row
  if (row <= 1) return;

  // Check if edited column is Column L (12 = Payment Status)
  if (col !== COL_PAYMENT_STATUS) return;

  var val = String(e.range.getValue()).trim().toUpperCase();
  if (val === 'PAID') {
    generateAndSendTicket(row);
  }
}


/**
 * Generates PDF ticket and emails it to attendee if Column O is NOT SENT.
 * Idempotent & Concurrency Safe using LockService.
 */
function generateAndSendTicket(row) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(15000); // 15 second lock
  if (!acquired) {
    Logger.log('Could not acquire lock for row ' + row);
    return false;
  }

  try {
    var sheet = getTicketSheet();
    if (!sheet) return false;

    // Re-verify current cell values inside lock
    var paymentStatus = String(sheet.getRange(row, COL_PAYMENT_STATUS).getValue()).trim().toUpperCase();
    var ticketEmailStatus = String(sheet.getRange(row, COL_TICKET_EMAIL).getValue()).trim().toUpperCase();

    // Only process if Payment Status is PAID and Ticket Email is NOT SENT
    if (paymentStatus !== 'PAID') {
      Logger.log('Row ' + row + ' Payment Status is not PAID: ' + paymentStatus);
      return false;
    }

    if (ticketEmailStatus === 'SENT') {
      Logger.log('Row ' + row + ' Ticket Email already SENT. Skipping.');
      return false;
    }

    // Read attendee details
    var name = String(sheet.getRange(row, COL_FULL_NAME).getValue()).trim();
    var email = String(sheet.getRange(row, COL_EMAIL).getValue()).trim();
    var ticketId = String(sheet.getRange(row, COL_TICKET_ID).getValue()).trim();
    var qrToken = String(sheet.getRange(row, COL_QR_TOKEN).getValue()).trim();
    var ticketType = String(sheet.getRange(row, COL_TICKET_TYPE).getValue()).trim();
    var entryRule = getEntryRule(ticketType);

    if (!email) {
      Logger.log('Row ' + row + ' is missing email address. Cannot send ticket.');
      return false;
    }

    if (!qrToken) {
      Logger.log('Row ' + row + ' is missing QR Token. Cannot generate PDF.');
      return false;
    }

    // 1. Generate PDF Ticket
    var pdfBlob = createTicketPdfBlob({
      name: name || 'Valued Guest',
      ticketId: ticketId || 'EVT-0000',
      ticketType: ticketType || 'Standard',
      entry: entryRule,
      qrToken: qrToken
    });

    // 2. Prepare Email Content
    var subject = "Your Dandiya Event Ticket - " + (ticketId || 'EVT-0000');
    var plainBody = 
      "Hello " + (name || 'Guest') + ",\n\n" +
      "Your payment has been verified successfully.\n\n" +
      "Your Dandiya event ticket is attached to this email.\n\n" +
      "Ticket ID: " + ticketId + "\n" +
      "Ticket Type: " + ticketType + "\n" +
      "Entry: " + entryRule + "\n\n" +
      "Please keep the ticket ready on your phone and present the QR code at the entrance.\n\n" +
      "See you at the event!\n\n" +
      "Dandiya Team";

    var htmlBody = 
      "<div style='font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;'>" +
      "  <div style='background: linear-gradient(135deg, #F59E0B 0%, #E11D48 100%); padding: 24px; text-align: center; color: #fff;'>" +
      "    <h1 style='margin: 0; font-size: 24px;'>DANDIYA EVENT</h1>" +
      "    <p style='margin: 4px 0 0 0; opacity: 0.9;'>Official Entry Ticket</p>" +
      "  </div>" +
      "  <div style='padding: 24px; background: #ffffff;'>" +
      "    <p style='font-size: 16px;'>Hello <strong>" + escapeHtml(name || 'Guest') + "</strong>,</p>" +
      "    <p>Your payment has been verified successfully! Your event entry ticket is attached to this email as a PDF document.</p>" +
      "    <div style='background: #f9fafb; border-left: 4px solid #F59E0B; padding: 16px; margin: 20px 0; border-radius: 4px;'>" +
      "      <p style='margin: 0 0 8px 0;'><strong>Ticket ID:</strong> <code style='font-size: 15px; background: #eef2ff; padding: 2px 6px; border-radius: 4px;'>" + escapeHtml(ticketId) + "</code></p>" +
      "      <p style='margin: 0 0 8px 0;'><strong>Ticket Type:</strong> " + escapeHtml(ticketType) + "</p>" +
      "      <p style='margin: 0;'><strong>Admit Limit:</strong> <span style='color: #059669; font-weight: bold;'>" + escapeHtml(entryRule) + "</span></p>" +
      "    </div>" +
      "    <p>Please present the QR code on the attached PDF at the entrance on your mobile phone screen.</p>" +
      "    <p style='margin-top: 24px;'>See you at the event!<br><strong>Dandiya Team</strong></p>" +
      "  </div>" +
      "</div>";

    // 3. Send Email with PDF Attachment
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      attachments: [pdfBlob]
    });

    // 4. Mark Column O (Ticket Email) as SENT
    sheet.getRange(row, COL_TICKET_EMAIL).setValue('SENT');
    SpreadsheetApp.flush();

    Logger.log('Successfully sent ticket email to ' + email + ' for row ' + row);
    return true;

  } catch (err) {
    Logger.log('Error generating or sending ticket email for row ' + row + ': ' + err.toString());
    return false;
  } finally {
    lock.releaseLock();
  }
}


/**
 * Helper to fetch QR image as base64 string for inline HTML PDF rendering
 */
function getQrBase64(qrToken) {
  try {
    var qrUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(qrToken) + "&size=300";
    var response = UrlFetchApp.fetch(qrUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      var blob = response.getBlob();
      var base64 = Utilities.base64Encode(blob.getBytes());
      return "data:image/png;base64," + base64;
    }
  } catch (e) {
    Logger.log("Error fetching QR image base64: " + e.toString());
  }
  return "https://quickchart.io/qr?text=" + encodeURIComponent(qrToken) + "&size=300";
}


/**
 * Creates HTML template and converts it to a PDF Blob
 */
function createTicketPdfBlob(data) {
  var qrImageSrc = getQrBase64(data.qrToken);

  var htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #1f2937;
          background-color: #ffffff;
        }
        .ticket-card {
          width: 500px;
          margin: 0 auto;
          border: 2px solid #e5e7eb;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          background: #ffffff;
        }
        .ticket-header {
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
          color: #ffffff;
          padding: 24px;
          text-align: center;
        }
        .event-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: 1px;
          margin: 0 0 4px 0;
          color: #f59e0b;
        }
        .event-subtitle {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0;
          color: #cbd5e1;
        }
        .ticket-body {
          padding: 28px;
          text-align: center;
        }
        .qr-wrapper {
          margin: 0 auto 20px auto;
          width: 220px;
          height: 220px;
          padding: 12px;
          background: #ffffff;
          border: 2px solid #f3f4f6;
          border-radius: 12px;
        }
        .qr-wrapper img {
          width: 200px;
          height: 200px;
        }
        .entry-badge {
          display: inline-block;
          background: #059669;
          color: #ffffff;
          font-size: 16px;
          font-weight: bold;
          padding: 6px 18px;
          border-radius: 20px;
          margin-bottom: 20px;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          text-align: left;
        }
        .details-table td {
          padding: 10px 14px;
          border-bottom: 1px solid #f3f4f6;
          font-size: 14px;
        }
        .details-table td.label {
          color: #6b7280;
          font-weight: 600;
          width: 40%;
        }
        .details-table td.value {
          color: #111827;
          font-weight: bold;
          width: 60%;
          text-align: right;
        }
        .notice {
          font-size: 12px;
          color: #6b7280;
          background-color: #f9fafb;
          padding: 12px;
          border-radius: 8px;
          border: 1px dashed #d1d5db;
        }
      </style>
    </head>
    <body>
      <div class="ticket-card">
        <div class="ticket-header">
          <h1 class="event-title">DANDIYA EVENT</h1>
          <p class="event-subtitle">Official Entry Pass</p>
        </div>
        <div class="ticket-body">
          <div class="qr-wrapper">
            <img src="${qrImageSrc}" alt="Ticket QR Code" />
          </div>
          <div class="entry-badge">Admit: ${escapeHtml(data.entry)}</div>
          
          <table class="details-table">
            <tr>
              <td class="label">Attendee Name</td>
              <td class="value">${escapeHtml(data.name)}</td>
            </tr>
            <tr>
              <td class="label">Ticket ID</td>
              <td class="value">${escapeHtml(data.ticketId)}</td>
            </tr>
            <tr>
              <td class="label">Ticket Type</td>
              <td class="value">${escapeHtml(data.ticketType)}</td>
            </tr>
          </table>
          
          <div class="notice">
            📌 Please present this QR code at the event entrance on your mobile phone screen.
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  var htmlOutput = HtmlService.createHtmlOutput(htmlContent);
  var pdfBlob = htmlOutput.getAs('application/pdf');
  pdfBlob.setName("Dandiya-Ticket-" + (data.ticketId || "PASS") + ".pdf");
  return pdfBlob;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  var tStart = Date.now();
  var sheet = getTicketSheet();
  if (!sheet) {
    return {
      status: 'INVALID',
      message: 'Spreadsheet tab not found in ticket database.'
    };
  }

  var tSheet = Date.now();
  
  // O(1) lookup using TextFinder instead of pulling all rows into memory
  var finder = sheet.getRange(1, COL_QR_TOKEN, sheet.getLastRow() || 1, 1)
                    .createTextFinder(token)
                    .matchEntireCell(true)
                    .matchCase(false);
  var match = finder.findNext();
  
  var tFind = Date.now();

  if (!match) {
    Logger.log("Verify: Token not found. Time: " + (tFind - tStart) + "ms");
    return {
      status: 'INVALID',
      message: 'Ticket not found in the ticket database.'
    };
  }

  var row = match.getRow();
  
  // Fetch only this specific row up to the Checked In column
  var maxColNeeded = Math.max(COL_FULL_NAME, COL_TICKET_ID, COL_TICKET_TYPE, COL_PAYMENT_STATUS, COL_CHECKED_IN);
  var matchedRow = sheet.getRange(row, 1, 1, maxColNeeded).getValues()[0];
  
  var name = String(matchedRow[COL_FULL_NAME - 1]).trim();
  var ticketId = String(matchedRow[COL_TICKET_ID - 1]).trim();
  var ticketType = String(matchedRow[COL_TICKET_TYPE - 1]).trim();
  var paymentStatus = String(matchedRow[COL_PAYMENT_STATUS - 1]).trim().toUpperCase();
  var checkedIn = String(matchedRow[COL_CHECKED_IN - 1]).trim().toUpperCase();
  var entryRule = getEntryRule(ticketType);
  
  var tFetch = Date.now();
  Logger.log("VerifyTiming: SheetLoad=" + (tSheet-tStart) + "ms, TokenFind=" + (tFind-tSheet) + "ms, DataFetch=" + (tFetch-tFind) + "ms, Total=" + (tFetch-tStart) + "ms");

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
  var tStart = Date.now();
  
  try {
    var sheet = getTicketSheet();
    if (!sheet) {
      return { success: false, status: 'INVALID', message: 'Spreadsheet tab not found.' };
    }

    var tSheet = Date.now();

    // Fast lookup OUTSIDE the lock
    var finder = sheet.getRange(1, COL_QR_TOKEN, sheet.getLastRow() || 1, 1)
                      .createTextFinder(token)
                      .matchEntireCell(true)
                      .matchCase(false);
    var match = finder.findNext();
    
    var tFind = Date.now();

    if (!match) {
      Logger.log("CheckIn: Token not found. Time: " + (tFind - tStart) + "ms");
      return { success: false, status: 'INVALID', message: 'Ticket not found in the ticket database.' };
    }

    var row = match.getRow();
    var maxColNeeded = Math.max(COL_FULL_NAME, COL_TICKET_ID, COL_TICKET_TYPE, COL_PAYMENT_STATUS);
    var matchedRow = sheet.getRange(row, 1, 1, maxColNeeded).getValues()[0];
    
    var paymentStatus = String(matchedRow[COL_PAYMENT_STATUS - 1]).trim().toUpperCase();

    var tFetch = Date.now();

    if (paymentStatus !== 'PAID') {
      return { success: false, status: 'INVALID', message: 'Payment has not been verified for this ticket.' };
    }

    // CRITICAL SECTION: Acquire lock only for checking and updating the check-in status
    var lock = LockService.getScriptLock();
    var success = lock.tryLock(10000);
    if (!success) {
      return { success: false, status: 'ERROR', message: 'Server busy handling concurrent check-ins. Please tap CHECK IN again.' };
    }

    var tLock = Date.now();
    try {
      // Re-read Checked In status directly
      var currentCheckIn = String(sheet.getRange(row, COL_CHECKED_IN).getValue()).trim().toUpperCase();

      if (currentCheckIn === 'YES') {
        var name = String(matchedRow[COL_FULL_NAME - 1]).trim();
        var ticketId = String(matchedRow[COL_TICKET_ID - 1]).trim();
        var ticketType = String(matchedRow[COL_TICKET_TYPE - 1]).trim();
        return {
          success: false,
          status: 'USED',
          message: 'This ticket has already been checked in.',
          name: name,
          ticketId: ticketId,
          ticketType: ticketType,
          entry: getEntryRule(ticketType)
        };
      }

      // Update Checked In column (Column M, index 13) to "YES"
      sheet.getRange(row, COL_CHECKED_IN).setValue('YES');
      
      // Flush is necessary here before lock release so concurrent requests read the updated 'YES'
      SpreadsheetApp.flush();
      
      var tEnd = Date.now();
      Logger.log("CheckInTiming: SheetLoad=" + (tSheet-tStart) + "ms, TokenFind=" + (tFind-tSheet) + 
                 "ms, DataFetch=" + (tFetch-tFind) + "ms, LockAcquire=" + (tLock-tFetch) + 
                 "ms, WriteFlush=" + (tEnd-tLock) + "ms, Total=" + (tEnd-tStart) + "ms");

      var name = String(matchedRow[COL_FULL_NAME - 1]).trim();
      var ticketId = String(matchedRow[COL_TICKET_ID - 1]).trim();
      var ticketType = String(matchedRow[COL_TICKET_TYPE - 1]).trim();

      return {
        success: true,
        status: 'SUCCESS',
        name: name,
        ticketId: ticketId,
        ticketType: ticketType,
        entry: getEntryRule(ticketType)
      };

    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { success: false, status: 'ERROR', message: 'Check-in error: ' + err.toString() };
  }
}
