# LiveCollab Production Deployment Guide

Follow these steps to deploy **LiveCollab** to Vercel (Frontend) and Render (Backend).

---

## 🌐 Part 1: Deploy the Backend on Render

Render will host the persistent Node.js Express server and keep WebSockets active.

1. Go to [Render.com](https://render.com) and log in.
2. Click **New +** > **Web Service**.
3. Link your GitHub account and select the `Logic-Believers---Live-Collab` repository.
4. Configure the Web Service:
   - **Name**: `livecollab-backend`
   - **Region**: Select the region closest to you
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Click **Advanced** and add these **Environment Variables**:
   - `MONGO_URI` = `mongodb+srv://shubhamsaurav2264_db_user:Mars1979@livecollab.po9nozf.mongodb.net/livecollab?retryWrites=true&w=majority`
   - `GOOGLE_CLIENT_ID` = `1088125896398-e392imodjudp2raq76jbjkh5f83s7hb0.apps.googleusercontent.com`
   - `JWT_SECRET` = `supersecret_hackathon_key_2024`
   - `PORT` = `3001`
   - `CORS_ORIGIN` = `https://your-vercel-app.vercel.app` *(Change this to your actual Vercel URL once the frontend is deployed)*
6. Click **Create Web Service**.
7. Once deployed, copy the Render URL (e.g., `https://livecollab-backend.onrender.com`).

---

## 🚀 Part 2: Deploy the Frontend on Vercel

Vercel will host the React/Vite web application.

1. Go to [Vercel.com](https://vercel.com) and log in.
2. Click **Add New** > **Project**.
3. Import the `Logic-Believers---Live-Collab` repository.
4. Configure the Project:
   - **Root Directory**: Click *Edit* and select **`frontend`**.
   - **Framework Preset**: Select **Vite** (Vercel should auto-detect this).
5. Open the **Environment Variables** section and add:
   - `VITE_API_BASE_URL` = `https://livecollab-backend.onrender.com` *(Paste your Render backend URL)*
   - `VITE_WS_BASE_URL` = `wss://livecollab-backend.onrender.com` *(WebSocket URL, make sure it starts with `wss://` instead of `https://`)*
   - `VITE_GOOGLE_CLIENT_ID` = `1088125896398-e392imodjudp2raq76jbjkh5f83s7hb0.apps.googleusercontent.com`
6. Click **Deploy**.
7. Copy your Vercel URL, go back to your Render dashboard, and update the `CORS_ORIGIN` environment variable so your backend accepts requests from your frontend.
