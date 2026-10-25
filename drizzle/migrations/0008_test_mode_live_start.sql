ALTER TABLE public.settings ADD COLUMN test_mode boolean NOT NULL DEFAULT true;
UPDATE public.documents SET is_demo = true;
UPDATE public.transactions SET is_demo = true;
ALTER TABLE public.audit_log ADD COLUMN is_test boolean NOT NULL DEFAULT true;
ALTER TABLE public.audit_log ALTER COLUMN is_test SET DEFAULT false;
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
  IF (NEW.type, NEW.invoice_number, NEW.counterparty, NEW.counterparty_vat_id, NEW.category_id, NEW.invoice_date, NEW.service_date, NEW.net_cents, NEW.tax_rate, NEW.tax_cents, NEW.gross_cents, NEW.deductible, NEW.deductible_percent, NEW.deductible_tax_cents, NEW.currency, NEW.original_net_cents, NEW.original_tax_cents, NEW.original_gross_cents, NEW.reverse_charge, NEW.user_id, NEW.storno_of)
   IS DISTINCT FROM (OLD.type, OLD.invoice_number, OLD.counterparty, OLD.counterparty_vat_id, OLD.category_id, OLD.invoice_date, OLD.service_date, OLD.net_cents, OLD.tax_rate, OLD.tax_cents, OLD.gross_cents, OLD.deductible, OLD.deductible_percent, OLD.deductible_tax_cents, OLD.currency, OLD.original_net_cents, OLD.original_tax_cents, OLD.original_gross_cents, OLD.reverse_charge, OLD.user_id, OLD.storno_of)
  THEN RAISE EXCEPTION 'Festgeschriebene Buchung (GoBD): Finanzfelder sind gesperrt. Bitte stornieren.'; END IF;
  IF NOT v_payment_fill AND (NEW.payment_date, NEW.payment_status, NEW.payment_method, NEW.fiscal_year) IS DISTINCT FROM (OLD.payment_date, OLD.payment_status, OLD.payment_method, OLD.fiscal_year) THEN RAISE EXCEPTION 'Zahlungsdaten sind bereits gesetzt und gesperrt. Korrektur nur per Storno.'; END IF;
  IF NEW.booking_status IS DISTINCT FROM OLD.booking_status THEN
   IF OLD.booking_status = 'freigegeben' AND NEW.booking_status = 'storniert' AND coalesce(current_setting('app.storno', true), '') = 'on' THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Der Status kann nur über die Storno-Funktion geändert werden.';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_document_test_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NOT OLD.is_demo AND NEW.is_demo AND EXISTS (SELECT 1 FROM public.transactions WHERE id IN (OLD.transaction_id, NEW.transaction_id) AND booking_status IN ('freigegeben','storniert')) THEN RAISE EXCEPTION 'Live-Belege festgeschriebener Buchungen dürfen nicht als Test markiert werden.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER documents_test_flag_guard BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_document_test_flag();
CREATE OR REPLACE FUNCTION public.guard_live_start()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NOT OLD.test_mode AND NEW.test_mode THEN RAISE EXCEPTION 'Nach dem Live-Start kann der Testmodus nicht erneut eingeschaltet werden.'; END IF;
 IF OLD.test_mode AND NOT NEW.test_mode AND (EXISTS (SELECT 1 FROM public.documents WHERE user_id = OLD.user_id AND is_demo) OR EXISTS (SELECT 1 FROM public.transactions WHERE user_id = OLD.user_id AND is_demo)) THEN RAISE EXCEPTION 'Bitte zuerst alle Testdaten löschen.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER settings_live_start_guard BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.guard_live_start();
CREATE OR REPLACE FUNCTION public.stamp_test_mode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_mode boolean;
BEGIN
 SELECT test_mode INTO v_mode FROM public.settings WHERE user_id = NEW.user_id LIMIT 1 FOR SHARE;
 IF v_mode IS NULL THEN RAISE EXCEPTION 'Einstellungen des Besitzers fehlen.'; END IF;
 IF TG_TABLE_NAME = 'audit_log' THEN NEW.is_test := v_mode;
 ELSIF TG_TABLE_NAME = 'transactions' AND coalesce(current_setting('app.storno', true), '') = 'on' THEN NULL;
 ELSE NEW.is_demo := v_mode;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER transactions_stamp_test BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.stamp_test_mode();
