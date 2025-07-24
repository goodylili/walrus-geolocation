FROM ubuntu:24.04

# Install Node.js, npm, curl and ca-certificates
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Install Walrus CLI
RUN curl -sSf https://install.wal.app | sh

# Add Walrus to PATH
ENV PATH="/root/.local/bin:${PATH}"

# Create Walrus config directory and download configuration
RUN mkdir -p ~/.config/walrus && \
    curl https://docs.wal.app/setup/client_config.yaml -o ~/.config/walrus/client_config.yaml

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application code and environment file
COPY . .
COPY .env .env

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]