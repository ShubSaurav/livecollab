# LiveCollab — Enterprise Collaborative Whiteboard Workspace

LiveCollab is a real-time collaborative workspace platform featuring an interactive HTML5 whiteboard, draggable and editable sticky notes, multi-peer video/audio communication (WebRTC), draggable and resizable screen sharing, collaborative chat, user statuses, and a context-aware AI assistant powered by Google Gemini.

---

## 🎨 Product Architecture & Core Features

### 1. High-Performance Two-Canvas Whiteboard
*   **Two-Canvas Layering**: Designed with a layered canvas architecture to guarantee fluid 60 FPS user interaction:
    *   **Drawing Canvas (Bottom, `z-index: 1`)**: Draws persistent elements (pen lines, rectangles, circles, text). It only redraws when a stroke is completed, a clear action is triggered, or drawing histories are synced.
    *   **Overlay Canvas (Top, `z-index: 2`)**: Captures mouse/pointer events and renders high-frequency active elements (laser pointer trails, brush size hover previews, shapes bounding outlines, remote user cursors) to completely eliminate stuttering and lag.
*   **Drawing Tools**:
    *   **Freehand Pen**: Draws smooth path segments in selected colors and thicknesses.
    *   **Eraser Tool**: Erases lines on the drawing canvas. Displays a circular preview outline matching the brush size.
    *   **Laser Pointer**: Renders a thick glowing trail that automatically fades out after 1.5 seconds.
    *   **Interactive Inline Text**: Replaces basic alert popups with a floating inline text-input box directly on the clicked coordinates. Pressing `Enter` commits the text to the board, while `Escape` dismisses the text input.
    *   **Shapes (Rectangles & Circles)**: Renders a drag preview outline on the overlay canvas before committing the shape to the persistent layer.
*   **Whiteboard Toolbar**: A floating, draggable panel positioned at the top-center of the whiteboard. Collapsing the toolbar or sidebars maximizes the active canvas to fill the viewport fold.
*   **Board Export & Grid Customization**:
    *   **PNG Exporter**: Merges the custom theme background, grid, and active drawing canvas into a single PNG download directly from the browser.
    *   **Grid Toggling**: Toggles between Dotted, Lines, and plain Solid slates.

### 2. Synced Room-Wide Undo & Redo
*   **Local Action Stacks**: Tracks user actions in `drawActions` and `redoStack` state buffers.
*   **Keyboard Shortcuts**: Supports standard keyboard shortcuts:
    *   `Ctrl+Z` / `Cmd+Z` for Undo.
    *   `Ctrl+Y` / `Cmd+Y` / `Cmd+Shift+Z` for Redo.
*   **WebSocket Synchronization**: Synchronizes undo and redo events room-wide in real-time, refreshing all connected peers using `draw_sync` events.

### 3. Real-Time WebRTC Media Feeds (Video, Audio & Screen Share)
*   **Direct Video Box Dragging**: A draggable glassmorphic video tray positioned at the bottom of the whiteboard. Users can click and hold any video feed tiles to reposition the tray anywhere over the screen.
*   **Dynamic Peer Feed Mapping**: Maps remote incoming streams over the active `peers` list, dynamically assigning the `MediaStream` objects to `<video>` elements using custom React `ref` callbacks.
*   **Track Toggling & Renegotiation**:
    *   Toggling microphones or webcams disables the tracks locally, which pauses the media stream without closing the peer connections.
    *   If a user turns on their mic or camera after joining, `addLocalTracksToPeers` adds the tracks to existing RTCPeerConnections and automatically triggers negotiation by sending a fresh `webrtc-offer`.
*   **Draggable & Resizable Screen Share**: Launches screen capturing via `getDisplayMedia` and displays the stream inside a floating, draggable, and resizable glass container.

