-- CreateEnum
CREATE TYPE "NativeLine" AS ENUM ('always', 'onPause', 'never');

-- AlterTable
ALTER TABLE "Learner" ADD COLUMN     "autoPause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cueScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "nativeLine" "NativeLine" NOT NULL DEFAULT 'always';
