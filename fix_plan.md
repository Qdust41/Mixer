# Fix Plan

## Completed

- [x] `tweet_like` tests: `user_fixture` missing `authorize?: false`, `Ash.Query.filter` needed `require Ash.Query`, `Ash.ForbiddenField.forbidden?/1` doesn't exist (use `match?`), `like` noop returned stale tweet struct → fixed all

## In Progress / Next

- [x] `unlike` noop returns stale tweet struct — same issue as `like` noop; reload from DB
- [x] `decrement_likes` can go below 0 — use `GREATEST(likes - 1, 0)` via SQL fragment

## Backlog

- [ ] No pagination on user list (`/users`)
- [ ] No CHECK constraint on `likes >= 0` at DB level (low priority, app logic prevents it)
- [ ] `read :following_feed` returns error if actor is nil — should be policy-guarded
- [ ] No search for users or tweets
- [ ] Missing test coverage: follow/unfollow, comments, tweet creation, auth flows

## Notes

- Stack: Elixir/Phoenix + Ash Framework + React/TypeScript
- Tests: `mix test` — 10 tests, all should pass
- Build: `mix precommit` alias runs compile + test + format checks
- No ClickHouse in test env (expected, non-fatal errors in test output)
