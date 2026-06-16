FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# --- Production Image ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist
# Copy other necessary folders (like swagger docs or database migrations if needed)
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/database ./database

# Expose port (adjust if your app uses a different one, usually 3000)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
