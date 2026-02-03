-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "User" (
    "phone" TEXT NOT NULL,
    "registrationToken" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "Messages" (
    "id" TEXT NOT NULL,
    "registrationToken" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "message" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_registrationToken_key" ON "User"("registrationToken");

-- AddForeignKey
ALTER TABLE "Messages" ADD CONSTRAINT "Messages_registrationToken_fkey" FOREIGN KEY ("registrationToken") REFERENCES "User"("registrationToken") ON DELETE RESTRICT ON UPDATE CASCADE;
