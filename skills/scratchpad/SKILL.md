---
name: scratchpad
description: Use when writing any temporary, intermediate, or throwaway file — scratch scripts, test fixtures, downloaded data, analysis output, notes between steps, or anything you would otherwise put in /tmp or the working tree. Also use when asked where the scratchpad is, what is in it, or to clean it up.
metadata:
  trigger: Creating temp files, intermediate results, throwaway scripts, or scratch output
---

# Scratchpad

Every session gets its own working directory, outside the user's project.
Use it for anything that is not a deliverable.

## Get the path

Call `scratchpad`. It returns an absolute path that already exists:

```
scratchpad()                    -> /tmp/codex-501/<project-slug>/<session>/scratchpad
scratchpad(subpath: "out.json") -> /tmp/codex-501/.../scratchpad/out.json
```

Passing `subpath` also creates the parent directories, so you can write to the
returned path immediately.

## What belongs here

- Intermediate results and data between steps of a multi-step task
- Throwaway scripts, config files, and test fixtures
- Output that does not belong in the user's project
- Working files during analysis or processing
- Anything that would otherwise go to `/tmp`

## What does not

- Files the user asked you to produce. Those go where the user expects them.
- Anything you need after this session ends. The directory is swept after seven
  days, and its name is tied to this session.

## Why it matters

The directory sits outside the repository, so nothing written there appears in
`git status` or risks being committed by accident. It is also scoped to this
session, so parallel work on the same project does not collide.

Write there directly — do not `mkdir` first, and do not check whether it exists.

## Housekeeping

- `scratchpad_list` — show what is in the current scratchpad, with sizes
- `scratchpad_present` — visibly return generated images and artifact links to
  the user; call it after creating user-facing visual output
- `scratchpad_clean(scope: "current")` — empty this session's directory
- `scratchpad_clean(scope: "old")` — remove directories from previous sessions

Only use `/tmp` directly if the user explicitly asks for it.
