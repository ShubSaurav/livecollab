# Use node alpine for lightweight image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY . .

# Expose port (Hugging Face Spaces uses 7860, Render/Koyeb use PORT env var, default to 3001)
EXPOSE 7860 3001

# Start the application
CMD ["node", "server.js"]
