
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Temporary URL for Prisma during image build.
# Docker Compose provides the real URL at runtime.
ENV DATABASE_URL="postgresql://slotbook:slotbook_dev_123@localhost:5432/slotbook?schema=public"

RUN npx prisma generate
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npm run start"]
