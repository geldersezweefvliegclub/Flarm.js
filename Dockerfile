FROM node:lts-alpine AS builder

WORKDIR /app
RUN apk add --update python3 make g++ && rm -rf /var/cache/apk/*

COPY . .

RUN npm i
RUN npm run build


FROM node:lts-alpine AS runtime
WORKDIR /app

COPY package*.json ./
RUN npm i --production




COPY --from=builder /app/dist ./dist

ENTRYPOINT node ./dist/main.js
