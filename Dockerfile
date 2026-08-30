FROM node:20-alpine

WORKDIR /src
COPY src .

RUN npm ci --omit=dev
RUN npx tsc /src

ENV NODE_ENV=production

CMD ["npm", "run", "start"]