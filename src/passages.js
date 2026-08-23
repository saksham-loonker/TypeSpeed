export const PASSAGES = [
  {
    id: "balanced-1",
    title: "Balanced Control",
    level: "Mixed",
    text: "Calm hands make fast work. The quick typist keeps a steady rhythm, fixes only clear mistakes, and finishes with clean punctuation."
  },
  {
    id: "technical-1",
    title: "Technical Sprint",
    level: "Advanced",
    text: "Version 2.4 shipped at 09:30 with 17 fixes, 3 rollback checks, and a clear note: measure first, optimize second."
  },
  {
    id: "punctuation-1",
    title: "Punctuation Drill",
    level: "Focus",
    text: "Wait, check, continue; then stop. Clear writing needs commas, periods, colons, and semicolons in the right places."
  },
  {
    id: "numbers-1",
    title: "Numbers Drill",
    level: "Focus",
    text: "The order list has 14 pens, 27 clips, 39 cards, 58 labels, 60 folders, 82 tags, and 95 envelopes."
  },
  {
    id: "capitalization-1",
    title: "Capital Timing",
    level: "Focus",
    text: "Grace Hopper, Ada Lovelace, Katherine Johnson, and Margaret Hamilton turned careful typing into lasting systems."
  },
  {
    id: "rhythm-1",
    title: "Rhythm Builder",
    level: "Flow",
    text: "A steady typist does not rush the first word or fade on the last word. The best pace feels even from start to finish."
  }
];

export function getPassageById(id) {
  return PASSAGES.find(passage => passage.id === id) ?? PASSAGES[0];
}
