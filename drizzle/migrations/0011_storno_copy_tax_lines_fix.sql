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
  INSERT INTO public.transactions(type, invoice_number, counterparty, counterparty_vat_id, description, category_id, invoice_date, service_date, payment_date, payment_status, net_cents, tax_rate, tax_cents, gross_cents, deductible, deductible_percent, deductible_tax_cents, payment_method, notes, fiscal_year, is_demo, user_id, booking_status, currency, original_net_cents, original_tax_cents, original_gross_cents, reverse_charge, tax_lines, tip_cents, input_tax_percent, bewirtung)
  VALUES(t.type, t.invoice_number, t.counterparty, t.counterparty_vat_id, t.description, t.category_id, t.invoice_date, t.service_date, t.payment_date, t.payment_status, t.net_cents, t.tax_rate, t.tax_cents, t.gross_cents, t.deductible, t.deductible_percent, t.deductible_tax_cents, t.payment_method, 'Korrektur zu stornierter Buchung ' || t.id::text, t.fiscal_year, t.is_demo, t.user_id, 'entwurf', t.currency, t.original_net_cents, t.original_tax_cents, t.original_gross_cents, t.reverse_charge, t.tax_lines, t.tip_cents, t.input_tax_percent, t.bewirtung) RETURNING id INTO v_copy;
  INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, new_data, note) VALUES(t.user_id, 'transaction', v_copy, 'angelegt', 'nutzer', (SELECT to_jsonb(x) FROM public.transactions x WHERE x.id = v_copy), 'Korrektur-Entwurf nach Storno');
 END IF;
 PERFORM set_config('app.storno', 'off', true);
 RETURN jsonb_build_object('storno_id',v_counter,'copy_id',v_copy);
END; $$;
GRANT EXECUTE ON FUNCTION public.storno_transaction(uuid, boolean) TO authenticated;