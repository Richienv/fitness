# The Enhanced Food-Search Prompt

This is the specification-as-prompt for upgrading the food catalogue search to a
TikTok-grade experience: instant, forgiving, and bilingual. Hand this prompt to
any engineer (or model) and the resulting system should behave identically.
The implementation that satisfies it lives in `lib/foodSearchEngine.ts`,
`app/api/foods/search/route.ts`, `lib/foodAliases.ts`, and
`app/meal/FoodBuilder.tsx`.

---

## The Prompt

> Build a search/query/indexing system for a food catalogue (~thousands of
> rows, Indonesian names with optional English names) that feels like TikTok
> search: results appear as you type, never flicker, forgive typos, and
> understand both languages. Concretely:
>
> **1. Speed — search must never wait on the database.**
> - Load the whole catalogue into process memory once per server instance and
>   refresh it on a TTL (minutes). Every keystroke is answered from RAM —
>   zero SQL per query.
> - Cache computed result lists in an LRU with a short TTL, keyed by
>   normalized query + filters, so repeated and debounced queries are O(1).
> - On the client, keep a session cache of query → results so backspacing or
>   retyping a term renders instantly, debounce short (~150 ms), abort stale
>   in-flight requests, and never blank the list while a new query loads.
>
> **2. Typo tolerance — "dagin cincang" must find "daging cincang".**
> - Build a vocabulary of every word that appears in the indexed names.
> - When a typed word is not in the vocabulary, correct it with bounded
>   Damerau–Levenshtein distance (1 edit for words of 4–7 letters, 2 edits
>   for 8+; transpositions count as one edit). Prefer corrections that occur
>   in more documents.
> - Corrected words score slightly below exactly-typed words so precise
>   queries still win ties.
> - Prefix matching is free: "cinc" matches "cincang" without correction.
>
> **3. Bilingual understanding — "beef minced" must find "daging sapi cincang".**
> - Maintain a token-level EN↔ID synonym dictionary for food words
>   (beef↔sapi/daging, minced/ground↔cincang/giling, chicken↔ayam, …).
>   Expand every query token through it, in both directions.
> - Compose translation with typo correction: "beff minced" → beef → sapi.
> - Keep the existing phrase-level alias map (siomay/somay, sate/satay,
>   nasgor→nasi goreng) for spelling variants of whole dish names.
>
> **4. Ranking — the right row lands first.**
> - Word order must not matter ("minced beef" ≡ "beef minced").
> - Tiered relevance: exact name > exact English name > name prefix > whole
>   word > substring > recall-bag (searchText) hit; synonym hits just below
>   native hits; fuzzy hits below those.
> - Reward covering all query words; mix in the static popularity prior;
>   penalize long names so specific entries beat verbose ones.
> - Require every query word to match somewhere (typo/synonym expansion
>   counts). If that yields nothing, relax to any-word so the user never
>   stares at an empty list.
>
> **5. Keep everything testable and portable.**
> - The engine is pure TypeScript (no DB, no pg extensions) with unit tests
>   for the typo, bilingual, ranking, and relaxation behaviours.
> - The API contract (`GET /api/foods/search?q=&group=`) and response shape
>   do not change; browse-by-group mode keeps working.

---

## How the implementation maps to the prompt

| Prompt requirement | Where it lives |
| --- | --- |
| In-memory catalogue index + TTL refresh | `app/api/foods/search/route.ts` (`getIndex`) |
| LRU result cache | `app/api/foods/search/route.ts` (`cacheGet`/`cacheSet`) |
| Client cache + short debounce + abort | `app/meal/FoodBuilder.tsx` search effect |
| Damerau–Levenshtein typo correction | `lib/foodSearchEngine.ts` (`boundedEditDistance`, `fuzzyExpand`) |
| EN↔ID token synonyms | `lib/foodSearchEngine.ts` (`SYNONYM_GROUPS`) |
| Phrase-level dish aliases | `lib/foodAliases.ts` |
| Tiered scoring + popularity + coverage | `lib/foodSearchEngine.ts` (`search`) |
| Unit tests | `lib/foodSearchEngine.test.ts` (`npm test`) |
