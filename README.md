# Educa Fintech — Platform

A full-featured Fintech platform featuring 12% Savings Accounts, ₹199 Micro Recharge Loans up to ₹1.5L Bike Loans, Silver & Platinum VIP digital cards, and multi-wallet architecture.

## Project Structure
- payease-frontend-mobile-web-fixed/: React + Vite + Tailwind CSS Frontend (Deploy on **Vercel**)
- payease-backend-fixed/: Node.js + Express + MongoDB Backend (Deploy on **Render**)

## Deployment Guide

### 1. Backend on Render
- **Root Directory**: payease-backend-fixed
- **Build Command**: 
pm install
- **Start Command**: 
ode server.js
- **Environment Variables**:
  - PORT: 5000 (or leave default on Render)
  - NODE_ENV: production
  - MONGO_URI: Your MongoDB Atlas connection string
  - JWT_SECRET: A 32+ character random string
  - CLIENT_URL: Your Vercel frontend URL (e.g. https://your-app.vercel.app)

### 2. Frontend on Vercel
- **Root Directory**: payease-frontend-mobile-web-fixed
- **Framework Preset**: Vite
- **Build Command**: 
pm run build
- **Output Directory**: dist
- **Environment Variables**:
  - VITE_API_URL: Your Render backend URL (e.g. https://your-backend.onrender.com/api)
