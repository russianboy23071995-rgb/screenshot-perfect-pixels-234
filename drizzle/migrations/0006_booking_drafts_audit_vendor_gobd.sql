ALTER TABLE public.transactions
  ADD COLUMN booking_status text NOT NULL DEFAULT 'entwurf',
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN original_net_cents bigint,
  ADD COLUMN original_tax_cents bigint,
  ADD COLUMN original_gross_cents bigint,
  ADD COLUMN counterparty_vat_id text,
  ADD COLUMN reverse_charge boolean NOT NULL DEFAULT false,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid,
  ADD COLUMN storno_of uuid REFERENCES public.transactions(id);

UPDATE public.transactions SET booking_status = 'freigegeben';

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_booking_status_check CHECK (booking_status IN ('entwurf','freigegeben','storniert'));

CREATE INDEX transactions_booking_status_idx ON public.transactions (user_id, booking_status);

-- Protokoll (nur anhängen)
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entity_type text NOT NULL CHECK (entity_type IN ('transaction','document')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('angelegt','geaendert','verknuepft','freigegeben','storniert','kein_beleg','dublette')),
  actor text NOT NULL CHECK (actor IN ('ki','system','nutzer')),
  old_data jsonb,
  new_data jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log own select" ON public.audit_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "audit_log own insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE INDEX audit_log_user_created_idx ON public.audit_log (user_id, created_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_id);

CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Das Protokoll ist unveränderbar: Einträge dürfen weder geändert noch gelöscht werden.';
END;
$$;
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_immutable();

-- Lernen je Anbieter
CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  counterparty_key text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  deductible text NOT NULL DEFAULT 'yes',
  deductible_percent numeric NOT NULL DEFAULT 100,
  default_description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, counterparty_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_profiles TO authenticated;
GRANT ALL ON public.vendor_profiles TO service_role;
ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendor_profiles own" ON public.vendor_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- GoBD-Festschreibung
CREATE OR REPLACE FUNCTION public.transactions_gobd_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.booking_status IN ('freigegeben','storniert') AND NOT OLD.is_demo THEN
      RAISE EXCEPTION 'Festgeschriebene Buchungen dürfen nicht gelöscht werden (GoBD). Bitte stornieren.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.booking_status IN ('freigegeben','storniert') THEN
    IF (NEW.type, NEW.invoice_number, NEW.counterparty, NEW.counterparty_vat_id, NEW.category_id,
        NEW.invoice_date, NEW.service_date, NEW.payment_date, NEW.net_cents, NEW.tax_rate, NEW.tax_cents,
        NEW.gross_cents, NEW.deductible, NEW.deductible_percent, NEW.deductible_tax_cents, NEW.currency,
        NEW.original_net_cents, NEW.original_tax_cents, NEW.original_gross_cents, NEW.reverse_charge,
        NEW.fiscal_year, NEW.user_id, NEW.storno_of)
       IS DISTINCT FROM
       (OLD.type, OLD.invoice_number, OLD.counterparty, OLD.counterparty_vat_id, OLD.category_id,
        OLD.invoice_date, OLD.service_date, OLD.payment_date, OLD.net_cents, OLD.tax_rate, OLD.tax_cents,
        OLD.gross_cents, OLD.deductible, OLD.deductible_percent, OLD.deductible_tax_cents, OLD.currency,
        OLD.original_net_cents, OLD.original_tax_cents, OLD.original_gross_cents, OLD.reverse_charge,
        OLD.fiscal_year, OLD.user_id, OLD.storno_of) THEN
      RAISE EXCEPTION 'Festgeschriebene Buchung (GoBD): Beträge, Daten, Partner, Rechnungsnummer, Kategorie und Steuerfelder sind gesperrt. Bitte stornieren.';
    END IF;
    IF NEW.booking_status IS DISTINCT FROM OLD.booking_status THEN
      IF OLD.booking_status = 'freigegeben' AND NEW.booking_status = 'storniert'
         AND coalesce(current_setting('app.storno', true), '') = 'on' THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Der Status einer festgeschriebenen Buchung kann nur über die Storno-Funktion geändert werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_gobd_lock BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.transactions_gobd_lock();

-- Storno-Funktion
CREATE OR REPLACE FUNCTION public.storno_transaction(p_id uuid, p_create_copy boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  t public.transactions%ROWTYPE;
  v_counter uuid;
  v_copy uuid;
BEGIN
  SELECT * INTO t FROM public.transactions WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Buchung nicht gefunden.'; END IF;
  IF t.booking_status <> 'freigegeben' THEN RAISE EXCEPTION 'Nur freigegebene Buchungen können storniert werden.'; END IF;
  IF t.storno_of IS NOT NULL THEN RAISE EXCEPTION 'Eine Storno-Gegenbuchung kann nicht erneut storniert werden.'; END IF;

  PERFORM set_config('app.storno', 'on', true);

  INSERT INTO public.transactions (type, invoice_number, counterparty, counterparty_vat_id, description, category_id,
    invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents,
    deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id,
    booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge,
    storno_of, approved_at, approved_by)
  VALUES (t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, 'Storno: ' || t.description, t.category_id,
    t.invoice_date, t.service_date, t.payment_date, t.payment_status, -t.net_cents, t.tax_rate, -t.tax_cents, -t.gross_cents,
    t.deductible, t.deductible_percent, -t.deductible_tax_cents, t.payment_method, 'Gegenbuchung zu ' || t.id::text,
    t.fiscal_year, t.is_demo, t.user_id, 'freigegeben', t.currency, -t.original_net_cents, -t.original_tax_cents,
    -t.original_gross_cents, t.reverse_charge, t.id, now(), auth.uid())
  RETURNING id INTO v_counter;

  UPDATE public.transactions SET booking_status = 'storniert', updated_at = now() WHERE id = t.id;

  INSERT INTO public.audit_log (user_id, entity_type, entity_id, action, actor, old_data, new_data, note)
  VALUES (t.user_id, 'transaction', t.id, 'storniert', 'nutzer', jsonb_build_object('booking_status', 'freigegeben'),
          jsonb_build_object('booking_status', 'storniert', 'storno_id', v_counter), 'Storniert durch Gegenbuchung'),
         (t.user_id, 'transaction', v_counter, 'angelegt', 'nutzer', NULL,
          (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_counter), 'Storno-Gegenbuchung');

  IF p_create_copy THEN
    INSERT INTO public.transactions (type, invoice_number, counterparty, counterparty_vat_id, description, category_id,
      invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents,
      deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id,
      booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge)
    VALUES (t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, t.description, t.category_id,
      t.invoice_date, t.service_date, t.payment_date, t.payment_status, t.net_cents, t.tax_rate, t.tax_cents, t.gross_cents,
      t.deductible, t.deductible_percent, t.deductible_tax_cents, t.payment_method,
      'Korrektur zu stornierter Buchung ' || t.id::text, t.fiscal_year, false, t.user_id,
      'entwurf', t.currency, t.original_net_cents, t.original_tax_cents, t.original_gross_cents, t.reverse_charge)
    RETURNING id INTO v_copy;
    INSERT INTO public.audit_log (user_id, entity_type, entity_id, action, actor, new_data, note)
    VALUES (t.user_id, 'transaction', v_copy, 'angelegt', 'nutzer',
            (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_copy), 'Korrektur-Entwurf nach Storno');
  END IF;

  RETURN jsonb_build_object('storno_id', v_counter, 'copy_id', v_copy);
END;
$$;
GRANT EXECUTE ON FUNCTION public.storno_transaction(uuid, boolean) TO authenticated;