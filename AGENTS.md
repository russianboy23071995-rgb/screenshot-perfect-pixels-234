<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Test/live classification is enforced by database insert triggers using owner settings; storno and correction copies inherit the original flag to prevent reclassification bypasses.
- Test cleanup removes owner-scoped storage files through an authenticated server function, then deletes only that owner's test rows and appends audit counts through a service-role-only RPC; browser callers cannot bypass storage deletion, and file failures retain metadata for retry.
- Finance reads filter test records by owner mode and aggregation helpers require explicit testMode to include tests; default excludes tests to fail closed.
- Rule tests use Vitest with a standalone alias configuration to avoid booting the application server during tests.
- Tax-line totals and separate expense/input-tax deductions use shared helpers; both booking editors use shared tax-line and hospitality controls to keep writes consistent with database invariants. The supplied hospitality calculation remains unchanged.
- Backup exports authenticate a separate shared key before loading the privileged client, scope every read to the configured owner, and internally page Data API reads to avoid silent truncation; never use finance mode filters or write audit entries in backup handlers.
