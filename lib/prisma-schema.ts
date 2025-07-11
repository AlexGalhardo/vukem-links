// This file contains the Prisma schema for reference
// In a real application, you would put this in prisma/schema.prisma

/*
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model Category {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  links     Link[]
  createdAt DateTime @default(now())
}

model Link {
  id          String   @id @default(cuid())
  url         String
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  clicks      Int      @default(0)
  createdAt   DateTime @default(now())
}
*/

export const prismaSchema = `
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model Category {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  links     Link[]
  createdAt DateTime @default(now())
}

model Link {
  id          String   @id @default(cuid())
  url         String
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  clicks      Int      @default(0)
  createdAt   DateTime @default(now())
}
`;