### 4. Context-Aware Google Gemini AI Assistant
*   **Context Ingestion**: Before querying the model, the app dynamically serializes the current board state (total drawing strokes, full sticky note contents, and recent team chat logs) and pre-injects it as a system prompt.
*   **Multi-Tier Key Management**:
    *   **Tier 1 (Direct)**: Uses the user's local input key stored in `localStorage`.
    *   **Tier 2 (Secure Proxy)**: If no local key is configured, queries the backend proxy endpoint `/api/ai` which uses the server's environment variable `GEMINI_API_KEY`.
    *   **Tier 3 (Simulator)**: Reverts to a locally generated meeting summary simulator if no keys are found.
*   **Adjustable Sidebar Settings**:
    *   **Width Resizer**: Drag-to-resize the sidebar panel width from `260px` up to `800px`.
    *   **Glass Controls**: Sliders to adjust background opacity (from `5%` to `100%`) and glass filter blur strength (from `0px` to `30px`). All customizations persist across page refreshes.

### 5. MongoDB Database-Offline Fallback
*   If MongoDB is unreachable, the application bypasses connection timeouts and falls back to **in-memory room data structures** (`roomsMap`). All operations (REST API queries, WebSocket connections, history caching) run in-memory instantly, maintaining high availability.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React 18.3.1 | Component-based UI Architecture |
| | Vite 6.0.3 | High-Performance Build Tooling & Local Server |
| | Lucide React | Modern Minimalist Icon Set |
| | Vanilla CSS | Glassmorphism, Theme-Variables & Custom Easing Animations |
| **Backend** | Node.js / Express | REST API Routing & AI Proxy |
| | ws (WebSockets) | Real-Time Sync, Chat Relaying & WebRTC Signaling |
| | MongoDB / Mongoose | Permanent Storage (Whiteboard actions, meeting summaries, history) |
| **AI** | Google Gemini 2.5 Flash | Real-Time Whiteboard Analysis & Chat Bot |

---

## 📁 Repository Structure

```
├── backend/
│   ├── models/
│   │   ├── Room.js         # Mongoose schema for whiteboard state persistence
│   │   └── Session.js      # Mongoose schema for archived session summaries
│   ├── server.js           # Express app setup, WS server, AI Proxy, & DB-Offline fallback
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── assets/         # App logo and static assets
│   │   ├── pages/
│   │   │   ├── Login.jsx       # Frosted glass authentication and room join forms
│   │   │   ├── Login.css
│   │   │   ├── Dashboard.jsx   # Create rooms, active session history cards
│   │   │   ├── Dashboard.css
│   │   │   ├── Room.jsx        # Core collaborative workspace page
│   │   │   ├── Room.css
│   │   │   ├── Settings.jsx    # User details and key status management
│   │   │   └── Settings.css
│   │   ├── App.jsx         # App router and theme provider setup
│   │   ├── App.css
│   │   ├── index.css       # Obsidian Black design system, custom inputs & variables
│   │   ├── main.jsx        # Mounting point
│   │   └── config.js       # Base API URLs for dynamic dev/production configuration
│   ├── package.json
│   ├── vercel.json         # SPA router configuration for Vercel deployments
│   └── .env.example
├── DEPLOYMENT.md           # Instructions to deploy to Vercel (Frontend) and Render (Backend)
└── PROJECT_DETAILS.md      # Project overview and technical specification documentation
```

---

## 🚀 Running the Application Locally

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed.

### 2. Backend Setup
1. Open a terminal and navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Install the backend dependencies:
   ```bash
   npm install
   ```
3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit the `.env` file and fill in your details:
   ```env
   PORT=3001
   MONGODB_URI=your_mongodb_connection_string  # Can be left empty for DB-offline fallback
   GEMINI_API_KEY=your_google_gemini_api_key   # For secure server-side AI assistant proxy
   ```
5. Start the backend developer server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Open a new terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install the frontend dependencies:
   ```bash
   npm install
   ```
3. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Configure the environment URLs inside `.env`:
   ```env
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:3001
   VITE_GEMINI_API_KEY=your_optional_gemini_key # Enables direct query fallback from browser
   ```
5. Run the frontend development build:
   ```bash
   npm run dev
   ```
6. Open your browser to the URL printed in the terminal (usually `http://localhost:5173`) to join or create workspace rooms.
