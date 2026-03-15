# Build stage
FROM node:22-alpine AS builder

# Install build tools necessary for native dependencies (e.g., better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies using ci for a predictable, clean install
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the NestJS application
RUN npm run build

# Combine stage
FROM node:22-alpine

WORKDIR /usr/src/app

# Copy built application and dependencies from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist

# Optional: Ensure SQLite database file persistency by using a volume
# If the app expects it in a specific path, you might want to map a volume there.

EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
