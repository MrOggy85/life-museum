# Vision

## One line

**A museum of an ordinary life** — an archive of tiny video clips, endlessly
re-curated into rotating exhibitions, presented factually and in the third
person, as if documenting a stranger who lived long ago.

> This is not *me*. This is a person who lived a life. Almost as if it's a museum
> showing images, data, and facts about someone who lived 100 years ago.

The camera is just the data-collection mechanism. The product is the **curation**.

## The core design principle

**Meaning emerges from arrangement, not explanation.**

A museum curator decides what belongs together; the visitor decides what it
means. That single constraint keeps the system from becoming a storyteller or a
life coach. Restated as the rule every part of the system obeys:

> Never answer *"What does this mean?"* Only answer *"What else is like this?"*

## What this is NOT

This section matters as much as the vision. The idea only became itself by
rejecting a series of tempting, more conventional framings. Each was considered
and discarded. (See `chatgpt-session.txt` for the full arc.)

- **Not nostalgia.** No "1 year ago today," no "On This Day," no recap movies
  designed to induce longing for the past. The goal is not to remember.
- **Not a journal or a coach.** No "maybe take a walk after work," no "you
  haven't been to a park in three weeks." The app does not nag, advise, or set
  goals. Being nudged is the thing to avoid.
- **Not self-improvement.** The subject is not a problem to optimize. No
  "hypothesis: you're happier when you leave before 9 AM."
- **Not insight-generation.** Observations steal attention, and every insight has
  an alternative cost (why surface *this* one instead of another?). Boring,
  obvious "insights" are worse than none.
- **Not "you seemed happy."** No emotional interpretation, no unverifiable
  claims. That is speculation, not observation.
- **Not another photo gallery.** Apple Photos and Google Photos already do
  chronological storage and search extremely well. This is not that.

The failure mode is drifting back into any of the above. A language model will do
so by default; resisting it is the discipline of the project.

## What this IS (with examples)

An **archive**, curated like a natural-history museum: it collects specimens;
stories emerge from arrangement, and no story is told.

**Specimens presented as evidence, not memories.** A capture is shown with
factual metadata and nothing else:

```
Specimen #8,421
Captured Tuesday, July 2, 2026 · 18:14 JST
Temperature: 31.2°C · Duration: 2.3 seconds
Location: 35.699° N, 139.570° E
Ambient sound: traffic, birds, conversation · Motion: walking
```

No commentary. No "you seemed happy." Just evidence.

**Rotating exhibitions built around a thesis, not a date.** Instead of "Summer
2028," the organizing dimension is an observation:

- **Thresholds** — apartment door, entering a train, walking into a café, leaving
  work, entering a forest, boarding a ferry.
- **Waiting** — elevators, train platforms, crosswalks, coffee brewing, standing
  in line. Says something about being human without saying anything.
- **Hands** — hands cooking, typing, holding a child, repairing a bicycle. The
  person slowly ages through their hands. No narration required.
- **Blue** — morning sky, ocean, a blue train seat, a monitor at midnight, rain.
- **The First Warm Day** — one clip from each year; the rhythm of time is felt
  without ever seeing a calendar.
- **Circular Objects** — coffee mug, train wheel, clock, plate, camera lens, moon.

The commonality is never explained beyond the title. Dates may be withheld until
after viewing ("Recorded between 2026 and 2034").

**Facts presented as museum placards, not charts.** Instead of "you visited cafés
48 times," → "48 distinct café interiors were documented." Instead of a bar
chart, → "Most-revisited place that isn't home or work: a bench," followed by
every clip from that bench across seven years.

**Scarcity.** Behind the gallery sits a permanent, ever-growing collection of
exhibitions. The floor shows only a little at a time, and it rotates each day. A
given exhibition may not resurface for a long while. Nothing is deleted — the
collection only grows; scarcity comes from what is *shown*, not from what is kept.

**The viewer makes the meaning.** After ten years, someone who never met the
subject could wander the exhibitions and begin to *observe* who this person was —
the way one comes to know a novelist by reading all their books.

## Honest scope

This is niche. It is closer to an art project than a productivity app, and it is
unlikely to be a product people pay for. It is worth building because it is
interesting — a durable foundation whose material stays fixed while the
perspective keeps changing, giving thousands of possible exhibitions from one
life.

## Related

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the parts realize this vision.
- [`CURATORS.md`](CURATORS.md) — the curators, the genuinely novel element.
- [`../CLAUDE.md`](../CLAUDE.md) — the doctrine as enforceable rules.
