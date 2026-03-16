# Dockerfile for Synology NAS (Container Manager)
FROM node:20-alpine

WORKDIR /app

# Copy package files and tsconfig
COPY package.json tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy source files
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
