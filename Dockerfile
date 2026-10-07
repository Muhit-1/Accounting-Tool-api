# syntax=docker/dockerfile:1

# Debian (glibc), never Alpine: @napi-rs/canvas, bcrypt and Chromium all ship
# glibc builds. node:24 matches package.json "engines" and @types/node.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# Chromium comes from Debian in the runtime stage; Puppeteer's own download
# does not exist for Linux ARM64 and would only bloat the build.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY . .
# The Prisma client (src/generated/prisma) is gitignored and must exist
# before `nest build` compiles it into dist/generated.
RUN npx prisma generate && npm run build
RUN npm prune --omit=dev


FROM node:24-bookworm-slim
# PUPPETEER_NO_SANDBOX: Chromium's sandbox needs kernel features Docker's
# default profile blocks. Safe here: the render page has JS off and all
# network blocked (common/pdf-browser.ts) and the process runs as non-root.
# *_STORAGE_DIR: absolute paths are stored in the database, so these must
# never change once real data exists. Mount a persistent volume at /data.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true \
    INVOICE_STORAGE_DIR=/data/invoices \
    RECEIPT_STORAGE_DIR=/data/receipts
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium curl ca-certificates fonts-liberation fonts-noto-core \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
# OCR language data, read from the app root (see invoice-scan.service.ts).
COPY --from=build /app/eng.traineddata ./
# Only /data needs to be writable. A new named volume inherits this ownership.
RUN mkdir -p /data/invoices /data/receipts && chown -R node:node /data
USER node
EXPOSE 3000
# `exec` replaces the shell with node so it receives SIGTERM directly
# (the app uses enableShutdownHooks).
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main"]
