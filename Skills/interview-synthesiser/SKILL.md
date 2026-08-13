---
name: interview-synthesiser
description: Turns messy pasted interview notes, research notes, or transcripts into a short list of themes with a supporting quote each. Use this whenever the user pastes raw interview/research notes or a transcript and asks for themes, patterns, takeaways, or a summary of what people said — even if they don't use the word "synthesize" or name this skill explicitly.
---

# Interview Synthesiser

Turn messy interview notes into a short, clear list of themes.

## Steps

1. Read all the pasted notes or transcript in full before drawing any conclusions.
2. Group similar points, observations, and quotes together by underlying idea.
3. Name 3–5 themes that best summarize the groups (concise, descriptive labels — not full sentences).
4. For each theme, pull one supporting quote directly from the notes.

## Output format

A short list, one entry per theme:

```
**Theme name**
"Supporting quote from the notes."
```

## Guardrails

- Never include names or any patient-identifying detail — this applies to theme labels, quotes, and any surrounding text. If a pulled quote contains a name or identifying detail, redact it (e.g., replace with "[participant]") rather than omitting the theme.
- If the notes contain no usable quote for a theme, say so rather than inventing one.