CREATE TRIGGER documents_stamp_test BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.stamp_test_mode();
CREATE TRIGGER audit_stamp_test BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.stamp_test_mode();
CREATE OR REPLACE FUNCTION public.finish_test_cleanup(p_document_ids uuid[], p_file_count integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_settings public.settings%ROWTYPE; v_docs integer; v_tx integer; v_counters integer;
BEGIN
 SELECT * INTO v_settings FROM public.settings WHERE user_id = auth.uid() LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Einstellungen fehlen.'; END IF;
 IF EXISTS (SELECT 1 FROM public.documents WHERE user_id = auth.uid() AND is_demo AND NOT (id = ANY(p_document_ids))) OR EXISTS (SELECT 1 FROM public.documents WHERE user_id = auth.uid() AND id = ANY(p_document_ids) AND NOT is_demo) THEN RAISE EXCEPTION 'Neue Belege eingegangen. Bitte Löschung erneut starten.'; END IF;
 DELETE FROM public.documents WHERE user_id = auth.uid() AND is_demo;
 GET DIAGNOSTICS v_docs = ROW_COUNT;
 DELETE FROM public.transactions WHERE user_id = auth.uid() AND is_demo AND storno_of IS NOT NULL;
 GET DIAGNOSTICS v_counters = ROW_COUNT;
 DELETE FROM public.transactions WHERE user_id = auth.uid() AND is_demo;
 GET DIAGNOSTICS v_tx = ROW_COUNT;
 v_tx := v_tx + v_counters;
 INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, note, new_data, is_test) VALUES(auth.uid(), 'document', gen_random_uuid(), 'geaendert', 'nutzer', 'Testdaten gelöscht', jsonb_build_object('dateien', p_file_count, 'belege', v_docs, 'buchungen', v_tx), v_settings.test_mode);
 RETURN jsonb_build_object('files', p_file_count, 'documents', v_docs, 'transactions', v_tx);
END; $$;
REVOKE ALL ON FUNCTION public.finish_test_cleanup(uuid[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_test_cleanup(uuid[], integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.storno_transaction(p_id uuid, p_create_copy boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t public.transactions%ROWTYPE; v_counter uuid; v_copy uuid;
BEGIN
 SELECT * INTO t FROM public.transactions WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Buchung nicht gefunden.'; END IF;
 IF t.booking_status <> 'freigegeben' THEN RAISE EXCEPTION 'Nur freigegebene Buchungen können storniert werden.'; END IF;
 IF t.storno_of IS NOT NULL THEN RAISE EXCEPTION 'Eine Storno-Gegenbuchung kann nicht erneut storniert werden.'; END IF;
 PERFORM set_config('app.storno', 'on', true);
 INSERT INTO public.transactions(type, invoice_number, counterparty, counterparty_vat_id, description, category_id, invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents, deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id, booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge, storno_of, approved_at, approved_by)
 VALUES(t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, 'Storno: ' || t.description, t.category_id, t.invoice_date, t.service_date, t.payment_date, t.payment_status, -t.net_cents, t.tax_rate, -t.tax_cents, -t.gross_cents, t.deductible, t.deductible_percent, -t.deductible_tax_cents, t.payment_method, 'Gegenbuchung zu ' || t.id::text, t.fiscal_year, t.is_demo, t.user_id, 'freigegeben', t.currency, -t.original_net_cents, -t.original_tax_cents, -t.original_gross_cents, t.reverse_charge, t.id, now(), auth.uid()) RETURNING id INTO v_counter;
 UPDATE public.transactions SET booking_status = 'storniert', updated_at = now() WHERE id = t.id;
 INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, old_data, new_data, note)
 VALUES(t.user_id, 'transaction', t.id, 'storniert', 'nutzer', jsonb_build_object('booking_status','freigegeben'), jsonb_build_object('booking_status','storniert','storno_id',v_counter), 'Storniert durch Gegenbuchung'),
 (t.user_id, 'transaction', v_counter, 'angelegt', 'nutzer', NULL, (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_counter), 'Storno-Gegenbuchung');
 IF p_create_copy THEN
  INSERT INTO public.transactions(type, invoice_number, counterparty, counterparty_vat_id, description, category_id, invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents, deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id, booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge)
  VALUES(t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, t.description, t.category_id, t.invoice_date, t.service_date, t.payment_date, t.payment_status, t.net_cents, t.tax_rate, t.tax_cents, t.gross_cents, t.deductible, t.deductible_percent, t.deductible_tax_cents, t.payment_method, 'Korrektur zu stornierter Buchung ' || t.id::text, t.fiscal_year, t.is_demo, t.user_id, 'entwurf', t.currency, t.original_net_cents, t.original_tax_cents, t.original_gross_cents, t.reverse_charge) RETURNING id INTO v_copy;
  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, new_data, note) VALUES(t.user_id, 'transaction', v_copy, 'angelegt', 'nutzer', (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_copy), 'Korrektur-Entwurf nach Storno');
 END IF;
 PERFORM set_config('app.storno', 'off', true);
 RETURN jsonb_build_object('storno_id',v_counter,'copy_id',v_copy);
END; $$;
GRANT EXECUTE ON FUNCTION public.storno_transaction(uuid, boolean) TO authenticated;