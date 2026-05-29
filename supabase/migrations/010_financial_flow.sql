-- Migration 010: Financial flow tracking
-- Adds reimbursement tracking on expenses and deposit tracking on guest sessions

-- 1. Reimbursement tracking on ausgaben
-- When bezahlt_von != 'bootkonto', Roger needs to reimburse that person
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS erstattet boolean NOT NULL DEFAULT false;
ALTER TABLE public.ausgaben ADD COLUMN IF NOT EXISTS erstattet_am date;

-- 2. Deposit tracking on gastsessions
-- When a guest pays cash to someone, that money needs to be transferred to the bank account
ALTER TABLE public.gastsessions ADD COLUMN IF NOT EXISTS auf_konto_eingezahlt boolean NOT NULL DEFAULT false;
ALTER TABLE public.gastsessions ADD COLUMN IF NOT EXISTS eingezahlt_am date;
ALTER TABLE public.gastsessions ADD COLUMN IF NOT EXISTS eingezahlt_von text;
