# 📸 Ad Violation Mobile App

![Expo](https://img.shields.io/badge/Expo-000020?logo=expo&logoColor=white&style=flat-square)
![React Native](https://img.shields.io/badge/React%20Native-20232A?logo=react&logoColor=61DAFB&style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)
![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20iOS-brightgreen?style=flat-square)

The **Ad Violation Mobile App** is a **React Native application built with Expo** that allows users to capture images of billboards, scan QR codes, and report potential violations. The app provides **real-time feedback** on the validity of a report and a **history of all submitted reports**.

---

## ✨ Features

- **Camera & Location Services**  
  Requests and uses device permissions to capture photos and log the user's location.  

- **QR Code Scanner**  
  A built-in scanner detects QR codes on billboards for a seamless user experience.  

- **Real-time Feedback**  
  Displays a pop-up modal after each report, providing immediate analysis results:  
  - ✅ No Issues Detected  
  - 🚫 Violation Detected  
  - ⚠️ Invalid Image  

- **Reports Tab**  
  A dedicated screen to view a history of all submitted reports, showing a thumbnail, status, and details for each entry.  

- **Infinite Scrolling**  
  Efficiently loads more reports as the user scrolls, improving performance for large datasets.  

---

## ⚙️ Prerequisites

Before running the app, ensure you have the following installed:

- [Node.js](https://nodejs.org/)  
- npm or yarn  
- Expo CLI → Install via:  

```bash
npm install -g expo-cli
```

---

## 🚀 Installation

Clone the repository:

```bash
git clone [your-repo-url]
cd ad_violation_mobile
```

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npx expo start
```

This will open a local development server.  
- Scan the QR code with the **Expo Go** app on your physical device  
- Or use an Android/iOS emulator to view the app  

---

## 🔄 App Workflow

1. **Camera Screen** → User opens the app and is presented with a camera view.  
2. **QR Scan** → The app automatically scans for a QR code. When detected, a pop-up appears, and the QR value is stored for the report.  
3. **Take Picture** → The user taps the capture button to take a photo.  
4. **Analysis** → The app sends the photo and location data to the backend for AI analysis.  
5. **Feedback** → A modal appears with a clear status (e.g., `✅ No Issues Detected`, `🚫 Violation Detected`) and a message detailing the result.  
6. **Reports Screen** → The report is automatically added to a list on the **Reports** tab, providing a historical log for the user to review.  

---

## 📂 Project Structure

```
ad_violation_mobile/
│── assets/           # App assets (icons, images)
│── components/       # Reusable UI components
│── screens/          # App screens (Camera, Reports, etc.)
│── utils/            # Utility functions (API, helpers)
│── App.js            # Entry point
│── package.json
```

---

## 📌 Notes

- Built with **React Native** & **Expo**  
- Supports both **iOS & Android** devices  
- Backend integration required for AI analysis & report storage  

---

## 📜 License

This project is licensed under the **MIT License**.  
