<a id="readme-top"></a>

[![Sponsors][sponsors-shield]][sponsors-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h3 align="center">myOKR</h3>

  <p align="center">
    A cross-platform desktop application for productivity and goal management.
    <br />
    <br />
    <a href="#-quick-start"><strong>🚀 Quick Start »</strong></a>
    <br />
    <br />
    <a href="#-key-features">✨ Features</a>
    ·
    <a href="https://code4food.work/blog/effective-okrs-with-myokr/">📖 Effective OKR Guide</a>
    ·
    <a href="#-support-the-project">💖 Sponsor</a>
  </p>
</div>

## A complete, local, desktop-first alternative to scattered goal trackers

myOKR transforms your workflow by combining the immediate action of a Pomodoro timer with the long-term vision of an OKR (Objectives and Key Results) system. Track your daily tasks and watch them automatically feed into your broader monthly goals.

<div align="center">
  <img src="screenshots/tasks.png" alt="Tasks View" width="45%" />
  <img src="screenshots/okrs.png" alt="OKRs View" width="45%" />
</div>
<div align="center">
  <img src="screenshots/review.png" alt="Weekly Review" width="45%" />
  <img src="screenshots/analytics.png" alt="Analytics View" width="45%" />
</div>

### Built With

[![Tauri][Tauri-badge]][Tauri-url] [![React][React-badge]][React-url] [![TypeScript][TypeScript-badge]][TypeScript-url] [![Vite][Vite-badge]][Vite-url]

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org)
- [Rust](https://www.rust-lang.org/tools/install)
- OS-specific dependencies for Tauri (e.g., Xcode Command Line Tools for macOS)

### Step 1: Clone the repository
```bash
git clone https://github.com/trongdth/myOKR.git
cd myOKR
```

### Step 2: Install dependencies
```bash
npm install
```

### Step 3: Run locally
```bash
npm run tauri dev
```

### Step 4: Build for Production
```bash
npm run tauri build
```

---

## ✨ Key Features

### Daily Focus
- **☀️ Today View**: Opens to a curated daily slate — tasks auto-scored against your active Key Results and fit to your Pomodoro budget. Skip and reshuffle picks without losing the ranking.
- **👋 First-Run Walkthrough**: Onboarding slides that introduce the OKRs → Tasks → Review loop the first time you launch the app.

### Goal Management (OKRs)
- **🎯 OKR Tree**: Create monthly cycles, define Objectives, and break them down into measurable Key Results.
- **♻️ Cycle Cloning**: New cycles can be seeded from the previous cycle's structure, and empty cycles can be deleted cleanly.
- **📊 Progress Tracking**: Update progress directly and set confidence levels (🟢 On Track, 🟡 At Risk, 🔴 Off Track).
- **📋 Weekly Review Wizard**: Stepped, per-KR check-in with confidence scoring, reflection prompts, a progress chart, and review history — all auto-populated from your Pomodoro data.

### Productivity Tools
- **🍅 Pomodoro Timer**: Classic focus/break cycles with system tray integration.
- **✅ Task Management**: Built-in Eisenhower matrix prioritization, inline editing, and drag-to-reorder within each quadrant.
- **🔗 Task-to-KR Linking**: Optionally link Pomodoro tasks to your OKR Key Results to ensure daily actions align with larger goals.
- **📝 Markdown Notes**: Task and KR descriptions render full GitHub-flavored markdown (lists, tables, code, links) with sanitized HTML.

### Desktop Experience
- **🌙 Dark Tech Aesthetic**: Beautiful, responsive, and distraction-free user interface.
- **🔔 Native Notifications**: Desktop notifications for session completions.
- **🔒 Persistent Storage**: Data is saved locally across sessions using `@tauri-apps/plugin-store`.
- **☁️ Cloud Sync (Dropbox)**: True local-first experience with lightning-fast offline support, plus seamless cross-device syncing via your own Dropbox account.
- **⬇️ Minimize to Tray**: Keeps running in the background when the main window is closed, featuring native-styled system tray icons.

---

## 💖 Support the Project

If you find this project helpful, consider supporting its development! Your sponsorship helps me dedicate more time to maintaining and improving myOKR.

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ff69b4?style=for-the-badge&logo=github)](https://github.com/sponsors/trongdth)

<!-- MARKDOWN LINKS & IMAGES -->
[sponsors-shield]: https://img.shields.io/github/sponsors/trongdth?style=for-the-badge&color=ff69b4
[sponsors-url]: https://github.com/sponsors/trongdth
[Tauri-badge]: https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF
[Tauri-url]: https://tauri.app/
[React-badge]: https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB
[React-url]: https://reactjs.org/
[TypeScript-badge]: https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white
[TypeScript-url]: https://www.typescriptlang.org/
[Vite-badge]: https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
