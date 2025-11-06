# Multi-stage Dockerfile for Vite React app
# Build stage
# Use Debian-based Node 20 to satisfy Vite's Node >= 20.19 requirement
# and avoid native binding issues with musl (rolldown bindings).
FROM node:20-bullseye-slim AS build
WORKDIR /app

# Install dependencies based on package-lock or package.json
COPY package.json package-lock.json* ./
RUN npm ci --silent || npm install --silent

# Copy source and build
COPY . .
RUN npm run build

# Production stage - serve with nginx
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Replace default nginx config with our SPA-friendly config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
