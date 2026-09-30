@AGENTS.md

## Public repository: no personal data, no secrets

This repository is public. Everything committed — code, seeds and demo data, mockups, SPEC
examples, prompts, tests, docs, commit messages — must be safe to publish.

- **No personal data**, of the maintainer or anyone else: no real names, employers, schools,
  courses or module codes, places, addresses, hobbies, colleagues, customers, calendars or
  e-mail addresses. Sample data is the invented persona in `seed.demo.json` (a self-employed
  designer who pots as a hobby); new examples follow it or stay generic. You may know real
  context about the maintainer — never use it to make sample data "realistic".
- **No secrets**: no passwords, tokens, API keys, private URLs or hostnames, not even as
  examples. Configuration comes from the environment; `.env.example` lists every variable
  with a harmless default. Real values live in `.env` (git-ignored) or the deployment.
- Before committing, read the diff for names, e-mail addresses, hostnames and key-like
  strings. When in doubt, leave it out and ask.
