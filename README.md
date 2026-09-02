# ⚽ First-Person Web 3D Soccer Game

> **Made by Afya Shaikh**

🎮 **[Play Online Now (GitHub Pages)](https://ashaikh23.github.io/First-Person-Web-3D-Soccer-Game/)**

An arcade-style First-Person 3D Soccer Game running in modern web browsers, built with **TypeScript**, **Three.js**, **Rapier3D Physics**, and procedural **Web Audio API**.

---

## 🌟 Key Features

- **⚽ First-Person Gameplay**: Play directly from the eyes of a soccer player with athletic leg animations, kicking strikes, and sliding tackles.
- **⚡ Rapier3D Physics Engine**: Realistic ball roll, bounce, spin, collisions with goalposts, crossbars, and kinematic player bodies.
- **🌀 Curved Finesse Shots (Magnus Effect)**: Bend shots around goalkeepers by strafing (`A` / `D`) while releasing power shots.
- **🎯 Heads-Up Crosshair Power Arc HUD**: SVG power gauge charging in real-time around the crosshair from Green $\rightarrow$ Gold $\rightarrow$ Hot Pink.
- **🏃 Slide Tackle Mechanics**: Press `C` to dive into turf tackles and strip possession from opponents within 2.5m.
- **🤖 Autonomous AI Teams**: Full 5v5 / 6v6 match AI with positional awareness, pass interception, attacking runs, goalkeeper patrols, and fair kickoff resets.
- **🎵 Procedural Web Audio Engine**: Zero-dependency procedural synthesis for ball strikes, passes, bounce thuds, referee whistles, metallic post clangs, and dynamic crowd atmosphere.
- **✨ Celebration Visuals**: Goal celebration confetti bursts, kick dust particles, and glowing ball trajectory speed ribbons.
- **📊 Match Analytics**: Real-time possession %, shots on target, passes completed, and post-match victory presentation.
- **🗺️ Tactical Minimap Radar**: Real-time 2D radar overlay with toggleable minimize (`N`).

---

## 🎮 Controls

| Action | Control |
|---|---|
| **Move / Run** | `W`, `A`, `S`, `D` |
| **Sprint** | `Shift` + `WASD` |
| **Power Shot** | Hold `LMB` or `Space`, release to shoot (22–42 m/s) |
| **Curved / Bend Shot** | Hold `A` (left curve) or `D` (right curve) while kicking |
| **Direct Pass** | `RMB` or `E` (aim crosshair to pass to teammate) |
| **Slide Tackle** | `C` (dive and steal ball along turf) |
| **Radar Minimap** | `N` (or click `−` / `+` button) |
| **Switch Mode** | `M` (Practice $\leftrightarrow$ Match) |
| **Pause Game** | `Esc` |

---

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- npm or pnpm / yarn

### Installation
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/First-Person-Web-3D-Soccer-Game.git

# Navigate into directory
cd First-Person-Web-3D-Soccer-Game

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
npm run build
```

---

## 📜 License
MIT License
