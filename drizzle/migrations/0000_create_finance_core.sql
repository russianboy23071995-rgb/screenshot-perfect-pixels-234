-- Categories
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  color text NOT NULL DEFAULT '#000000',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories open" ON public.categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Transactions (all money in integer cents)
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income','expense')),
  invoice_number text,
  counterparty text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  service_date date,
  payment_date date,
  payment_status text NOT NULL DEFAULT 'open' CHECK (payment_status IN ('open','paid','overdue','cancelled')),
  net_cents bigint NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  tax_cents bigint NOT NULL DEFAULT 0,
  gross_cents bigint NOT NULL DEFAULT 0,
  deductible text NOT NULL DEFAULT 'yes' CHECK (deductible IN ('yes','no','partial')),
  deductible_percent numeric(5,2) NOT NULL DEFAULT 100,
  deductible_tax_cents bigint NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'bank',
  notes text,
  fiscal_year integer NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_year_idx ON public.transactions (fiscal_year, type, invoice_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions open" ON public.transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  filename text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  upload_date timestamptz NOT NULL DEFAULT now(),
  sync_status text NOT NULL DEFAULT 'app_only' CHECK (sync_status IN ('app_only','synced','missing','error')),
  extracted_data jsonb,
  confidence numeric(4,3),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO anon, authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents open" ON public.documents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tax periods
CREATE TABLE public.tax_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year integer NOT NULL,
  quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','preparing','submitted','paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fiscal_year, quarter)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_periods TO anon, authenticated;
GRANT ALL ON public.tax_periods TO service_role;
ALTER TABLE public.tax_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_periods open" ON public.tax_periods FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Settings (single row)
CREATE TABLE public.settings (
  id text PRIMARY KEY DEFAULT 'default',
  company_name text NOT NULL DEFAULT '',
  owner_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  tax_number text NOT NULL DEFAULT '',
  vat_id text NOT NULL DEFAULT '',
  vat_liable boolean NOT NULL DEFAULT true,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 19,
  tax_rates jsonb NOT NULL DEFAULT '[19,7,0]'::jsonb,
  advance_period text NOT NULL DEFAULT 'quarterly' CHECK (advance_period IN ('monthly','quarterly')),
  permanent_extension boolean NOT NULL DEFAULT false,
  currency text NOT NULL DEFAULT 'EUR',
  default_payment_method text NOT NULL DEFAULT 'bank',
  bank_account text NOT NULL DEFAULT '',
  filename_scheme text NOT NULL DEFAULT '{datum}_{partner}_{nummer}_{brutto}',
  local_folder text NOT NULL DEFAULT '',
  active_fiscal_year integer NOT NULL DEFAULT 2026,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings open" ON public.settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.settings (id, company_name, owner_name, active_fiscal_year)
VALUES ('default', 'NOVIKOV | PLAN & MASS', 'Christoph Novikov', 2026);

-- Default categories
INSERT INTO public.categories (name, type, sort_order, color) VALUES
  ('Dienstleistungen','income',1,'#111111'),
  ('Projektumsatz','income',2,'#2b2b2b'),
  ('Beratung','income',3,'#444444'),
  ('Provision','income',4,'#5d5d5d'),
  ('Sonstige Einnahmen','income',5,'#767676'),
  ('Werbung / Marketing','expense',1,'#111111'),
  ('Homepage / Web','expense',2,'#1e1e1e'),
  ('Hosting / Domains','expense',3,'#2b2b2b'),
  ('Software / SaaS','expense',4,'#383838'),
  ('Telefon / Mobilfunk','expense',5,'#454545'),
  ('Internet','expense',6,'#525252'),
  ('Bürobedarf','expense',7,'#5f5f5f'),
  ('Hardware','expense',8,'#6c6c6c'),
  ('Versicherungen','expense',9,'#797979'),
  ('Bankgebühren','expense',10,'#868686'),
  ('Steuerberater','expense',11,'#939393'),
  ('Rechtsberatung','expense',12,'#a0a0a0'),
  ('Weiterbildung','expense',13,'#adadad'),
  ('Reisekosten','expense',14,'#bababa'),
  ('Fahrtkosten','expense',15,'#c7c7c7'),
  ('Bewirtung','expense',16,'#d4d4d4'),
  ('Fremdleistungen','expense',17,'#8a8a8a'),
  ('Freelancer','expense',18,'#9a9a9a'),
  ('Sonstige Betriebsausgaben','expense',19,'#b0b0b0');

-- Tax periods for 2026 (quarterly, no permanent extension)
INSERT INTO public.tax_periods (fiscal_year, quarter, period_start, period_end, due_date, status) VALUES
  (2026,1,'2026-01-01','2026-03-31','2026-04-10','paid'),
  (2026,2,'2026-04-01','2026-06-30','2026-07-10','submitted'),
  (2026,3,'2026-07-01','2026-09-30','2026-10-10','open'),
  (2026,4,'2026-10-01','2026-12-31','2027-01-10','open');
