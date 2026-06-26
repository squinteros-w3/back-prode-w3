-- CreateEnum
CREATE TYPE "PenaltyWinner" AS ENUM ('HOME', 'AWAY');

-- AlterTable
ALTER TABLE "Prediction" ADD COLUMN     "penaltyWinner" "PenaltyWinner";
