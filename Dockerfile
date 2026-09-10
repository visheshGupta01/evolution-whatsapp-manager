FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node", "server/src/index.js"]
