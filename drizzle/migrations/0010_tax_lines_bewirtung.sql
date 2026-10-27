-- 0010: Mehrere Steuersätze je Buchung, Trinkgeld, Vorsteuer-Quote getrennt von der Betriebsausgaben-Quote,
-- Bewirtungsangaben (§ 4 Abs. 5 Nr. 2 / Abs. 7 EStG). Regel: BEWIRTUNG-BERECHNUNG.md 1.0.
--
-- Invariante je Buchung (per Trigger geprüft):
--   net_cents = Summe(tax_lines.net_cents) + tip_cents
--   tax_cents = Summe(tax_lines.tax_cents)
-- tax_rate bleibt als "Hauptsatz" (Satz mit dem größten Nettoanteil) für bestehende Anzeigen.
-- deductible_percent  = Anteil Betriebsausgabe (EÜR), z. B. 70 bei Bewirtung
-- input_tax_percent   = Anteil abziehbare Vorsteuer (USt-VA), z. B. 100 bei Bewirtung

-- 1) Neue Spalten (vor dem neuen GoBD-Trigger, damit das Befüllen festgeschriebener Zeilen erlaubt ist)
ALTER TABLE public.transactions
  ADD COLUMN tax_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN tip_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN input_tax_percent numeric(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN bewirtung jsonb;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_tax_lines_is_array CHECK (jsonb_typeof(tax_lines) = 'array'),
  ADD CONSTRAINT transactions_input_tax_percent_range CHECK (input_tax_percent BETWEEN 0 AND 100);

-- 2) Bestand: eine Steuerzeile aus den bisherigen Feldern; Vorsteuer-Quote wie bisher berechnet
UPDATE public.transactions SET
  tax_lines = jsonb_build_array(jsonb_build_object('rate', tax_rate, 'net_cents', net_cents, 'tax_cents', tax_cents)),
  input_tax_percent = CASE WHEN type <> 'expense' THEN 100 WHEN deductible = 'no' THEN 0
                           WHEN deductible = 'partial' THEN deductible_percent ELSE 100 END;

-- 3) Steuerzeilen prüfen (und bei alten Schreibwegen ohne Zeilen aus den Summen bilden)
CREATE OR REPLACE FUNCTION public.transactions_check_tax_lines()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_net bigint; v_tax bigint; v_bad integer;
BEGIN
 IF NEW.tax_lines IS NULL OR jsonb_array_length(NEW.tax_lines) = 0 THEN
  NEW.tax_lines := jsonb_build_array(jsonb_build_object('rate', NEW.tax_rate, 'net_cents', NEW.net_cents - NEW.tip_cents, 'tax_cents', NEW.tax_cents));
 END IF;
 SELECT count(*) INTO v_bad FROM jsonb_array_elements(NEW.tax_lines) l
  WHERE jsonb_typeof(l->'rate') <> 'number' OR jsonb_typeof(l->'net_cents') <> 'number' OR jsonb_typeof(l->'tax_cents') <> 'number'
     OR (l->>'rate')::numeric < 0 OR (l->>'rate')::numeric > 100;
 IF v_bad > 0 THEN RAISE EXCEPTION 'Steuerzeilen ungültig: jede Zeile braucht rate (0–100), net_cents und tax_cents.'; END IF;
 SELECT coalesce(sum((l->>'net_cents')::bigint), 0), coalesce(sum((l->>'tax_cents')::bigint), 0)
   INTO v_net, v_tax FROM jsonb_array_elements(NEW.tax_lines) l;
 IF v_net + NEW.tip_cents <> NEW.net_cents OR v_tax <> NEW.tax_cents THEN
  RAISE EXCEPTION 'Steuerzeilen (netto % + Trinkgeld %, USt %) passen nicht zu den Summen (netto %, USt %).',
   v_net, NEW.tip_cents, v_tax, NEW.net_cents, NEW.tax_cents;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER transactions_tax_lines_check BEFORE INSERT OR UPDATE ON public.transactions
 FOR EACH ROW EXECUTE FUNCTION public.transactions_check_tax_lines();

-- 4) GoBD-Sperre (aus 0008) um die neuen Finanzfelder erweitert
CREATE OR REPLACE FUNCTION public.transactions_gobd_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_payment_fill boolean;
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD.booking_status IN ('freigegeben','storniert') AND NOT OLD.is_demo THEN RAISE EXCEPTION 'Festgeschriebene Buchungen dürfen nicht gelöscht werden (GoBD). Bitte stornieren.'; END IF;
  RETURN OLD;
 END IF;
 IF OLD.booking_status IN ('freigegeben','storniert') THEN
  IF NOT OLD.is_demo AND NEW.is_demo THEN RAISE EXCEPTION 'Live-Buchungen dürfen nicht als Testdaten markiert werden.'; END IF;
  v_payment_fill := OLD.booking_status = 'freigegeben' AND OLD.payment_date IS NULL;
  IF (NEW.type, NEW.invoice_number, NEW.counterparty, NEW.counterparty_vat_id, NEW.category_id, NEW.invoice_date, NEW.service_date, NEW.net_cents, NEW.tax_rate, NEW.tax_cents, NEW.gross_cents, NEW.deductible, NEW.deductible_percent, NEW.deductible_tax_cents, NEW.currency, NEW.original_net_cents, NEW.original_tax_cents, NEW.original_gross_cents, NEW.reverse_charge, NEW.user_id, NEW.storno_of, NEW.tax_lines, NEW.tip_cents, NEW.input_tax_percent, NEW.bewirtung)
   IS DISTINCT FROM (OLD.type, OLD.invoice_number, OLD.counterparty, OLD.counterparty_vat_id, OLD.category_id, OLD.invoice_date, OLD.service_date, OLD.net_cents, OLD.tax_rate, OLD.tax_cents, OLD.gross_cents, OLD.deductible, OLD.deductible_percent, OLD.deductible_tax_cents, OLD.currency, OLD.original_net_cents, OLD.original_tax_cents, OLD.original_gross_cents, OLD.reverse_charge, OLD.user_id, OLD.storno_of, OLD.tax_lines, OLD.tip_cents, OLD.input_tax_percent, OLD.bewirtung)
  THEN RAISE EXCEPTION 'Festgeschriebene Buchung (GoBD): Finanzfelder sind gesperrt. Bitte stornieren.'; END IF;
  IF NOT v_payment_fill AND (NEW.payment_date, NEW.payment_status, NEW.payment_method, NEW.fiscal_year) IS DISTINCT FROM (OLD.payment_date, OLD.payment_status, OLD.payment_method, OLD.fiscal_year) THEN RAISE EXCEPTION 'Zahlungsdaten sind bereits gesetzt und gesperrt. Korrektur nur per Storno.'; END IF;
  IF NEW.booking_status IS DISTINCT FROM OLD.booking_status THEN
   IF OLD.booking_status = 'freigegeben' AND NEW.booking_status = 'storniert' AND coalesce(current_setting('app.storno', true), '') = 'on' THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Der Status kann nur über die Storno-Funktion geändert werden.';
  END IF;
 END IF;
 RETURN NEW;
