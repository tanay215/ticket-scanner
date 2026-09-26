# Event Ticket Verification & QR Scanner

A mobile-first, high-performance external QR scanner frontend for Dandiya event gate staff. Built to integrate seamlessly with an existing **Google Sheets + Google Apps Script** backend without exposing sheet credentials or requiring direct sheet access.

---

## 🏗 System Architecture

```
📱 Phone / Laptop Camera
         ↓
🌐 External Scanner Frontend (GitHub Pages / HTTPS)
         ↓  [HTTPS GET with token & action]
⚡ Google Apps Script Web App (API Endpoint + LockService)
         ↓
📊 Google Sheet ("dandiya" tab)
         ↓  [Query row, verify PAID & Checked In status]
📋 Response JSON (VALID / USED / INVALID)
         ↓
🎨 Scanner UI Card (Mobile Gate Staff Screen)
```

---

## 🚀 Features

- **Mobile-First Responsive UI**: Dark festive theme designed specifically for outdoor/night event conditions with high visual contrast.
- **Auto-Camera Selection**: Automatically detects and prefers rear-facing/environment camera on smartphones.
- **Audio & Haptic Feedback**: Synthesizes audio chimes and device vibration for instant scan feedback.
- **Duplicate Scan Lockout**: Pauses scanner immediately upon QR code detection to prevent duplicate network requests.
- **Concurrency Protection**: Google Apps Script `LockService` prevents race conditions when multiple gate staff scan the same ticket simultaneously.
- **Manual Token Entry**: Fallback input drawer for staff to paste or type ticket UUID tokens if camera lens is dirty or unreadable.
- **Zero Frontend Credential Exposure**: Pure HTTPS client-side communication directly with Apps Script. No service accounts or sheet credentials stored in frontend code.

---

## 📂 Project Structure

```
.
├── index.html               # Main HTML entry point for GitHub Pages
├── style.css                # Mobile-first CSS styling & festive dark mode theme
├── script.js                # Core JS logic: QR Scanner, Web Audio API, Apps Script fetch calls
├── google-apps-script/
│   └── Code.gs              # Apps Script backend API code with LockService concurrency guard
└── README.md                # System documentation & setup guide
```

---

## ⚙️ Google Apps Script Backend Setup Instructions

If you need to update or deploy your Google Apps Script backend:

1. Open your Google Sheet connected to your Google Form.
2. Go to **Extensions** → **Apps Script**.
3. Replace the existing script content with the code provided in [`google-apps-script/Code.gs`](file:///Users/tanaytenginkai/Desktop/Paper1192/Ticket/google-apps-script/Code.gs).
4. Verify column mapping matches your Google Sheet tab `dandiya`:
   - Column B: `Full Name`
   - Column E: `Ticket Type`
   - Column J: `Ticket ID`
   - Column K: `QR Token`
   - Column L: `Payment Status` (`PAID`, `PENDING`, `REJECTED`)
   - Column M: `Checked In` (`NO`, `YES`)
5. Click **Deploy** → **New deployment**.
6. Select **Web app**:
   - **Description**: `Dandiya Ticket Scanner API v2`
   - **Execute as**: `Me (your google account)`
   - **Who has access**: `Anyone` *(Crucial for external HTTPS scanner access)*
7. Copy the generated **Web App URL**:
   `https://script.google.com/macros/s/AKfycbz9asD_F3ZM9wtowg-Qcbk7YBskBkdnlFx1sIQfNGCTRxmXb2gTMcITGPwFy2m1tg0o/exec`

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "Add Dandiya ticket QR verification system frontend and backend"
   git push origin main
   ```
2. On GitHub, navigate to your repository **Settings** → **Pages**.
3. Under **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)`
4. Click **Save**.
5. Your live scanner site will be available at:
   `https://<your-github-username>.github.io/<repository-name>/`

---

## 🔒 Security & Concurrency

- **Payment Verification**: Front-end never decides ticket validity. The Apps Script backend checks `Payment Status == 'PAID'` and `Checked In == 'NO'`.
- **LockService Protection**: `LockService.getScriptLock()` wraps the check-in read-modify-write operation in Apps Script. Scanner A and Scanner B cannot both check in the same ticket at the same time.
- **Sanitized Outputs**: Sensitive buyer info (phone number, email address, payment screenshots, UTR numbers) are excluded from the API response payload.
