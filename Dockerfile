FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=37841

EXPOSE 37841

CMD ["node", "webrtc-server.js"]