END; $$;

-- 5) Storno (aus 0008): Gegenbuchung negiert auch Steuerzeilen und Trinkgeld; Korrekturkopie übernimmt alles
CREATE OR REPLACE FUNCTION public.negate_tax_lines(p jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('rate', l->'rate', 'net_cents', -((l->>'net_cents')::bigint), 'tax_cents', -((l->>'tax_cents')::bigint))), '[]'::jsonb)
 FROM jsonb_array_elements(p) l
$$;

CREATE OR REPLACE FUNCTION public.storno_transaction(p_id uuid, p_create_copy boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t public.transactions%ROWTYPE; v_counter uuid; v_copy uuid;
BEGIN
 SELECT * INTO t FROM public.transactions WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Buchung nicht gefunden.'; END IF;
 IF t.booking_status <> 'freigegeben' THEN RAISE EXCEPTION 'Nur freigegebene Buchungen können storniert werden.'; END IF;
 IF t.storno_of IS NOT NULL THEN RAISE EXCEPTION 'Eine Storno-Gegenbuchung kann nicht erneut storniert werden.'; END IF;
 PERFORM set_config('app.storno', 'on', true);
 INSERT INTO public.transactions(type, invoice_number, counterparty, counterparty_vat_id, description, category_id, invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents, deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id, booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge, storno_of, approved_at, approved_by, tax_lines, tip_cents, input_tax_percent, bewirtung)
 VALUES(t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, 'Storno: ' || t.description, t.category_id, t.invoice_date, t.service_date, t.payment_date, t.payment_status, -t.net_cents, t.tax_rate, -t.tax_cents, -t.gross_cents, t.deductible, t.deductible_percent, -t.deductible_tax_cents, t.payment_method, 'Gegenbuchung zu ' || t.id::text, t.fiscal_year, t.is_demo, t.user_id, 'freigegeben', t.currency, -t.original_net_cents, -t.original_tax_cents, -t.original_gross_cents, t.reverse_charge, t.id, now(), auth.uid(), public.negate_tax_lines(t.tax_lines), -t.tip_cents, t.input_tax_percent, t.bewirtung) RETURNING id INTO v_counter;
 UPDATE public.transactions SET booking_status = 'storniert', updated_at = now() WHERE id = t.id;
 INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, old_data, new_data, note)
 VALUES(t.user_id, 'transaction', t.id, 'storniert', 'nutzer', jsonb_build_object('booking_status','freigegeben'), jsonb_build_object('booking_status','storniert','storno_id',v_counter), 'Storniert durch Gegenbuchung'),
 (t.user_id, 'transaction', v_counter, 'angelegt', 'nutzer', NULL, (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_counter), 'Storno-Gegenbuchung');
 IF p_create_copy THEN
  INSERT INTO public.transactions(type, invoice_number, counterparty, counterparty_vat_id, description, category_id, invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, tax_cents, gross_cents, deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id, booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge, tax_lines, tip_cents, input_tax_percent, bewirtung)
  VALUES(t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, t.description, t.category_id, t.invoice_date, t.service_date, t.payment_date, t.payment_status, t.net_cents, t.tax_rate, t.tax_cents, t.gross_cents, t.deductible, t.deductible_percent, t.deductible_tax_cents, t.payment_method, 'Korrektur zu stornierter Buchung ' || t.id::text, t.fiscal_year, t.is_demo, t.user_id, 'entwurf', t.currency, t.original_net_cents, t.original_tax_cents, t.original_gross_cents, t.reverse_charge, t.tax_lines, t.tip_cents, t.input_tax_percent, t.bewirtung) RETURNING id INTO v_copy;
  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, new_data, note) VALUES(t.user_id, 'transaction', v_copy, 'angelegt', 'nutzer', (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_copy), 'Korrektur-Entwurf nach Storno');
 END IF;
 PERFORM set_config('app.storno', 'off', true);
 RETURN jsonb_build_object('storno_id',v_counter,'copy_id',v_copy);
END; $$;
GRANT EXECUTE ON FUNCTION public.storno_transaction(uuid, boolean) TO authenticated;
