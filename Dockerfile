# Use the latest stable Node.js image
FROM node:22

# Install Chrome dependencies and X11
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    xvfb \
    x11-xserver-utils \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy only package.json first to take advantage of Docker cache
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the entire project after installing dependencies
COPY . .

# Expose the port
EXPOSE 3000

# Start Xvfb and then the app
CMD Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 & export DISPLAY=:99 && npx nodemon -L server.js
