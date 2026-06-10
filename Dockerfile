FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (adjust if your app uses a different one, usually 3000)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
