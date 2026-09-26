# 📋 Project Transfer & Ownership Handover Guide

This guide details the step-by-step instructions for transferring full ownership of the **Ticket Verification & Automatic PDF Email System** to the event organizer.

Following this guide ensures:
1. The organizer becomes the owner of the Google Sheet & Google Form.
2. All automated ticket emails are sent directly from the **Organizer's Gmail account** (`MailApp`).
3. The QR scanner frontend connects seamlessly to the Organizer's Apps Script Web App.

---

## 📑 Transfer Checklist

### Step 1: Transfer Google Sheet & Form Ownership
1. Open the **Google Sheet** (and linked **Google Form**) in Google Drive.
2. Click **Share** (top right).
3. Add the **Organizer's Google Email Address**.
4. Once shared as Editor, click the dropdown next to the Organizer's name → select **Transfer Ownership**.
5. Confirm **Transfer Ownership**.

---

### Step 2: Setup Apps Script Code (Organizer's Account)
1. Have the organizer log into their Google Account and open the transferred Google Sheet.
2. Go to **Extensions** → **Apps Script**.
3. Replace any existing code with the complete content from [`google-apps-script/Code.gs`](file:///Users/tanaytenginkai/Desktop/Paper1192/Ticket/google-apps-script/Code.gs).
4. Click **Save** (💾).

---

### Step 3: Deploy Web App (Sends Emails from Organizer's Gmail)
In Google Apps Script, when **Execute as** is set to **Me**, all emails sent via `MailApp.sendEmail()` automatically originate from the organizer's personal Gmail address.

1. In the organizer's Apps Script editor, click **Deploy** → **New deployment**.
2. Select **Web app**:
   - **Execute as**: `Me (organizer's email)`
   - **Who has access**: **`Anyone`**
3. Click **Deploy**.
4. Complete the 1-time **Authorize access** prompt (select organizer's Google account → Advanced → Go to project → Allow).
5. Copy the **Organizer's Web App URL**.

---

### Step 4: Configure Triggers (Organizer's Account)
In the organizer's Apps Script editor, click **Triggers** (⏰ clock icon on left menu):

#### Trigger 1: Auto Ticket Generator
- Click **Add Trigger**:
  - **Choose function**: `generateTicketData`
  - **Select event source**: `From spreadsheet`
  - **Select event type**: `On form submit`
- Click **Save**.

#### Trigger 2: Auto PDF Email Sender
- Click **Add Trigger**:
  - **Choose function**: `handlePaymentEdit`
  - **Select event source**: `From spreadsheet`
  - **Select event type**: `On edit`
- Click **Save** and authorize permissions when prompted.

---

### Step 5: Update Web App URL in Scanner App
There are 2 simple ways to point the scanner to the organizer's new Web App URL:

#### Option A: Via Settings UI (No coding required)
1. Open the scanner app on gate staff phones: [https://tanay215.github.io/ticket-scanner/](https://tanay215.github.io/ticket-scanner/)
2. Click **⚙️ Settings** → Paste the **Organizer's Web App URL** → Click **Save Settings**.

#### Option B: Update Codebase Default
1. Update `DEFAULT_API_URL` in `script.js` with the organizer's Web App URL.
2. Commit and push to GitHub (`git push origin master`).
