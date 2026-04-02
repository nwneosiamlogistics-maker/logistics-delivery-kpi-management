# Dockerfile for Synology NAS (Container Manager)
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only (no TypeScript needed - using pre-compiled dist/)
RUN npm install --production

# Copy pre-compiled JS (no TypeScript build step needed)
COPY dist/ ./dist/

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
