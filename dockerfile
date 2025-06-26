# ---- STAGE 1: Build (optional, falls du ein Tailwind-Build nutzen willst) ----
# FROM node:20-alpine as build
# WORKDIR /app
# COPY . .
# RUN npm install
# RUN npm run build

# ---- STAGE 2: Run ----
FROM node:20-alpine

WORKDIR /app

# Kopiere Projektdateien
COPY . .

# Installiere nur Production-Abhängigkeiten (package.json/lock nötig!)
RUN npm ci --omit=dev

# Standardport, ggf. in .env übersteuerbar
ENV PORT=3000

# Exponiere den Port für Docker
EXPOSE 3000

# Startbefehl
CMD ["node", "server.js"]
