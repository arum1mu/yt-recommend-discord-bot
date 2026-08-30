FROM node:22-alpine AS builder

WORKDIR /src
COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run lint
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /src
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /src/dist ./dist

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]