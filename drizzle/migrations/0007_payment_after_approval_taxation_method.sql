ALTER TABLE public.settings ADD COLUMN taxation_method text NOT NULL DEFAULT 'ist';
ALTER TABLE public.settings ADD CONSTRAINT settings_taxation_method_check CHECK (taxation_method IN ('soll','ist'));

CREATE OR REPLACE FUNCTION public.transactions_gobd_lock()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_payment_fill boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.booking_status IN ('freigegeben','storniert') AND NOT OLD.is_demo THEN
      RAISE EXCEPTION 'Festgeschriebene Buchungen dürfen nicht gelöscht werden (GoBD). Bitte stornieren.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.booking_status IN ('freigegeben','storniert') THEN
    -- Einmaliges Nachtragen der Zahlung bei freigegebenen Buchungen ohne Zahldatum
    v_payment_fill := OLD.booking_status = 'freigegeben' AND OLD.payment_date IS NULL;

    IF (NEW.type, NEW.invoice_number, NEW.counterparty, NEW.counterparty_vat_id, NEW.category_id,
        NEW.invoice_date, NEW.service_date, NEW.net_cents, NEW.tax_rate, NEW.tax_cents,
        NEW.gross_cents, NEW.deductible, NEW.deductible_percent, NEW.deductible_tax_cents, NEW.currency,
        NEW.original_net_cents, NEW.original_tax_cents, NEW.original_gross_cents, NEW.reverse_charge,
        NEW.user_id, NEW.storno_of)
       IS DISTINCT FROM
       (OLD.type, OLD.invoice_number, OLD.counterparty, OLD.counterparty_vat_id, OLD.category_id,
        OLD.invoice_date, OLD.service_date, OLD.net_cents, OLD.tax_rate, OLD.tax_cents,
        OLD.gross_cents, OLD.deductible, OLD.deductible_percent, OLD.deductible_tax_cents, OLD.currency,
        OLD.original_net_cents, OLD.original_tax_cents, OLD.original_gross_cents, OLD.reverse_charge,
        OLD.user_id, OLD.storno_of) THEN
      RAISE EXCEPTION 'Festgeschriebene Buchung (GoBD): Beträge, Daten, Partner, Rechnungsnummer, Kategorie und Steuerfelder sind gesperrt. Bitte stornieren.';
    END IF;

    IF NOT v_payment_fill AND (NEW.payment_date, NEW.payment_status, NEW.payment_method, NEW.fiscal_year)
       IS DISTINCT FROM (OLD.payment_date, OLD.payment_status, OLD.payment_method, OLD.fiscal_year) THEN
      RAISE EXCEPTION 'Zahlungsdaten einer festgeschriebenen Buchung sind bereits gesetzt und gesperrt. Korrektur nur per Storno.';
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