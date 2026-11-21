# One image for every RxChain service (chain, deployer, backend, frontend).
FROM node:20-bookworm-slim
WORKDIR /app
# Toolchain in case better-sqlite3 has no prebuilt binary for the platform (e.g. arm64 musl).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY contracts/package.json contracts/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY . .
RUN npm run compile && npm run build -w backend

ENV NODE_ENV=development
EXPOSE 8545 4000 5173
CMD ["npm", "run", "chain"]
