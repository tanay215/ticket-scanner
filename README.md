# 🎟️ Event Ticket Verification & Automatic PDF Email System

A mobile-first, high-performance external QR scanner frontend & Apps Script backend for event gate staff. Integrates directly with your **Google Forms + Google Sheets** backend.

---

## 🏗 System Architecture

```
📝 Google Form Submission
         ↓
📊 Google Sheet ("dandiya" tab)
         ↓  [Auto-generates Ticket ID, UUID QR Token, PENDING status, NOT SENT email status]
💳 Admin Verifies Payment (Edits Column L: PENDING → PAID)
         ↓  [Installable Spreadsheet onEdit trigger: handlePaymentEdit(e)]
📄 Generates PDF Ticket (with embedded scannable QR token) + Emails Attendee (Col D)
         ↓  [Sets Column O: NOT SENT → SENT]
📱 Event Entrance Scanning (GitHub Pages QR Scanner)
         ↓  [HTTPS Fetch / JSONP API]
⚡ Google Apps Script Backend (verifyTicket / checkInTicket + LockService)
         ↓
✅ Mark Ticket Checked In (Column M: NO → YES)
```

---

## 📊 Google Sheet Column Structure

| Col | Letter | Field Name | Description & Default Values |
| :---: | :---: | :--- | :--- |
| **1** | **A** | Timestamp | Submission time |
| **2** | **B** | Full Name | Guest Name |
| **3** | **C** | Phone Number | Contact number |
| **4** | **D** | Email Address | Recipient email for PDF ticket |
| **5** | **E** | Ticket Type | `Couple`, `Stag`, etc. |
| **6** | **F** | Upload Screenshot | Payment proof |
| **7** | **G** | UTR Number | Transaction ID |
| **8** | **H** | Upload Screenshot (couple) | Couple payment proof |
| **9** | **I** | UTR Number (couple) | Couple transaction ID |
| **10** | **J** | Ticket ID | Auto-generated: `EVT-0001`, `EVT-0002` |
| **11** | **K** | QR Token | Auto-generated: Unique UUID (`Utilities.getUuid()`) |
| **12** | **L** | Payment Status | `PENDING`, `PAID`, `REJECTED` |
| **13** | **M** | Checked In | `NO`, `YES` |
| **14** | **N** | QR Code | Formula: `=IMAGE("https://quickchart.io/qr?text=...")` |
| **15** | **O** | Ticket Email | `NOT SENT`, `SENT` |

---

## 🚀 Key Features

1. **Automatic Ticket ID & Token Generation**: On form submission, `generateTicketData(e)` auto-populates `EVT-XXXX`, UUID QR Token, `PENDING` payment status, `NO` checked in status, and `NOT SENT` email status.
2. **Automatic PDF Ticket Generation**: When Admin changes Column L (`Payment Status`) from `PENDING` → `PAID`:
   - Checks Column O (`Ticket Email`).
   - If `NOT SENT`: generates a crisp HTML-rendered PDF ticket with embedded scannable QR Code image (encoding the exact UUID token from Column K).
   - Emails the PDF ticket to the buyer's email (Column D).
   - Updates Column O to `SENT`.
3. **Idempotency & Retry Safety**:
   - If Column O is already `SENT`, editing Column L again will **NOT** resend duplicate emails.
   - If email sending or PDF generation fails, Column O stays `NOT SENT`, allowing safe retries.
4. **LockService Protection**: Both check-in API operations and PDF email generation use Google Apps Script `LockService` to prevent race conditions during concurrent edits.
5. **Mobile-First QR Scanner**: Hosted on GitHub Pages ([`https://tanay215.github.io/ticket-scanner/`](https://tanay215.github.io/ticket-scanner/)).

---

## ⚙️ Google Apps Script Triggers Setup Instructions

To activate the automatic ticket generator & PDF email automation:

1. Open your Google Sheet → Go to **Extensions** → **Apps Script**.
2. Replace `Code.gs` with the complete code in [`google-apps-script/Code.gs`](file:///Users/tanaytenginkai/Desktop/Paper1192/Ticket/google-apps-script/Code.gs).
3. Click **Triggers** (⏰ clock icon on left sidebar).

### Trigger 1: Form Submit (Auto Ticket Generator)
- Click **Add Trigger**:
  - Choose function: `generateTicketData`
  - Select event source: **From spreadsheet**
  - Select event type: **On form submit**
- Click **Save**.

### Trigger 2: Spreadsheet Edit (Auto PDF Email Sender)
- Click **Add Trigger**:
  - Choose function: `handlePaymentEdit`
  - Select event source: **From spreadsheet**
  - Select event type: **On edit**
- Click **Save** and authorize permissions.

---

## 🌐 Deploying Web App Updates

If deploying a Web App update:
1. In Apps Script, click **Deploy** → **Manage deployments**.
2. Edit ✏️ active deployment → Choose **New version**.
3. Set **Who has access**: `Anyone`.
4. Click **Deploy**.
