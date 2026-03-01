FROM node:22-alpine AS build
ARG VITE_BASE_PATH=""
ENV VITE_BASE_PATH=$VITE_BASE_PATH
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/server/package.json packages/server/
RUN npm ci --omit=dev --workspace=packages/server --workspace=packages/shared
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/server/data packages/server/data
COPY --from=build /app/packages/server/src/db/migrations packages/server/dist/db/migrations
COPY --from=build /app/packages/client/dist packages/client/dist
EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
