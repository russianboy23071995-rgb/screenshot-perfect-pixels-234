CREATE OR REPLACE FUNCTION public.finish_test_cleanup(p_document_ids uuid[], p_file_count integer, p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_settings public.settings%ROWTYPE; v_docs integer; v_tx integer; v_counters integer;
BEGIN
 SELECT * INTO v_settings FROM public.settings WHERE user_id = p_owner LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Einstellungen fehlen.'; END IF;
 IF EXISTS (SELECT 1 FROM public.documents WHERE user_id = p_owner AND is_demo AND NOT (id = ANY(p_document_ids))) OR EXISTS (SELECT 1 FROM public.documents WHERE user_id = p_owner AND id = ANY(p_document_ids) AND NOT is_demo) THEN RAISE EXCEPTION 'Neue Belege eingegangen. Bitte Löschung erneut starten.'; END IF;
 DELETE FROM public.documents WHERE user_id = p_owner AND is_demo;
 GET DIAGNOSTICS v_docs = ROW_COUNT;
 DELETE FROM public.transactions WHERE user_id = p_owner AND is_demo AND storno_of IS NOT NULL;
 GET DIAGNOSTICS v_counters = ROW_COUNT;
 DELETE FROM public.transactions WHERE user_id = p_owner AND is_demo;
 GET DIAGNOSTICS v_tx = ROW_COUNT;
 v_tx := v_tx + v_counters;
 INSERT INTO public.audit_log(user_id, entity_type, entity_id, action, actor, note, new_data, is_test) VALUES(p_owner, 'document', gen_random_uuid(), 'geaendert', 'nutzer', 'Testdaten gelöscht', jsonb_build_object('dateien', p_file_count, 'belege', v_docs, 'buchungen', v_tx), v_settings.test_mode);
 RETURN jsonb_build_object('files', p_file_count, 'documents', v_docs, 'transactions', v_tx);
END; $$;
REVOKE ALL ON FUNCTION public.finish_test_cleanup(uuid[], integer) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.finish_test_cleanup(uuid[], integer) IS 'DEPRECATED: replaced by service-role-only owner-scoped cleanup after storage deletion.';
REVOKE ALL ON FUNCTION public.finish_test_cleanup(uuid[], integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_test_cleanup(uuid[], integer, uuid) TO service_role;
DROP INDEX public.documents_user_sha256_unique;
CREATE UNIQUE INDEX documents_user_sha256_mode_unique ON public.documents(user_id, sha256, is_demo) WHERE sha256 IS NOT NULL;